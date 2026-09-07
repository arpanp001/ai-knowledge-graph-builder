import logging
from neo4j.exceptions import Neo4jError

from app.database.neo4j import get_driver, GraphConnectionError
from app.utils.text_utils import normalize_key

logger = logging.getLogger(__name__)

_ALLOWED_RELATIONS = {
    "USES", "USED_FOR", "PART_OF", "RELATED_TO", "IMPLEMENTS",
    "DEPENDS_ON", "CREATED_BY", "TYPE_OF", "CONTAINS", "SUPPORTS",
}


class GraphStorageError(Exception):
    """Raised when writing to or reading from the graph fails."""
    pass


def _run_write(query: str, **params):
    """
    Runs a write query inside a managed transaction. Managed transactions
    (execute_write) automatically detect a stale/dropped connection - common
    on Neo4j Aura's free tier after a period of inactivity - and transparently
    retry with a fresh connection, instead of failing outright.
    """
    def _work(tx):
        tx.run(query, **params)

    try:
        driver = get_driver()
        with driver.session() as session:
            session.execute_write(_work)
    except GraphConnectionError:
        raise
    except Neo4jError as e:
        logger.error(f"Neo4j write error: {e}")
        raise GraphStorageError(f"Failed to write to the graph database: {e}")


def _run_read(query: str, **params) -> list[dict]:
    def _work(tx):
        result = tx.run(query, **params)
        return [record.data() for record in result]

    try:
        driver = get_driver()
        with driver.session() as session:
            return session.execute_read(_work)
    except GraphConnectionError:
        raise
    except Neo4jError as e:
        logger.error(f"Neo4j read error: {e}")
        raise GraphStorageError(f"Failed to read from the graph database: {e}")


def upsert_project(project_id: str):
    _run_write(
        "MERGE (p:Project {id: $project_id})",
        project_id=project_id,
    )


def upsert_document(project_id: str, document_id: str, file_name: str):
    _run_write(
        """
        MATCH (p:Project {id: $project_id})
        MERGE (d:Document {id: $document_id})
        SET d.file_name = $file_name, d.project_id = $project_id
        MERGE (p)-[:HAS_DOCUMENT]->(d)
        """,
        project_id=project_id,
        document_id=document_id,
        file_name=file_name,
    )


def upsert_entity(project_id: str, document_id: str, name: str, entity_type: str):
    key = normalize_key(name)
    _run_write(
        """
        MATCH (d:Document {id: $document_id})
        MERGE (e:Entity {key: $key, project_id: $project_id})
        ON CREATE SET e.name = $name, e.type = $entity_type
        MERGE (d)-[:MENTIONS]->(e)
        """,
        project_id=project_id,
        document_id=document_id,
        key=key,
        name=name,
        entity_type=entity_type,
    )


def upsert_relationship(
    project_id: str,
    document_id: str,
    source_name: str,
    relation: str,
    target_name: str,
    confidence: int,
):
    if relation not in _ALLOWED_RELATIONS:
        raise GraphStorageError(f"Refusing to store unrecognized relationship type: {relation}")

    source_key = normalize_key(source_name)
    target_key = normalize_key(target_name)

    query = f"""
        MATCH (a:Entity {{key: $source_key, project_id: $project_id}})
        MATCH (b:Entity {{key: $target_key, project_id: $project_id}})
        MERGE (a)-[r:{relation}]->(b)
        ON CREATE SET r.confidence = $confidence, r.document_id = $document_id
        ON MATCH SET r.confidence = r.confidence + $confidence
    """
    _run_write(
        query,
        project_id=project_id,
        document_id=document_id,
        source_key=source_key,
        target_key=target_key,
        confidence=confidence,
    )


def get_document_graph(document_id: str) -> dict:
    entity_rows = _run_read(
        """
        MATCH (d:Document {id: $document_id})-[:MENTIONS]->(e:Entity)
        RETURN e.key AS id, e.name AS name, e.type AS type
        """,
        document_id=document_id,
    )

    relationship_rows = _run_read(
        """
        MATCH (d:Document {id: $document_id})-[:MENTIONS]->(a:Entity)
        MATCH (d)-[:MENTIONS]->(b:Entity)
        MATCH (a)-[r]->(b)
        WHERE a.key <> b.key
        RETURN a.key AS source, type(r) AS relation, b.key AS target, r.confidence AS confidence
        """,
        document_id=document_id,
    )

    return {"nodes": entity_rows, "edges": relationship_rows}

def get_all_entities_for_project(project_id: str) -> list[dict]:
    """Returns every known entity in a project - used to spot entity mentions in a user's question."""
    return _run_read(
        """
        MATCH (e:Entity {project_id: $project_id})
        RETURN e.key AS key, e.name AS name, e.type AS type
        """,
        project_id=project_id,
    )


def get_relationships_for_entities(project_id: str, entity_keys: list[str]) -> list[dict]:
    """
    Returns relationships involving any of the given entities - used to build
    graph context for RAG once we know which entities a question mentions.
    """
    if not entity_keys:
        return []

    return _run_read(
        """
        MATCH (a:Entity {project_id: $project_id})-[r]->(b:Entity {project_id: $project_id})
        WHERE a.key IN $entity_keys OR b.key IN $entity_keys
        RETURN a.name AS source, type(r) AS relation, b.name AS target, r.confidence AS confidence
        LIMIT 20
        """,
        project_id=project_id,
        entity_keys=entity_keys,
    )

def get_project_graph(project_id: str) -> dict:
    """Returns every entity and relationship in an entire project (not scoped to one document)."""
    entity_rows = _run_read(
        "MATCH (e:Entity {project_id: $project_id}) RETURN e.key AS id, e.name AS name, e.type AS type",
        project_id=project_id,
    )

    relationship_rows = _run_read(
        """
        MATCH (a:Entity {project_id: $project_id})-[r]->(b:Entity {project_id: $project_id})
        RETURN a.key AS source, type(r) AS relation, b.key AS target, r.confidence AS confidence
        """,
        project_id=project_id,
    )

    return {"nodes": entity_rows, "edges": relationship_rows}


def delete_project_graph(project_id: str):
    """Removes every node belonging to a project - Project, its Documents, and its Entities."""
    _run_write(
        """
        MATCH (n)
        WHERE n.project_id = $project_id OR (n:Project AND n.id = $project_id)
        DETACH DELETE n
        """,
        project_id=project_id,
    )

def find_shortest_path(project_id: str, source_key: str, target_key: str) -> dict | None:
    """
    Finds the shortest path between two entities, using only the relationship
    types Entities can have between them (our controlled vocabulary from
    Phase 6), and only through other :Entity nodes.

    We deliberately do NOT use a bare shortestPath((a)-[*..6]-(b)) with no
    type/label restriction - that would happily route through Document or
    Project nodes (connected via MENTIONS / HAS_DOCUMENT), which don't have
    key/name/type properties. That produced nulls that failed schema
    validation. Restricting both the relationship types and requiring every
    intermediate node to be an :Entity guarantees every node on the path has
    the fields our schema requires.

    Returns None if no path exists within 6 hops.
    """
    rows = _run_read(
        """
        MATCH (a:Entity {project_id: $project_id, key: $source_key}),
              (b:Entity {project_id: $project_id, key: $target_key}),
              p = shortestPath(
                (a)-[:USES|USED_FOR|PART_OF|RELATED_TO|IMPLEMENTS|DEPENDS_ON|CREATED_BY|TYPE_OF|CONTAINS|SUPPORTS*..6]-(b)
              )
        WHERE all(n IN nodes(p) WHERE n:Entity AND n.project_id = $project_id)
        RETURN [n IN nodes(p) | {key: n.key, name: n.name, type: n.type}] AS nodes,
               [r IN relationships(p) | type(r)] AS relations
        LIMIT 1
        """,
        project_id=project_id,
        source_key=source_key,
        target_key=target_key,
    )
    return rows[0] if rows else None

def get_project_graph_counts(project_id: str) -> dict:
    """Returns entity and relationship counts for a project."""
    entity_count_rows = _run_read(
        "MATCH (e:Entity {project_id: $project_id}) RETURN count(e) AS count",
        project_id=project_id,
    )
    relationship_count_rows = _run_read(
        "MATCH (:Entity {project_id: $project_id})-[r]->(:Entity {project_id: $project_id}) RETURN count(r) AS count",
        project_id=project_id,
    )
    return {
        "entity_count": entity_count_rows[0]["count"] if entity_count_rows else 0,
        "relationship_count": relationship_count_rows[0]["count"] if relationship_count_rows else 0,
    }


def get_top_connected_entities(project_id: str, limit: int = 5) -> list[dict]:
    """
    Returns the entities with the most relationships (in + out combined) -
    the "hub" concepts in a project's knowledge graph, useful for a quick
    at-a-glance summary of what a project is really about.
    """
    return _run_read(
        """
        MATCH (e:Entity {project_id: $project_id})
        OPTIONAL MATCH (e)-[r]-()
        WITH e, count(r) AS degree
        RETURN e.name AS name, e.type AS type, degree
        ORDER BY degree DESC
        LIMIT $limit
        """,
        project_id=project_id,
        limit=limit,
    )