from datetime import datetime, timezone
from app.database.sqlite import get_connection


def create_document(document_id: str, project_id: str, file_name: str, file_path: str, status: str):
    created_at = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    conn.execute(
        "INSERT INTO documents (id, project_id, file_name, file_path, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (document_id, project_id, file_name, file_path, status, created_at),
    )
    conn.commit()
    conn.close()


def update_document_status(document_id: str, status: str, error_message: str | None = None):
    conn = get_connection()
    conn.execute(
        "UPDATE documents SET status = ?, error_message = ? WHERE id = ?",
        (status, error_message, document_id),
    )
    conn.commit()
    conn.close()


def list_documents_by_project(project_id: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM documents WHERE project_id = ? ORDER BY created_at DESC", (project_id,)
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_document_row(document_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_documents_by_project(project_id: str):
    conn = get_connection()
    conn.execute("DELETE FROM documents WHERE project_id = ?", (project_id,))
    conn.commit()
    conn.close()