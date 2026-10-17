import logging
from typing import Optional
from falkordb import FalkorDB
from backend.app.core.config import settings

logger = logging.getLogger(__name__)

_client: Optional[FalkorDB] = None


def get_falkordb_client() -> FalkorDB:
    """Return a singleton FalkorDB client instance."""
    global _client
    if _client is None:
        logger.info(
            f"Connecting to FalkorDB at {settings.FALKORDB_HOST}:{settings.FALKORDB_PORT}"
        )
        _client = FalkorDB(
            host=settings.FALKORDB_HOST,
            port=settings.FALKORDB_PORT,
        )
    return _client


def get_graph(graph_name: Optional[str] = None):
    """Retrieve a FalkorDB Graph object using application settings."""
    client = get_falkordb_client()
    target_graph = graph_name or settings.FALKORDB_GRAPH
    return client.select_graph(target_graph)


def ping_falkordb() -> bool:
    """Check connectivity to the FalkorDB instance."""
    try:
        client = get_falkordb_client()
        # Verify connection by selecting graph and executing simple query
        graph = client.select_graph(settings.FALKORDB_GRAPH)
        graph.query("RETURN 1")
        return True
    except Exception as e:
        logger.error(f"FalkorDB ping failed: {e}")
        return False
