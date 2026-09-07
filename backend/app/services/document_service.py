import logging
import time
from fastapi import UploadFile

from app.utils.validators import validate_file_extension, validate_file_size, FileValidationError
from app.utils.file_utils import generate_document_id, save_uploaded_file, sanitize_filename
from app.services.extraction_service import extract_text, ExtractionError
from app.utils.text_utils import chunk_text
from app.services.entity_service import (
    extract_entities_for_document,
    resolve_similar_entities,
    build_entity_lookup,
    EntityExtractionError,
)
from app.services.relationship_service import (
    extract_relationships_from_chunk,
    extract_cross_chunk_relationships,
    normalize_relationships,
    RelationshipExtractionError,
)
from app.repositories.graph_repository import (
    upsert_project,
    upsert_document,
    upsert_entity,
    upsert_relationship,
    GraphStorageError,
)
from app.database.neo4j import GraphConnectionError
from app.services.embedding_service import store_chunk_embeddings, EmbeddingError
from app.repositories.project_repository import project_exists
from app.repositories.document_repository import (
    create_document,
    update_document_status,
    list_documents_by_project,
    get_document_row,
)

logger = logging.getLogger(__name__)


class ProjectNotFoundError(Exception):
    pass


DOCUMENT_PREVIEW_STORE = {}


def start_document_upload(file: UploadFile, project_id: str) -> dict:
    """
    Fast path: validates the file, saves it, and creates its SQLite row with
    status UPLOADED. Returns immediately - the heavy AI pipeline runs
    afterward as a background task (process_document below), so the HTTP
    request never blocks on slow Gemini calls.
    """
    if not project_exists(project_id):
        raise ProjectNotFoundError(f"Project '{project_id}' not found. Create it first.")

    validate_file_extension(file.filename)
    validate_file_size(file)

    document_id = generate_document_id()
    file_path = save_uploaded_file(file, document_id)
    safe_name = sanitize_filename(file.filename)

    create_document(document_id, project_id, safe_name, file_path, "UPLOADED")
    DOCUMENT_PREVIEW_STORE[document_id] = {"chunks": [], "entities": [], "relationships": []}

    return {
        "document_id": document_id,
        "file_name": safe_name,
        "status": "UPLOADED",
        "message": "File uploaded. Processing has started in the background.",
    }


def process_document(document_id: str, project_id: str):
    """
    The full AI pipeline: extraction, chunking, entities, entity resolution,
    per-chunk + cross-chunk relationships, graph storage, embeddings. Runs as
    a background task - every failure must be caught and logged here, since
    there's no HTTP request left to return an error to by the time this runs.
    """
    row = get_document_row(document_id)
    if row is None:
        logger.error(f"process_document called for unknown document_id={document_id}")
        return

    file_path = row["file_path"]
    safe_name = row["file_name"]

    try:
        update_document_status(document_id, "EXTRACTING_TEXT")
        pages = extract_text(file_path, safe_name)

        update_document_status(document_id, "CHUNKING")
        chunks = chunk_text(pages, document_id, safe_name)
        DOCUMENT_PREVIEW_STORE[document_id]["chunks"] = chunks

        update_document_status(document_id, "EXTRACTING_ENTITIES")
        normalized_entities, chunk_entities_map = extract_entities_for_document(chunks)

        # Enhancement: semantic entity resolution (e.g. "ML" + "Machine Learning" -> one node)
        normalized_entities, alias_map = resolve_similar_entities(normalized_entities)
        DOCUMENT_PREVIEW_STORE[document_id]["entities"] = normalized_entities

        update_document_status(document_id, "EXTRACTING_RELATIONSHIPS")
        valid_entity_keys, display_name_map = build_entity_lookup(normalized_entities)

        all_relationships = []
        for chunk in chunks:
            entities_in_chunk = chunk_entities_map.get(chunk["chunk_id"], [])
            try:
                rels, was_cached = extract_relationships_from_chunk(chunk["text"], entities_in_chunk)
                all_relationships.extend(rels)
            except RelationshipExtractionError as e:
                logger.warning(f"Skipping relationships for chunk {chunk['chunk_id']}: {e}")
                continue
            if not was_cached:
                time.sleep(1.5)  # only pace real API calls, not cache hits

        # Enhancement: cross-chunk relationships - one extra Gemini call to catch
        # connections between entities that never appeared in the same chunk
        cross_chunk_rels = extract_cross_chunk_relationships(chunks, chunk_entities_map, normalized_entities)
        all_relationships.extend(cross_chunk_rels)

        relationships = normalize_relationships(all_relationships, valid_entity_keys, display_name_map, alias_map)
        DOCUMENT_PREVIEW_STORE[document_id]["relationships"] = relationships

        update_document_status(document_id, "BUILDING_GRAPH")
        upsert_project(project_id)
        upsert_document(project_id, document_id, safe_name)

        for entity in normalized_entities:
            upsert_entity(project_id, document_id, entity["name"], entity["type"])

        for rel in relationships:
            upsert_relationship(
                project_id, document_id, rel["source"], rel["relation"], rel["target"], rel["confidence"]
            )

        update_document_status(document_id, "CREATING_EMBEDDINGS")
        store_chunk_embeddings(chunks, project_id)

        update_document_status(document_id, "COMPLETED")
        logger.info(f"Document {document_id} processed successfully.")

    except ExtractionError as e:
        update_document_status(document_id, "FAILED", error_message=str(e))
    except EntityExtractionError as e:
        update_document_status(document_id, "FAILED", error_message=str(e))
    except (GraphStorageError, GraphConnectionError) as e:
        update_document_status(document_id, "FAILED", error_message=str(e))
    except EmbeddingError as e:
        update_document_status(document_id, "FAILED", error_message=str(e))
    except Exception as e:
        logger.error(f"Unexpected error processing document {document_id}: {e}")
        update_document_status(
            document_id, "FAILED", error_message="An unexpected error occurred while processing this document."
        )


def list_documents(project_id: str) -> list:
    rows = list_documents_by_project(project_id)
    return [{"document_id": r["id"], "file_name": r["file_name"], "status": r["status"]} for r in rows]


def get_document(document_id: str) -> dict | None:
    row = get_document_row(document_id)
    if row is None:
        return None
    return {
        "document_id": row["id"],
        "file_name": row["file_name"],
        "status": row["status"],
        "error_message": row["error_message"],
    }


def get_document_chunks(document_id: str) -> list | None:
    preview = DOCUMENT_PREVIEW_STORE.get(document_id)
    return preview["chunks"] if preview else None


def get_document_entities(document_id: str) -> list | None:
    preview = DOCUMENT_PREVIEW_STORE.get(document_id)
    return preview["entities"] if preview else None


def get_document_relationships(document_id: str) -> list | None:
    preview = DOCUMENT_PREVIEW_STORE.get(document_id)
    return preview["relationships"] if preview else None