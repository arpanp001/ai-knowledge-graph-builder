import logging
import chromadb

from app.config.settings import CHROMA_PATH

logger = logging.getLogger(__name__)

_client = None
_collection = None

COLLECTION_NAME = "document_chunks"


def get_collection():
    """
    Returns a singleton ChromaDB collection, creating the client and
    collection on first use. Data persists to disk at CHROMA_PATH.
    """
    global _client, _collection

    if _client is None:
        _client = chromadb.PersistentClient(path=CHROMA_PATH)

    if _collection is None:
        _collection = _client.get_or_create_collection(name=COLLECTION_NAME)

    return _collection