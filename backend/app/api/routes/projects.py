from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from app.services.project_service import (
    create_project,
    list_projects,
    get_project,
    verify_project_access,
    delete_project,
    ProjectNotFoundError,
)
from app.schemas.project import ProjectCreate, ProjectResponse
from app.schemas.chat import ChatRequest, ChatResponse
from app.repositories.graph_repository import (
    get_project_graph,
    find_shortest_path,
    get_project_graph_counts,
    get_top_connected_entities,
    GraphStorageError,
)
from app.repositories.document_repository import list_documents_by_project
from collections import Counter
from app.database.neo4j import GraphConnectionError
from app.services.rag_service import answer_question, RAGError
from app.database.sqlite import get_connection
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("/", response_model=ProjectResponse)
def create(project: ProjectCreate, current_user: dict = Depends(get_current_user)):
    return create_project(current_user["id"], project.name, project.description)


@router.get("/", response_model=list[ProjectResponse])
def get_all(current_user: dict = Depends(get_current_user)):
    return list_projects(current_user["id"])


@router.get("/{project_id}", response_model=ProjectResponse)
def get_one(project_id: str, current_user: dict = Depends(get_current_user)):
    try:
        return verify_project_access(project_id, current_user["id"])
    except ProjectNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{project_id}")
def delete_one(project_id: str, current_user: dict = Depends(get_current_user)):
    try:
        delete_project(project_id, current_user["id"])
        return {"message": "Project and all its data were deleted."}
    except ProjectNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{project_id}/graph")
def get_graph(project_id: str, current_user: dict = Depends(get_current_user)):
    try:
        verify_project_access(project_id, current_user["id"])
        return get_project_graph(project_id)
    except ProjectNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (GraphStorageError, GraphConnectionError) as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/{project_id}/chat", response_model=ChatResponse)
def chat(project_id: str, request: ChatRequest, current_user: dict = Depends(get_current_user)):
    try:
        verify_project_access(project_id, current_user["id"])
    except ProjectNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Fetch recent history BEFORE inserting this new question, so the
    # current question doesn't appear twice in its own context
    conn = get_connection()
    history_rows = conn.execute(
        "SELECT role, message FROM chat_messages WHERE project_id = ? ORDER BY id ASC",
        (project_id,),
    ).fetchall()
    conn.close()
    conversation_history = [dict(row) for row in history_rows]

    try:
        result = answer_question(request.question, project_id, conversation_history)
    except RAGError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Something went wrong while answering your question.")

    conn = get_connection()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO chat_messages (project_id, role, message, created_at) VALUES (?, ?, ?, ?)",
        (project_id, "user", request.question, now),
    )
    conn.execute(
        "INSERT INTO chat_messages (project_id, role, message, created_at) VALUES (?, ?, ?, ?)",
        (project_id, "assistant", result["answer"], now),
    )
    conn.commit()
    conn.close()

    return result


@router.get("/{project_id}/chat/history")
def get_chat_history(project_id: str, current_user: dict = Depends(get_current_user)):
    try:
        verify_project_access(project_id, current_user["id"])
    except ProjectNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    conn = get_connection()
    rows = conn.execute(
        "SELECT role, message, created_at FROM chat_messages WHERE project_id = ? ORDER BY id ASC",
        (project_id,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]

@router.get("/{project_id}/graph/path")
def get_entity_path(project_id: str, source: str, target: str, current_user: dict = Depends(get_current_user)):
    """Finds the shortest connection path between two entities - a graph exploration tool."""
    try:
        verify_project_access(project_id, current_user["id"])
    except ProjectNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    try:
        result = find_shortest_path(project_id, source, target)
    except GraphStorageError as e:
        raise HTTPException(status_code=503, detail=str(e))

    if result is None:
        raise HTTPException(status_code=404, detail="No connection found between these entities.")
    return result

@router.get("/{project_id}/stats")
def get_project_stats(project_id: str, current_user: dict = Depends(get_current_user)):
    """
    Aggregated analytics for a project: document/entity/relationship counts,
    the most-connected ("hub") entities, and daily chat activity - all pulled
    from data we already store, no new tracking needed.
    """
    try:
        verify_project_access(project_id, current_user["id"])
    except ProjectNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    documents = list_documents_by_project(project_id)
    document_count = len(documents)

    try:
        graph_counts = get_project_graph_counts(project_id)
        top_entities = get_top_connected_entities(project_id, limit=5)
    except GraphStorageError:
        graph_counts = {"entity_count": 0, "relationship_count": 0}
        top_entities = []

    conn = get_connection()
    chat_rows = conn.execute(
        "SELECT created_at FROM chat_messages WHERE project_id = ? AND role = 'user'",
        (project_id,),
    ).fetchall()
    conn.close()

    chat_message_count = len(chat_rows)
    # Bucket messages by date (YYYY-MM-DD) for a simple daily activity view
    date_counts = Counter(row["created_at"][:10] for row in chat_rows)
    chat_activity = [{"date": date, "count": count} for date, count in sorted(date_counts.items())]

    return {
        "document_count": document_count,
        "entity_count": graph_counts["entity_count"],
        "relationship_count": graph_counts["relationship_count"],
        "chat_message_count": chat_message_count,
        "top_entities": top_entities,
        "chat_activity": chat_activity,
    }