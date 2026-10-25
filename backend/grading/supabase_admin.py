"""Thin calls to Supabase with the service-role key. The only module that talks to Supabase.

The service key bypasses Row Level Security, so it must only ever live in the backend environment.
"""

import httpx

from . import config

_client = httpx.Client(timeout=10)


def _headers(token: str | None = None) -> dict[str, str]:
    return {
        "apikey": config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {token or config.SUPABASE_SERVICE_KEY}",
    }


def _check(res: httpx.Response) -> httpx.Response:
    if res.is_error:
        try:
            body = res.json()
            msg = body.get("msg") or body.get("message") or body.get("error_description") or res.text
        except ValueError:
            msg = res.text
        raise RuntimeError(f"Supabase error {res.status_code}: {msg}")
    return res


def _rest(path: str) -> str:
    return f"{config.SUPABASE_URL}/rest/v1/{path}"


def _auth(path: str) -> str:
    return f"{config.SUPABASE_URL}/auth/v1/{path}"


def get_user(token: str) -> dict | None:
    """The signed-in user for an access token, or None when the token is not valid."""
    res = _client.get(_auth("user"), headers={**_headers(token), "apikey": config.SUPABASE_SERVICE_KEY})
    if res.status_code in (401, 403):
        return None
    return _check(res).json()


def get_profile(user_id: str) -> dict | None:
    res = _check(_client.get(_rest("profiles"), headers=_headers(), params={"id": f"eq.{user_id}", "select": "*"}))
    rows = res.json()
    return rows[0] if rows else None


def list_profiles() -> list[dict]:
    res = _client.get(_rest("profiles"), headers=_headers(), params={"select": "*", "order": "full_name"})
    return _check(res).json()


def username_taken(username: str) -> bool:
    res = _client.get(_rest("profiles"), headers=_headers(), params={"username": f"eq.{username}", "select": "id"})
    return bool(_check(res).json())


def create_auth_user(email: str, password: str) -> str:
    """Creates an already-confirmed user (no email is sent) and returns its id."""
    res = _client.post(
        _auth("admin/users"),
        headers=_headers(),
        json={"email": email, "password": password, "email_confirm": True},
    )
    return _check(res).json()["id"]


def delete_auth_user(user_id: str) -> None:
    _check(_client.delete(_auth(f"admin/users/{user_id}"), headers=_headers()))


def update_auth_user(user_id: str, *, password: str | None = None, banned: bool | None = None) -> None:
    body: dict = {}
    if password is not None:
        body["password"] = password
    if banned is not None:
        # A ban blocks sign-in and token refresh; ~100 years is "until enabled again".
        body["ban_duration"] = "876000h" if banned else "none"
    if body:
        _check(_client.put(_auth(f"admin/users/{user_id}"), headers=_headers(), json=body))


def insert_profile(row: dict) -> dict:
    res = _client.post(_rest("profiles"), headers={**_headers(), "Prefer": "return=representation"}, json=row)
    return _check(res).json()[0]


def update_profile(user_id: str, fields: dict) -> dict:
    res = _client.patch(
        _rest("profiles"),
        headers={**_headers(), "Prefer": "return=representation"},
        params={"id": f"eq.{user_id}"},
        json=fields,
    )
    return _check(res).json()[0]
