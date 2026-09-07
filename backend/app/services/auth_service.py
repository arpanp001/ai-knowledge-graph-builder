from app.repositories.user_repository import create_user, get_user_by_email
from app.utils.security import hash_password, verify_password, create_access_token


class AuthError(Exception):
    """Raised for any registration/login failure - deliberately generic on
    login failures so we don't reveal whether an email exists in our system."""
    pass


def register_user(name: str, email: str, password: str) -> dict:
    if get_user_by_email(email) is not None:
        raise AuthError("An account with this email already exists.")

    if len(password) < 8:
        raise AuthError("Password must be at least 8 characters long.")

    password_hash = hash_password(password)
    user = create_user(name, email, password_hash)

    token = create_access_token(user["id"])
    return {"access_token": token, "user": user}


def login_user(email: str, password: str) -> dict:
    user_row = get_user_by_email(email)

    # Deliberately identical error whether the email doesn't exist or the
    # password is wrong - don't give an attacker a way to enumerate valid emails.
    if user_row is None or not verify_password(password, user_row["password_hash"]):
        raise AuthError("Invalid email or password.")

    token = create_access_token(user_row["id"])
    user = {"id": user_row["id"], "name": user_row["name"], "email": user_row["email"]}
    return {"access_token": token, "user": user}