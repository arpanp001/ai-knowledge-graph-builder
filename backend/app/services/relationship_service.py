import os
import logging
from google import genai
from google.genai import errors as genai_errors
from pydantic import ValidationError

from app.config.settings import GEMINI_API_KEY, GEMINI_MODEL, BASE_DIR
from app.schemas.relationship import RelationshipExtractionResult, Relationship
from app.schemas.entity import Entity
from app.utils.text_utils import normalize_key
from app.utils.gemini_retry import call_with_retry
from app.utils.hashing import hash_text
from app.repositories.cache_repository import get_cached_result, set_cached_result

logger = logging.getLogger(__name__)

_PROMPT_PATH = os.path.join(BASE_DIR, "app", "prompts", "relationship_extraction.txt")
with open(_PROMPT_PATH, "r", encoding="utf-8") as f:
    _PROMPT_TEMPLATE = f.read()

_CROSS_CHUNK_PROMPT_PATH = os.path.join(BASE_DIR, "app", "prompts", "cross_chunk_relationship_extraction.txt")
with open(_CROSS_CHUNK_PROMPT_PATH, "r", encoding="utf-8") as f:
    _CROSS_CHUNK_PROMPT_TEMPLATE = f.read()


class RelationshipExtractionError(Exception):
    """Raised when Gemini relationship extraction fails in a way we can't recover from."""
    pass


def _get_client() -> genai.Client:
    if not GEMINI_API_KEY:
        raise RelationshipExtractionError(
            "GEMINI_API_KEY is not set. Add it to backend/.env before uploading documents."
        )
    return genai.Client(api_key=GEMINI_API_KEY)


def extract_relationships_from_chunk(chunk_text: str, entities_in_chunk: list[Entity]) -> tuple[list[Relationship], bool]:
    """
    Sends one chunk's text to Gemini and returns (relationships, was_cached).
    Checks the cache first so re-processing an identical chunk (e.g. a
    re-uploaded document) skips the real Gemini call entirely.
    """
    unique_names = {e.name for e in entities_in_chunk}
    if len(unique_names) < 2:
        return [], True  # no call needed - treat as "cached" so the caller skips pacing

    entity_list_str = ", ".join(sorted(unique_names))
    cache_key = f"relationships:{hash_text(chunk_text + '|' + entity_list_str)}"

    cached = get_cached_result(cache_key)
    if cached is not None:
        logger.info("Relationship extraction cache hit - skipping Gemini call.")
        return [Relationship(**r) for r in cached["relationships"]], True

    client = _get_client()
    prompt = _PROMPT_TEMPLATE.format(entities=entity_list_str, text=chunk_text)

    try:
        response = call_with_retry(
            client.models.generate_content,
            model=GEMINI_MODEL,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": RelationshipExtractionResult,
            },
        )
    except genai_errors.APIError as e:
        logger.error(f"Gemini API error during relationship extraction: {e}")
        raise RelationshipExtractionError(f"Gemini API error: {e.message if hasattr(e, 'message') else str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error calling Gemini: {e}")
        raise RelationshipExtractionError("Unexpected error while contacting Gemini.")

    try:
        result = RelationshipExtractionResult.model_validate_json(response.text)
    except ValidationError as e:
        logger.error(f"Gemini returned invalid relationship structure: {e}")
        raise RelationshipExtractionError("Gemini returned data that didn't match the expected format.")

    set_cached_result(cache_key, result.model_dump())
    return result.relationships, False


def _build_entity_context_snippets(
    chunks: list[dict], chunk_entities_map: dict[str, list[Entity]], max_snippet_chars: int = 300
) -> dict[str, str]:
    """Finds one representative chunk of text for each entity - the first chunk it appeared in."""
    chunk_text_by_id = {c["chunk_id"]: c["text"] for c in chunks}
    snippet_by_key: dict[str, str] = {}

    for chunk_id, entities in chunk_entities_map.items():
        text = chunk_text_by_id.get(chunk_id, "")
        for entity in entities:
            key = normalize_key(entity.name)
            if key not in snippet_by_key:
                snippet_by_key[key] = text[:max_snippet_chars]

    return snippet_by_key


def extract_cross_chunk_relationships(
    chunks: list[dict], chunk_entities_map: dict[str, list[Entity]], normalized_entities: list[dict]
) -> list[Relationship]:
    """
    Second pass: finds relationships between entities that never appeared in
    the same chunk together. One extra Gemini call per document, cached by
    the exact entity+snippet context so identical documents don't re-call
    Gemini. Failures here are non-fatal - we log and return an empty list
    rather than failing the whole upload over an enhancement feature.
    """
    if len(normalized_entities) < 2:
        return []

    snippet_by_key = _build_entity_context_snippets(chunks, chunk_entities_map)

    lines = []
    for entity in normalized_entities:
        key = normalize_key(entity["name"])
        snippet = snippet_by_key.get(key, "")
        lines.append(f'- {entity["name"]} ({entity["type"]}): "{snippet}"')

    entity_context_block = "\n".join(lines)

    # cache_key is computed unconditionally, right after we have the context
    # block, so every code path below can safely reference it.
    cache_key = f"cross_relationships:{hash_text(entity_context_block)}"

    cached = get_cached_result(cache_key)
    if cached is not None:
        logger.info("Cross-chunk relationship cache hit - skipping Gemini call.")
        return [Relationship(**r) for r in cached["relationships"]]

    try:
        client = _get_client()
    except RelationshipExtractionError as e:
        logger.warning(f"Skipping cross-chunk relationship pass: {e}")
        return []

    prompt = _CROSS_CHUNK_PROMPT_TEMPLATE.format(entity_context=entity_context_block)

    try:
        response = call_with_retry(
            client.models.generate_content,
            model=GEMINI_MODEL,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": RelationshipExtractionResult,
            },
        )
    except genai_errors.APIError as e:
        logger.warning(f"Cross-chunk relationship pass failed (non-fatal): {e}")
        return []
    except Exception as e:
        logger.warning(f"Unexpected error during cross-chunk relationship pass (non-fatal): {e}")
        return []

    try:
        result = RelationshipExtractionResult.model_validate_json(response.text)
    except ValidationError as e:
        logger.warning(f"Cross-chunk pass returned invalid structure (non-fatal): {e}")
        return []

    set_cached_result(cache_key, result.model_dump())
    return result.relationships


def normalize_relationships(
    all_relationships: list[Relationship],
    valid_entity_keys: set[str],
    display_name_map: dict[str, str],
    alias_map: dict[str, str] | None = None,
) -> list[dict]:
    """
    Deduplicates relationships and drops any whose source/target isn't a
    known entity. `alias_map` (from entity resolution) lets a relationship
    that references a pre-merge entity name still resolve to its canonical
    merged entity.
    """
    alias_map = alias_map or {}
    merged: dict[tuple[str, str, str], dict] = {}

    for rel in all_relationships:
        raw_source_key = normalize_key(rel.source)
        raw_target_key = normalize_key(rel.target)
        source_key = alias_map.get(raw_source_key, raw_source_key)
        target_key = alias_map.get(raw_target_key, raw_target_key)

        if source_key not in valid_entity_keys or target_key not in valid_entity_keys:
            continue
        if source_key == target_key:
            continue

        triple_key = (source_key, rel.relation, target_key)

        if triple_key not in merged:
            merged[triple_key] = {
                "source": display_name_map[source_key],
                "relation": rel.relation,
                "target": display_name_map[target_key],
                "confidence": 1,
            }
        else:
            merged[triple_key]["confidence"] += 1

    return list(merged.values())