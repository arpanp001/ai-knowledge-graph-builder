import logging
from sentence_transformers import SentenceTransformer

from app.config.settings import EMBEDDING_MODEL
from app.database.chromadb import get_collection

logger = logging.getLogger(__name__)

_model = None

# Simple in-memory cache for QUERY embeddings (not document chunk embeddings -
# those are already deduplicated by ChromaDB's upsert). Size-capped so repeat
# questions in chat don't re-run the embedding model, without growing unbounded.
_query_embedding_cache: dict[str, list[float]] = {}
_QUERY_CACHE_MAX_SIZE = 200


class EmbeddingError(Exception):
    """Raised when embedding generation or vector storage fails."""
    pass


def _get_model() -> SentenceTransformer:
    """
    Loads the embedding model once and reuses it - loading it fresh on every
    call would be slow, since it involves reading model weights from disk.
    """
    global _model
    if _model is None:
        logger.info(f"Loading embedding model: {EMBEDDING_MODEL} (first load may take a moment)")
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Converts a list of text strings into embedding vectors."""
    try:
        model = _get_model()
        embeddings = model.encode(texts, show_progress_bar=False)
        return embeddings.tolist()
    except Exception as e:
        logger.error(f"Embedding generation failed: {e}")
        raise EmbeddingError("Failed to generate embeddings for this document.")


def store_chunk_embeddings(chunks: list[dict], project_id: str):
    """
    Embeds and stores every chunk of a document in ChromaDB, with metadata
    that lets us later filter/scope searches to a specific project or document.
    """
    if not chunks:
        return

    texts = [chunk["text"] for chunk in chunks]
    embeddings = generate_embeddings(texts)

    ids = [f"{chunk['document_id']}_{chunk['chunk_id']}" for chunk in chunks]
    metadatas = [
        {
            "project_id": project_id,
            "document_id": chunk["document_id"],
            "file_name": chunk["file_name"],
            "page_number": chunk["page_number"],
            "chunk_id": chunk["chunk_id"],
        }
        for chunk in chunks
    ]

    try:
        collection = get_collection()
        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas,
        )
    except Exception as e:
        logger.error(f"ChromaDB storage failed: {e}")
        raise EmbeddingError("Failed to store document embeddings.")


def _get_cached_query_embedding(query_text: str) -> list[float]:
    """Returns a cached query embedding if we've seen this exact query text
    before, otherwise generates and caches it."""
    key = query_text.strip().lower()

    if key in _query_embedding_cache:
        return _query_embedding_cache[key]

    embedding = generate_embeddings([query_text])[0]

    if len(_query_embedding_cache) >= _QUERY_CACHE_MAX_SIZE:
        # Evict an arbitrary old entry rather than growing forever -
        # simple and sufficient for a single-user local dev cache.
        _query_embedding_cache.pop(next(iter(_query_embedding_cache)))

    _query_embedding_cache[key] = embedding
    return embedding


def similarity_search(query_text: str, project_id: str, n_results: int = 5) -> list[dict]:
    """
    Finds the chunks most semantically similar to the query, scoped to a project.
    Returns a list of dicts with text + metadata, ordered by relevance.
    """
    try:
        query_embedding = _get_cached_query_embedding(query_text)
        collection = get_collection()

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where={"project_id": project_id},
        )
    except Exception as e:
        logger.error(f"Similarity search failed: {e}")
        raise EmbeddingError("Failed to search document embeddings.")

    matches = []
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    for text, metadata, distance in zip(documents, metadatas, distances):
        matches.append({
            "text": text,
            "file_name": metadata.get("file_name"),
            "page_number": metadata.get("page_number"),
            "chunk_id": metadata.get("chunk_id"),
            "document_id": metadata.get("document_id"),
            "similarity_score": round(1 - distance, 4),  # convert distance to a 0-1 "closeness" score
        })

    return matches


def delete_document_embeddings(document_id: str):
    """Removes all chunks belonging to a specific document."""
    try:
        collection = get_collection()
        collection.delete(where={"document_id": document_id})
    except Exception as e:
        logger.error(f"Failed to delete embeddings for document {document_id}: {e}")
        raise EmbeddingError("Failed to delete document embeddings.")


def delete_project_embeddings(project_id: str):
    """Removes all chunks belonging to an entire project."""
    try:
        collection = get_collection()
        collection.delete(where={"project_id": project_id})
    except Exception as e:
        logger.error(f"Failed to delete embeddings for project {project_id}: {e}")
        raise EmbeddingError("Failed to delete project embeddings.")