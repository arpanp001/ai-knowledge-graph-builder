from app.config.settings import CHUNK_SIZE, CHUNK_OVERLAP


def chunk_text(pages: list[dict], document_id: str, file_name: str) -> list[dict]:
    """
    Split extracted page text into overlapping chunks.
    Each chunk keeps track of which page it came from.

    Returns a list of dicts like:
    {
        "document_id": "...",
        "file_name": "...",
        "page_number": 1,
        "chunk_id": "chunk_000",
        "text": "..."
    }
    """
    chunks = []
    chunk_index = 0

    for page in pages:
        text = page["text"]
        page_number = page["page_number"]
        start = 0

        while start < len(text):
            end = start + CHUNK_SIZE
            chunk_text_piece = text[start:end].strip()

            if chunk_text_piece:
                chunks.append({
                    "document_id": document_id,
                    "file_name": file_name,
                    "page_number": page_number,
                    "chunk_id": f"chunk_{chunk_index:03d}",
                    "text": chunk_text_piece,
                })
                chunk_index += 1

            start += CHUNK_SIZE - CHUNK_OVERLAP

    return chunks


def normalize_key(name: str) -> str:
    """
    Turns an entity name into a consistent comparison key so that
    "Python", "python", and "  Python " are all recognized as the same entity.
    Used by both entity normalization (Phase 5) and relationship validation (Phase 6)
    so the two stay in sync.
    """
    return " ".join(name.strip().lower().split())