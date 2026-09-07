import json
import logging
from datetime import datetime, timezone
from app.database.sqlite import get_connection

logger = logging.getLogger(__name__)


def get_cached_result(cache_key: str) -> dict | None:
    """Returns the cached JSON result for a key, or None on a cache miss."""
    conn = get_connection()
    row = conn.execute("SELECT result FROM gemini_cache WHERE cache_key = ?", (cache_key,)).fetchone()
    conn.close()

    if row is None:
        return None

    try:
        return json.loads(row["result"])
    except (json.JSONDecodeError, TypeError):
        logger.warning(f"Corrupt cache entry for key {cache_key}, ignoring.")
        return None


def set_cached_result(cache_key: str, result: dict):
    """Stores a JSON-serializable result under a cache key. Overwrites on conflict
    (shouldn't normally happen since keys are content hashes, but harmless if it does)."""
    conn = get_connection()
    conn.execute(
        "INSERT OR REPLACE INTO gemini_cache (cache_key, result, created_at) VALUES (?, ?, ?)",
        (cache_key, json.dumps(result), datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    conn.close()