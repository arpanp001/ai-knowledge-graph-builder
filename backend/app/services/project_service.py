import logging
from app.repositories.project_repository import (
    create_project as repo_create_project,
    list_projects_for_user,
    get_project as repo_get_project,
    delete_project as repo_delete_project,
    project_exists,
)
from app.repositories.document_repository import delete_documents_by_project
from app.repositories.graph_repository import delete_project_graph, GraphStorageError
from app.services.embedding_service import delete_project_embeddings, EmbeddingError
from app.database.sqlite import get_connection

logger = logging.getLogger(__name__)


class ProjectNotFoundError(Exception):
    pass


def create_project(user_id: str, name: str, description: str | None) -> dict:
    return repo_create_project(user_id, name, description)


def list_projects(user_id: str) -> list[dict]:
    return list_projects_for_user(user_id)


def get_project(project_id: str) -> dict:
    project = repo_get_project(project_id)
    if project is None:
        raise ProjectNotFoundError(f"Project '{project_id}' not found.")
    return project


def verify_project_access(project_id: str, user_id: str) -> dict:
    """
    Confirms the project exists AND belongs to this user. Used by every
    project/document/chat route to enforce Section 28's user/project
    isolation requirement. Deliberately raises the same error whether the
    project doesn't exist or just isn't yours - don't leak which one it is.
    """
    project = repo_get_project(project_id)
    if project is None or project["user_id"] != user_id:
        raise ProjectNotFoundError(f"Project '{project_id}' not found.")
    return project


def delete_project(project_id: str, user_id: str):
    verify_project_access(project_id, user_id)

    conn = get_connection()
    conn.execute("DELETE FROM chat_messages WHERE project_id = ?", (project_id,))
    conn.commit()
    conn.close()

    delete_documents_by_project(project_id)

    try:
        delete_project_graph(project_id)
    except GraphStorageError as e:
        logger.warning(f"Could not fully delete Neo4j data for project {project_id}: {e}")

    try:
        delete_project_embeddings(project_id)
    except EmbeddingError as e:
        logger.warning(f"Could not fully delete ChromaDB data for project {project_id}: {e}")

    repo_delete_project(project_id)