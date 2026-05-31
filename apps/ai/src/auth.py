import secrets

from fastapi import Header, HTTPException

from src.config import settings

INTERNAL_TOKEN_HEADER = "X-Internal-Token"


async def require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    """Gate internal endpoints behind a shared secret.

    When ``INTERNAL_AI_TOKEN`` is unset (local dev / tests) the check is a no-op.
    When set, the request must carry a matching ``X-Internal-Token`` header,
    compared in constant time to avoid a timing oracle. Returns nothing on
    success; raises 401 otherwise.
    """
    expected = settings.internal_ai_token
    if not expected:
        return
    if not x_internal_token or not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing internal token")
