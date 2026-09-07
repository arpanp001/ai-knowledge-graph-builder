import os
import logging
from itertools import combinations
from google import genai
from google.genai import errors as genai_errors

from app.config.settings import GEMINI_API_KEY, GEMINI_MODEL, BASE_DIR
from app.services.embedding_service import similarity_search, EmbeddingError
from app.repositories.graph_repository import (
    get_all_entities_for_project,
    get_relationships_for_entities,
    find_shortest_path,
    GraphStorageError,
)
from app.utils.text_utils import normalize_key
from app.utils.gemini_retry import call_with_retry

logger = logging.getLogger(__name__)

_PROMPT_PATH = os.path.join(BASE_DIR, "app", "prompts", "question_answering.txt")
with open(_PROMPT_PATH, "r", encoding="utf-8") as f:
    _PROMPT_TEMPLATE = f.read()

NO_ANSWER_MESSAGE = "I could not find enough information in the uploaded documents to answer this question."

MAX_HISTORY_MESSAGES = 6
# How many entity pairs to try when looking for a multi-hop reasoning chain.
# Capped low since each attempt is a real Neo4j query - a question mentioning
# many entities shouldn't trigger an unbounded number of path searches.
MAX_PATH_PAIRS_TO_TRY = 4


class RAGError(Exception):
    pass


def _get_client() -> genai.Client:
    if not GEMINI_API_KEY:
        raise RAGError("GEMINI_API_KEY is not set. Add it to backend/.env.")
    return genai.Client(api_key=GEMINI_API_KEY)


def find_mentioned_entities(question: str, project_id: str) -> list[dict]:
    try:
        all_entities = get_all_entities_for_project(project_id)
    except GraphStorageError as e:
        logger.warning(f"Could not fetch entities for entity matching: {e}")
        return []

    question_normalized = normalize_key(question)
    matched = []
    for entity in all_entities:
        entity_key = entity["key"]
        if len(entity_key) >= 3 and entity_key in question_normalized:
            matched.append(entity)
    return matched


def find_reasoning_chain(matched_entities: list[dict], project_id: str) -> dict | None:
    """
    Looks for a multi-hop path connecting two of the entities mentioned in
    the question. This is what makes "Show Your Reasoning" possible - unlike
    get_relationships_for_entities (which only returns DIRECT edges), this
    can surface a chain like A -> USED_FOR -> B -> PART_OF -> C even when A
    and C have no direct relationship at all.

    Tries a bounded number of entity pairs, preferring the first genuine
    multi-hop result (more than 2 nodes) over a trivial direct edge, since a
    direct edge is already covered by the regular graph context.
    """
    if len(matched_entities) < 2:
        return None

    keys = [e["key"] for e in matched_entities]
    best_result = None

    for source_key, target_key in list(combinations(keys, 2))[:MAX_PATH_PAIRS_TO_TRY]:
        try:
            result = find_shortest_path(project_id, source_key, target_key)
        except GraphStorageError as e:
            logger.warning(f"Reasoning chain lookup failed for a pair (non-fatal): {e}")
            continue
        except Exception as e:
            # Never let an unexpected graph-query issue break the whole chat
            # response - reasoning chains are an enhancement, not core.
            logger.warning(f"Unexpected error during reasoning chain lookup (non-fatal): {e}")
            continue

        if result is None:
            continue
        # Defensive check: skip any result with malformed/incomplete node data,
        # rather than letting it propagate into a response validation error.
        if any(not n.get("key") or not n.get("name") or not n.get("type") for n in result.get("nodes", [])):
            logger.warning("Skipping a reasoning path result with incomplete node data.")
            continue

        if len(result["nodes"]) > 2:
            return result
        if best_result is None:
            best_result = result

    return best_result


def build_document_context(chunks: list[dict]) -> str:
    if not chunks:
        return "(No relevant document chunks found.)"
    parts = [f"[{c['file_name']}, page {c['page_number']}]\n{c['text']}" for c in chunks]
    return "\n\n".join(parts)


def build_graph_context(relationships: list[dict]) -> str:
    if not relationships:
        return "(No relevant graph relationships found.)"
    return "\n".join(f"{r['source']} {r['relation']} {r['target']}" for r in relationships)


def build_reasoning_chain_text(reasoning_path: dict | None) -> str:
    if not reasoning_path or len(reasoning_path["nodes"]) < 2:
        return "(No multi-hop reasoning chain found for this question.)"

    nodes = reasoning_path["nodes"]
    relations = reasoning_path["relations"]
    parts = [nodes[0]["name"]]
    for i, relation in enumerate(relations):
        parts.append(f"--[{relation}]--> {nodes[i + 1]['name']}")
    return " ".join(parts)


def build_conversation_context(history: list[dict] | None) -> str:
    if not history:
        return "(No previous conversation.)"
    recent = history[-MAX_HISTORY_MESSAGES:]
    lines = []
    for msg in recent:
        speaker = "User" if msg["role"] == "user" else "Assistant"
        lines.append(f"{speaker}: {msg['message']}")
    return "\n".join(lines)


def answer_question(question: str, project_id: str, conversation_history: list[dict] | None = None) -> dict:
    if not question or not question.strip():
        raise RAGError("Question cannot be empty.")

    try:
        chunk_matches = similarity_search(question, project_id, n_results=5)
    except EmbeddingError as e:
        logger.warning(f"Vector search failed, continuing with graph-only context: {e}")
        chunk_matches = []

    matched_entities = find_mentioned_entities(question, project_id)
    entity_keys = [e["key"] for e in matched_entities]

    try:
        relationships = get_relationships_for_entities(project_id, entity_keys)
    except GraphStorageError as e:
        logger.warning(f"Graph search failed, continuing with document-only context: {e}")
        relationships = []

    reasoning_path = find_reasoning_chain(matched_entities, project_id)

    if not chunk_matches and not relationships and not reasoning_path:
        return {"answer": NO_ANSWER_MESSAGE, "sources": [], "graph_entities_used": [], "reasoning_path": None}

    document_context = build_document_context(chunk_matches)
    graph_context = build_graph_context(relationships)
    reasoning_chain_text = build_reasoning_chain_text(reasoning_path)
    conversation_context = build_conversation_context(conversation_history)

    prompt = _PROMPT_TEMPLATE.format(
        conversation_context=conversation_context,
        document_context=document_context,
        graph_context=graph_context,
        reasoning_chain=reasoning_chain_text,
        question=question,
    )

    client = _get_client()
    try:
        response = call_with_retry(client.models.generate_content, model=GEMINI_MODEL, contents=prompt)
    except genai_errors.APIError as e:
        logger.error(f"Gemini API error during question answering: {e}")
        raise RAGError(f"Gemini API error: {e.message if hasattr(e, 'message') else str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error calling Gemini: {e}")
        raise RAGError("Unexpected error while contacting Gemini.")

    answer_text = (response.text or "").strip() or NO_ANSWER_MESSAGE

    sources = [
        {"file_name": c["file_name"], "page_number": c["page_number"], "chunk_id": c["chunk_id"], "similarity_score": c["similarity_score"]}
        for c in chunk_matches
    ]

    # Only surface the reasoning path to the frontend if it's a genuine
    # multi-hop chain (more than 2 nodes) - a trivial direct edge isn't
    # interesting enough to warrant a "show reasoning" button.
    reasoning_path_out = reasoning_path if reasoning_path and len(reasoning_path["nodes"]) > 2 else None

    return {
        "answer": answer_text,
        "sources": sources,
        "graph_entities_used": [e["name"] for e in matched_entities],
        "reasoning_path": reasoning_path_out,
    }