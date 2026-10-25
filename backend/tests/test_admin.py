"""Tests for /api/admin/workers. Supabase is replaced by an in-memory fake of grading.supabase_admin."""

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from grading import admin, supabase_admin

ADMIN_ID = "admin-id"
WORKER_ID = "worker-id"


class FakeSupabase:
    def __init__(self):
        self.profiles = {
            ADMIN_ID: {"id": ADMIN_ID, "username": "boss", "full_name": "Boss", "role": "admin",
                       "active": True, "created_at": "2026-10-01T00:00:00Z"},
            WORKER_ID: {"id": WORKER_ID, "username": "juan", "full_name": "Juan", "role": "worker",
                        "active": True, "created_at": "2026-10-02T00:00:00Z"},
        }
        self.tokens = {"admin-token": ADMIN_ID, "worker-token": WORKER_ID}
        self.created: list[tuple[str, str]] = []
        self.deleted: list[str] = []
        self.updates: list[tuple[str, dict]] = []
        self.fail_profile_insert = False

    def get_user(self, token):
        uid = self.tokens.get(token)
        return {"id": uid} if uid else None

    def get_profile(self, user_id):
        return self.profiles.get(user_id)

    def list_profiles(self):
        return list(self.profiles.values())

    def username_taken(self, username):
        return any(p["username"] == username for p in self.profiles.values())

    def create_auth_user(self, email, password):
        self.created.append((email, password))
        return str(uuid.uuid4())

    def delete_auth_user(self, user_id):
        self.deleted.append(user_id)

    def update_auth_user(self, user_id, *, password=None, banned=None):
        self.updates.append((user_id, {"password": password, "banned": banned}))

    def insert_profile(self, row):
        if self.fail_profile_insert:
            raise RuntimeError("insert failed")
        full = {"active": True, "created_at": "2026-10-25T00:00:00Z", **row}
        self.profiles[row["id"]] = full
        return full

    def update_profile(self, user_id, fields):
        self.profiles[user_id].update(fields)
        return self.profiles[user_id]


@pytest.fixture
def fake(monkeypatch):
    f = FakeSupabase()
    for name in ("get_user", "get_profile", "list_profiles", "username_taken", "create_auth_user",
                 "delete_auth_user", "update_auth_user", "insert_profile", "update_profile"):
        monkeypatch.setattr(supabase_admin, name, getattr(f, name))
    monkeypatch.setattr(admin, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(admin, "SUPABASE_SERVICE_KEY", "service")
    return f


@pytest.fixture
def client():
    # Only the admin router, so the tests do not load the ONNX model.
    app = FastAPI()
    app.include_router(admin.router)
    return TestClient(app)


def auth(token="admin-token"):
    return {"Authorization": f"Bearer {token}"}


NEW = {"username": " Juan2 ", "full_name": "Juan Dela Cruz", "password": "secret123"}


def test_list_requires_token(client, fake):
    assert client.get("/api/admin/workers").status_code == 401


def test_list_rejects_bad_token(client, fake):
    assert client.get("/api/admin/workers", headers=auth("nope")).status_code == 401


def test_list_forbidden_for_worker(client, fake):
    assert client.get("/api/admin/workers", headers=auth("worker-token")).status_code == 403


def test_list_forbidden_for_disabled_admin(client, fake):
    fake.profiles[ADMIN_ID]["active"] = False
    assert client.get("/api/admin/workers", headers=auth()).status_code == 403


def test_list_workers(client, fake):
    r = client.get("/api/admin/workers", headers=auth())
    assert r.status_code == 200
    assert [p["username"] for p in r.json()] == ["boss", "juan"]


def test_create_worker(client, fake):
    r = client.post("/api/admin/workers", headers=auth(), json=NEW)
    assert r.status_code == 201
    body = r.json()
    assert body["username"] == "juan2"
    assert body["role"] == "worker"
    assert body["active"] is True
    assert fake.created == [("juan2@farm.local", "secret123")]


def test_create_duplicate_username_any_case(client, fake):
    r = client.post("/api/admin/workers", headers=auth(), json={**NEW, "username": "JUAN"})
    assert r.status_code == 409
    assert r.json()["detail"] == "Username already taken"
    assert fake.created == []


@pytest.mark.parametrize("username", ["ab", "juan dela", "x" * 33])
def test_create_rejects_bad_username(client, fake, username):
    r = client.post("/api/admin/workers", headers=auth(), json={**NEW, "username": username})
    assert r.status_code == 400
    assert fake.created == []


def test_create_rejects_short_password(client, fake):
    r = client.post("/api/admin/workers", headers=auth(), json={**NEW, "password": "short"})
    assert r.status_code == 400
    assert fake.created == []


def test_create_rolls_back_auth_user_when_profile_fails(client, fake):
    fake.fail_profile_insert = True
    r = client.post("/api/admin/workers", headers=auth(), json=NEW)
    assert r.status_code == 500
    assert len(fake.deleted) == 1
    assert fake.deleted[0] not in fake.profiles


def test_disable_worker(client, fake):
    r = client.patch(f"/api/admin/workers/{WORKER_ID}", headers=auth(), json={"active": False})
    assert r.status_code == 200
    assert r.json()["active"] is False
    assert (WORKER_ID, {"password": None, "banned": True}) in fake.updates


def test_enable_worker(client, fake):
    fake.profiles[WORKER_ID]["active"] = False
    r = client.patch(f"/api/admin/workers/{WORKER_ID}", headers=auth(), json={"active": True})
    assert r.status_code == 200
    assert r.json()["active"] is True
    assert (WORKER_ID, {"password": None, "banned": False}) in fake.updates


def test_reset_password(client, fake):
    r = client.patch(f"/api/admin/workers/{WORKER_ID}", headers=auth(), json={"password": "newpass123"})
    assert r.status_code == 200
    assert (WORKER_ID, {"password": "newpass123", "banned": None}) in fake.updates


def test_reset_password_too_short(client, fake):
    r = client.patch(f"/api/admin/workers/{WORKER_ID}", headers=auth(), json={"password": "short"})
    assert r.status_code == 400
    assert fake.updates == []


def test_admin_cannot_disable_self(client, fake):
    r = client.patch(f"/api/admin/workers/{ADMIN_ID}", headers=auth(), json={"active": False})
    assert r.status_code == 400
    assert r.json()["detail"] == "You cannot disable your own account"


def test_patch_unknown_id(client, fake):
    r = client.patch("/api/admin/workers/missing", headers=auth(), json={"active": False})
    assert r.status_code == 404


def test_not_configured(client, fake, monkeypatch):
    monkeypatch.setattr(admin, "SUPABASE_URL", "")
    assert client.get("/api/admin/workers", headers=auth()).status_code == 503
