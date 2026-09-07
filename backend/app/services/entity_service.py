import os
import logging
import time
import numpy as np
from google import genai
from google.genai import errors as genai_errors
from pydantic import ValidationError

from app.config.settings import GEMINI_API_KEY, GEMINI_MODEL, BASE_DIR
from app.schemas.entity import EntityExtractionResult, Entity
from app.utils.text_utils import normalize_key
from app.utils.gemini_retry import call_with_retry
from app.utils.hashing import hash_text
from app.repositories.cache_repository import get_cached_result, set_cached_result

logger = logging.getLogger(__name__)

_PROMPT_PATH = os.path.join(BASE_DIR, "app", "prompts", "entity_extraction.txt")
with open(_PROMPT_PATH, "r", encoding="utf-8") as f:
    _PROMPT_TEMPLATE = f.read()


class EntityExtractionError(Exception):
    """Raised when Gemini entity extraction fails in a way we can't recover from."""
    pass


def _get_client() -> genai.Client:
    if not GEMINI_API_KEY:
        raise EntityExtractionError(
            "GEMINI_API_KEY is not set. Add it to backend/.env before uploading documents."
        )
    return genai.Client(api_key=GEMINI_API_KEY)


def extract_entities_from_chunk(chunk_text: str) -> tuple[list[Entity], bool]:
    """Returns (entities, was_cached) - callers use was_cached to decide
    whether to apply rate-limit pacing (no need to wait after a cache hit,
    since no real API call happened)."""
    cache_key = f"entities:{hash_text(chunk_text)}"
    cached = get_cached_result(cache_key)
    if cached is not None:
        logger.info("Entity extraction cache hit - skipping Gemini call.")
        return [Entity(**e) for e in cached["entities"]], True

    client = _get_client()
    prompt = _PROMPT_TEMPLATE.format(text=chunk_text)

    try:
        response = call_with_retry(
            client.models.generate_content,
            model=GEMINI_MODEL,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": EntityExtractionResult,
            },
        )
    except genai_errors.APIError as e:
        logger.error(f"Gemini API error during entity extraction: {e}")
        raise EntityExtractionError(f"Gemini API error: {e.message if hasattr(e, 'message') else str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error calling Gemini: {e}")
        raise EntityExtractionError("Unexpected error while contacting Gemini.")

    try:
        result = EntityExtractionResult.model_validate_json(response.text)
    except ValidationError as e:
        logger.error(f"Gemini returned invalid entity structure: {e}")
        raise EntityExtractionError("Gemini returned data that didn't match the expected format.")

    set_cached_result(cache_key, result.model_dump())
    return result.entities, False


def normalize_entities(all_entities: list[Entity]) -> list[dict]:
    """Merges duplicate entities that differ only by casing/whitespace."""
    merged: dict[str, dict] = {}

    for entity in all_entities:
        key = normalize_key(entity.name)
        if key not in merged:
            merged[key] = {"name": entity.name.strip(), "type": entity.type, "mentions": 1}
        else:
            merged[key]["mentions"] += 1

    return list(merged.values())


def resolve_similar_entities(
    normalized_entities: list[dict], similarity_threshold: float = 0.88
) -> tuple[list[dict], dict[str, str]]:
    """
    Merges entities that are different strings but the same real-world concept
    (e.g. "ML" and "Machine Learning"), using embedding similarity. This
    catches what casing-only normalization (above) cannot. Runs entirely
    locally via Sentence Transformers - no extra Gemini call, no extra cost.

    Only merges entities of the SAME type, as a guard against merging two
    genuinely different concepts that just happen to sound similar.

    Returns:
      - the final, merged entity list
      - alias_map: maps every original normalized key (including ones that
        got merged away) to the canonical key it now belongs to, so
        relationships referencing an old name still resolve correctly.
    """
    if len(normalized_entities) < 2:
        alias_map = {normalize_key(e["name"]): normalize_key(e["name"]) for e in normalized_entities}
        return normalized_entities, alias_map

    from app.services.embedding_service import generate_embeddings, EmbeddingError

    names = [e["name"] for e in normalized_entities]
    try:
        vectors = np.array(generate_embeddings(names))
    except EmbeddingError as e:
        logger.warning(f"Skipping semantic entity resolution (embedding generation failed): {e}")
        alias_map = {normalize_key(e["name"]): normalize_key(e["name"]) for e in normalized_entities}
        return normalized_entities, alias_map

    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1
    unit_vectors = vectors / norms
    similarity_matrix = unit_vectors @ unit_vectors.T

    n = len(normalized_entities)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        root_i, root_j = find(i), find(j)
        if root_i != root_j:
            parent[root_j] = root_i

    for i in range(n):
        for j in range(i + 1, n):
            if normalized_entities[i]["type"] != normalized_entities[j]["type"]:
                continue
            if similarity_matrix[i][j] >= similarity_threshold:
                union(i, j)

    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)

    merged_entities = []
    alias_map = {}

    for indices in groups.values():
        # Keep whichever entity had the most mentions as the canonical display name
        indices_sorted = sorted(indices, key=lambda idx: normalized_entities[idx]["mentions"], reverse=True)
        canonical = normalized_entities[indices_sorted[0]]
        canonical_key = normalize_key(canonical["name"])
        total_mentions = sum(normalized_entities[idx]["mentions"] for idx in indices)

        merged_entities.append({"name": canonical["name"], "type": canonical["type"], "mentions": total_mentions})

        for idx in indices:
            alias_map[normalize_key(normalized_entities[idx]["name"])] = canonical_key

    return merged_entities, alias_map


def build_entity_lookup(normalized_entities: list[dict]) -> tuple[set[str], dict[str, str]]:
    valid_keys = set()
    display_map = {}
    for entity in normalized_entities:
        key = normalize_key(entity["name"])
        valid_keys.add(key)
        display_map[key] = entity["name"]
    return valid_keys, display_map


def extract_entities_for_document(chunks: list[dict]) -> tuple[list[dict], dict[str, list[Entity]]]:
    all_entities: list[Entity] = []
    chunk_entities_map: dict[str, list[Entity]] = {}

    for chunk in chunks:
        try:
            entities, was_cached = extract_entities_from_chunk(chunk["text"])
            chunk_entities_map[chunk["chunk_id"]] = entities
            all_entities.extend(entities)
        except EntityExtractionError as e:
            logger.warning(f"Skipping chunk {chunk['chunk_id']} due to extraction error: {e}")
            chunk_entities_map[chunk["chunk_id"]] = []
            continue
        if not was_cached:
            time.sleep(1.5)  # only pace real API calls, not cache hits

    if not all_entities:
        raise EntityExtractionError(
            "Could not extract any entities from this document. Check your Gemini API key and try again."
        )

    normalized = normalize_entities(all_entities)
    return normalized, chunk_entities_map