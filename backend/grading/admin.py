"""Admin-only API under /api/admin: creates and manages worker accounts.

Workers log in with a username and password; the username becomes <username>@farm.local in Supabase Auth,
which is never mailed. Every request must carry the caller's Supabase access token, and the caller must
be an active admin.
"""

import re

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from . import supabase_admin
from .config import FARM_EMAIL_DOMAIN, SUPABASE_SERVICE_KEY, SUPABASE_URL

router = APIRouter(prefix="/api/admin")

USERNAME = re.compile(r"^[a-z0-9._-]{3,32}$")
MIN_PASSWORD = 8


class NewWorker(BaseModel):
    username: str
    full_name: str
    password: str


class WorkerPatch(BaseModel):
    active: bool | None = None
    password: str | None = None


def _check_password(password: str) -> None:
    if len(password) < MIN_PASSWORD:
        raise HTTPException(400, f"Password must be at least {MIN_PASSWORD} characters")


async def require_admin(authorization: str | None = Header(None)) -> dict:
    """The caller's profile, when they are an active admin."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(503, "Supabase is not configured on the server")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in first")
    user = await run_in_threadpool(supabase_admin.get_user, authorization[7:].strip())
    if not user:
        raise HTTPException(401, "Your session has expired. Sign in again.")
    profile = await run_in_threadpool(supabase_admin.get_profile, user["id"])
    if not profile or profile["role"] != "admin" or not profile["active"]:
        raise HTTPException(403, "Only an admin can do this")
    return profile


@router.get("/workers")
async def list_workers(_: dict = Depends(require_admin)):
    return await run_in_threadpool(supabase_admin.list_profiles)


@router.post("/workers", status_code=201)
async def create_worker(body: NewWorker, _: dict = Depends(require_admin)):
    username = body.username.strip().lower()
    full_name = body.full_name.strip()
    if not USERNAME.match(username):
        raise HTTPException(400, "Username must be 3-32 characters: letters, numbers, dot, dash or underscore")
    if not full_name:
        raise HTTPException(400, "Full name is required")
    _check_password(body.password)
    if await run_in_threadpool(supabase_admin.username_taken, username):
        raise HTTPException(409, "Username already taken")

    try:
        user_id = await run_in_threadpool(
            supabase_admin.create_auth_user, f"{username}@{FARM_EMAIL_DOMAIN}", body.password
        )
    except RuntimeError as e:
        raise HTTPException(500, str(e)) from e
    try:
        return await run_in_threadpool(
            supabase_admin.insert_profile,
            {"id": user_id, "username": username, "full_name": full_name, "role": "worker"},
        )
    except RuntimeError as e:
        # No account without a profile: it could log in but would have no role.
        await run_in_threadpool(supabase_admin.delete_auth_user, user_id)
        raise HTTPException(500, f"Could not save the worker: {e}") from e


@router.patch("/workers/{user_id}")
async def update_worker(user_id: str, body: WorkerPatch, me: dict = Depends(require_admin)):
    profile = await run_in_threadpool(supabase_admin.get_profile, user_id)
    if not profile:
        raise HTTPException(404, "No such account")
    if body.active is False and user_id == me["id"]:
        raise HTTPException(400, "You cannot disable your own account")
    if body.password is not None:
        _check_password(body.password)

    try:
        if body.password is not None:
            await run_in_threadpool(
                lambda: supabase_admin.update_auth_user(user_id, password=body.password, banned=None)
            )
        if body.active is not None:
            await run_in_threadpool(
                lambda: supabase_admin.update_auth_user(user_id, password=None, banned=not body.active)
            )
            profile = await run_in_threadpool(supabase_admin.update_profile, user_id, {"active": body.active})
    except RuntimeError as e:
        raise HTTPException(500, str(e)) from e
    return profile
