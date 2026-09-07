from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks
from app.services.document_service import (
    start_document_upload,
    process_document,
    list_documents,
    get_document,
    get_document_chunks,
    get_document_entities,
    get_document_relationships,
    ProjectNotFoundError,
)
from app.services.project_service import verify_project_access, ProjectNotFoundError as ProjectAccessError
from app.api.dependencies import get_current_user
from app.utils.validators import FileValidationError
from app.services.embedding_service import similarity_search, EmbeddingError
from app.repositories.graph_repository import get_document_graph, GraphStorageError
from app.database.neo4j import GraphConnectionError
from app.schemas.document import DocumentResponse

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentResponse)
async def upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    project_id: str = Form(...),
    current_user: dict = Depends(get_current_user),
):
    try:
        verify_project_access(project_id, current_user["id"])
        result = start_document_upload(file, project_id)
    except ProjectAccessError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ProjectNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Something went wrong while uploading your document.")

    background_tasks.add_task(process_document, result["document_id"], project_id)
    return result


@router.get("/")
def get_all_documents(project_id: str, current_user: dict = Depends(get_current_user)):
    try:
        verify_project_access(project_id, current_user["id"])
    except ProjectAccessError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return list_documents(project_id)


@router.get("/{document_id}")
def get_one_document(document_id: str):
    document = get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return document


@router.get("/{document_id}/chunks")
def get_chunks(document_id: str):
    chunks = get_document_chunks(document_id)
    if chunks is None:
        raise HTTPException(status_code=404, detail="Document not found, or the server restarted since it was processed.")
    return chunks


@router.get("/{document_id}/entities")
def get_entities(document_id: str):
    entities = get_document_entities(document_id)
    if entities is None:
        raise HTTPException(status_code=404, detail="Document not found, or the server restarted since it was processed.")
    return entities


@router.get("/{document_id}/relationships")
def get_relationships(document_id: str):
    relationships = get_document_relationships(document_id)
    if relationships is None:
        raise HTTPException(status_code=404, detail="Document not found, or the server restarted since it was processed.")
    return relationships


@router.get("/{document_id}/graph")
def get_graph(document_id: str):
    try:
        return get_document_graph(document_id)
    except (GraphStorageError, GraphConnectionError) as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/search/semantic")
def search_chunks(q: str, project_id: str, limit: int = 5, current_user: dict = Depends(get_current_user)):
    try:
        verify_project_access(project_id, current_user["id"])
    except ProjectAccessError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="Query parameter 'q' is required.")
    try:
        return similarity_search(q, project_id, n_results=limit)
    except EmbeddingError as e:
        raise HTTPException(status_code=503, detail=str(e))