import time
import re
import logging
from google.genai import errors as genai_errors

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
DEFAULT_WAIT_SECONDS = 15


def call_with_retry(func, *args, **kwargs):
    """
    Calls func(*args, **kwargs) and automatically retries if Gemini responds
    with a rate-limit (429) or temporary-unavailable (503) error.
    Does NOT retry if the error is a daily quota limit - that won't recover
    within this session, so we fail fast instead of blocking the server.
    """
    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return func(*args, **kwargs)
        except genai_errors.APIError as e:
            status_code = getattr(e, "code", None)
            error_text = str(e)

            if status_code not in (429, 503):
                raise  # not transient - don't retry

            if "PerDay" in error_text:
                logger.error("Gemini daily free-tier quota exhausted. Not retrying - it won't recover today.")
                raise  # retrying is pointless until tomorrow

            last_error = e
            wait_seconds = _extract_retry_delay(error_text) or DEFAULT_WAIT_SECONDS
            wait_seconds = min(wait_seconds, 20)  # cap wait time so we never block the server for too long
            logger.warning(
                f"Gemini rate-limited or busy (attempt {attempt}/{MAX_RETRIES}). "
                f"Waiting {wait_seconds:.0f}s before retrying."
            )
            time.sleep(wait_seconds)

    raise last_error


def _extract_retry_delay(error_message: str) -> float | None:
    """Reads Google's suggested wait time out of the error text, if present."""
    match = re.search(r"retry in (\d+(\.\d+)?)s", error_message, re.IGNORECASE)
    if match:
        return float(match.group(1)) + 1
    return None