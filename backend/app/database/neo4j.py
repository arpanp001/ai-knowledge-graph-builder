import logging
from neo4j import GraphDatabase
from neo4j.exceptions import Neo4jError, ServiceUnavailable, AuthError

from app.config.settings import NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD

logger = logging.getLogger(__name__)

_driver = None


class GraphConnectionError(Exception):
    """Raised when we can't connect to or query Neo4j."""
    pass


def get_driver():
    """Returns a singleton Neo4j driver, creating it on first use."""
    global _driver

    if _driver is None:
        if not NEO4J_URI or not NEO4J_PASSWORD:
            raise GraphConnectionError(
                "Neo4j connection details are missing. Check NEO4J_URI and NEO4J_PASSWORD in backend/.env."
            )
        _driver = GraphDatabase.driver(
            NEO4J_URI,
            auth=(NEO4J_USERNAME, NEO4J_PASSWORD),
            max_connection_lifetime=200,  # seconds - refresh connections well before Aura's idle timeout
        )

    return _driver


def verify_connection():
    """Call this on app startup to fail fast with a clear error if Neo4j is unreachable."""
    try:
        driver = get_driver()
        driver.verify_connectivity()
        logger.info("Neo4j connection verified successfully.")
    except AuthError:
        raise GraphConnectionError("Neo4j authentication failed. Check NEO4J_USERNAME and NEO4J_PASSWORD.")
    except ServiceUnavailable:
        raise GraphConnectionError("Could not reach Neo4j. Check NEO4J_URI and that the database is running.")
    except Neo4jError as e:
        raise GraphConnectionError(f"Neo4j error during connection check: {e}")


def close_driver():
    """Call this on app shutdown to close the connection cleanly."""
    global _driver
    if _driver is not None:
        _driver.close()
        _driver = None