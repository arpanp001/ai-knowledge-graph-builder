import uuid
from datetime import datetime, timezone
from app.database.sqlite import get_connection


def create_project(user_id: str, name: str, description: str | None) -> dict:
    project_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    conn = get_connection()
    conn.execute(
        "INSERT INTO projects (id, user_id, name, description, created_at) VALUES (?, ?, ?, ?, ?)",
        (project_id, user_id, name, description, created_at),
    )
    conn.commit()
    conn.close()

    return {"id": project_id, "name": name, "description": description, "created_at": created_at}


def list_projects_for_user(user_id: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC", (user_id,)
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_project(project_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def project_exists(project_id: str) -> bool:
    return get_project(project_id) is not None


def delete_project(project_id: str):
    conn = get_connection()
    conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    conn.commit()
    conn.close()