from fastapi import Header, HTTPException
from app.utils.security import decode_access_token
from app.repositories.user_repository import get_user_by_id


def get_current_user(authorization: str = Header(None)) -> dict:
    """
    FastAPI dependency that extracts and verifies the JWT from the
    Authorization header. Use this on any route that requires login:

        @router.get("/something")
        def handler(current_user: dict = Depends(get_current_user)):
            ...

    Raises 401 if the token is missing, invalid, expired, or the user
    no longer exists.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated.")

    token = authorization.removeprefix("Bearer ").strip()
    user_id = decode_access_token(token)

    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token. Please log in again.")

    user = get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User no longer exists.")

    return {"id": user["id"], "name": user["name"], "email": user["email"]}