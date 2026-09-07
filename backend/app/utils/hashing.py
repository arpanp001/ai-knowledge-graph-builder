import hashlib


def hash_text(text: str) -> str:
    """Deterministic hash used as a cache key for Gemini requests - identical
    input text always produces the same key, so repeated processing of the
    same chunk (e.g. re-uploading the same document) hits the cache instead
    of calling Gemini again."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()