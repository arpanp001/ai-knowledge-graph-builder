from fastapi import APIRouter, HTTPException, Depends
from app.services.auth_service import register_user, login_user, AuthError
from app.schemas.user import UserRegister, UserLogin, TokenResponse, UserResponse
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(request: UserRegister):
    try:
        result = register_user(request.name, request.email, request.password)
        return result
    except AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=TokenResponse)
def login(request: UserLogin):
    try:
        result = login_user(request.email, request.password)
        return result
    except AuthError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.get("/me", response_model=UserResponse)
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user