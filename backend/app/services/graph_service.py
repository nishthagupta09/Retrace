"""
Internal service and graph query layer for Retrace.

Reused by both the FastAPI REST endpoints and the Gemini incident agent tools.
Uses parameterized Cypher to query FalkorDB without Cypher injection risks.
"""

from typing import List, Optional, Dict, Any
import logging

from backend.app.db.falkordb_client import get_graph
from backend.app.models.schemas import (
    IncidentResponse,
    AffectedService,
    ServiceImpactResponse,
    DependencyHop,
    ServiceOwnerResponse,
    ServiceRecentChangesResponse,
    DeploymentChange,
    GraphTopologyNode,
    GraphTopologyEdge,
    GraphTopologyResponse,
)

logger = logging.getLogger(__name__)


class ServiceNotFoundError(Exception):
    """Raised when a requested service does not exist in the knowledge graph."""
    pass


class DatabaseQueryError(Exception):
    """Raised when a graph database operation fails."""
    pass


def fetch_all_incidents() -> List[IncidentResponse]:
    """Retrieve all active incidents and their directly affected services."""
    try:
        graph = get_graph()
        cypher = """
        MATCH (inc:Incident)-[:AFFECTS]->(s:Service)
        RETURN inc.id AS id,
               inc.title AS title,
               inc.severity AS severity,
               inc.status AS status,
               inc.started_at AS started_at,
               s.name AS service_name,
               s.status AS service_status,
               s.tier AS service_tier
        """
        result = graph.query(cypher)

        incidents_map: Dict[str, IncidentResponse] = {}
        for row in result.result_set:
            inc_id = row[0]
            if inc_id not in incidents_map:
                incidents_map[inc_id] = IncidentResponse(
                    id=row[0],
                    title=row[1],
                    severity=row[2],
                    status=row[3],
                    started_at=row[4],
                    affected_services=[],
                )
            incidents_map[inc_id].affected_services.append(
                AffectedService(
                    name=row[5],
                    status=row[6],
                    tier=row[7],
                )
            )

        return list(incidents_map.values())
    except Exception as e:
        logger.error(f"Error fetching incidents from graph: {e}")
        raise DatabaseQueryError(f"Database failure fetching incidents: {e}") from e


def fetch_service_impact(service_name: str) -> ServiceImpactResponse:
    """Retrieve downstream dependency paths and health statuses for a service."""
    clean_name = service_name.strip()
    if not clean_name:
        raise ValueError("Service name cannot be empty")

    try:
        graph = get_graph()

        # 1. Verify service existence and obtain its status
        verify_query = "MATCH (s:Service {name: $service_name}) RETURN s.status AS status"
        verify_res = graph.query(verify_query, {"service_name": clean_name})

        if not verify_res.result_set:
            raise ServiceNotFoundError(f"Service '{clean_name}' not found in knowledge graph")

        current_status = verify_res.result_set[0][0] or "unknown"

        # 2. Traverse downstream dependencies (up to 4 hops)
        path_query = """
        MATCH path = (src:Service {name: $service_name})-[:DEPENDS_ON*1..4]->(target:Service)
        RETURN [node in nodes(path) | node.name] AS service_path,
               target.name AS leaf_name,
               target.status AS leaf_status
        """
        path_res = graph.query(path_query, {"service_name": clean_name})

        downstream = []
        for row in path_res.result_set:
            downstream.append(
                DependencyHop(
                    path=row[0],
                    leaf_service=row[1],
                    leaf_status=row[2] or "unknown",
                )
            )

        return ServiceImpactResponse(
            service_name=clean_name,
            service_status=current_status,
            downstream_paths=downstream,
        )
    except ServiceNotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error querying impact for '{clean_name}': {e}")
        raise DatabaseQueryError(f"Database failure evaluating service impact: {e}") from e


def fetch_service_owner(service_name: str) -> ServiceOwnerResponse:
    """Retrieve the team responsible for a given service and contact metadata."""
    clean_name = service_name.strip()
    if not clean_name:
        raise ValueError("Service name cannot be empty")

    try:
        graph = get_graph()

        # 1. Check if service exists
        check_query = "MATCH (s:Service {name: $service_name}) RETURN s.id"
        check_res = graph.query(check_query, {"service_name": clean_name})
        if not check_res.result_set:
            raise ServiceNotFoundError(f"Service '{clean_name}' not found in knowledge graph")

        # 2. Find owning team
        owner_query = """
        MATCH (t:Team)-[:OWNS]->(s:Service {name: $service_name})
        RETURN t.id AS team_id,
               t.name AS team_name,
               t.slack AS slack_channel,
               t.oncall AS oncall_email
        """
        owner_res = graph.query(owner_query, {"service_name": clean_name})
        if not owner_res.result_set:
            raise ServiceNotFoundError(f"No owning team assigned to service '{clean_name}'")

        row = owner_res.result_set[0]
        return ServiceOwnerResponse(
            service_name=clean_name,
            team_id=row[0],
            team_name=row[1],
            slack_channel=row[2],
            oncall_email=row[3],
        )
    except ServiceNotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error querying owner for '{clean_name}': {e}")
        raise DatabaseQueryError(f"Database failure fetching service owner: {e}") from e


def fetch_service_recent_changes(service_name: str) -> ServiceRecentChangesResponse:
    """Retrieve deployments and changes linked to the service."""
    clean_name = service_name.strip()
    if not clean_name:
        raise ValueError("Service name cannot be empty")

    try:
        graph = get_graph()

        # 1. Check if service exists
        check_query = "MATCH (s:Service {name: $service_name}) RETURN s.id"
        check_res = graph.query(check_query, {"service_name": clean_name})
        if not check_res.result_set:
            raise ServiceNotFoundError(f"Service '{clean_name}' not found in knowledge graph")

        # 2. Retrieve deployments connected by CHANGED relationship
        changes_query = """
        MATCH (d:Deployment)-[:CHANGED]->(s:Service {name: $service_name})
        RETURN d.id AS id,
               d.version AS version,
               d.commit AS commit,
               d.deployed_by AS deployed_by,
               d.timestamp AS timestamp,
               d.description AS description
        ORDER BY d.timestamp DESC
        """
        changes_res = graph.query(changes_query, {"service_name": clean_name})

        changes = []
        for row in changes_res.result_set:
            changes.append(
                DeploymentChange(
                    id=row[0],
                    version=row[1],
                    commit=row[2],
                    deployed_by=row[3],
                    timestamp=row[4],
                    description=row[5],
                )
            )

        return ServiceRecentChangesResponse(
            service_name=clean_name,
            changes=changes,
        )
    except ServiceNotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error querying changes for '{clean_name}': {e}")
        raise DatabaseQueryError(f"Database failure fetching service changes: {e}") from e


def fetch_system_topology() -> GraphTopologyResponse:
    """
    Retrieve entire system service topology, ownership metadata, and dependency edges
    directly from FalkorDB for system-level exploration.
    """
    try:
        graph = get_graph()

        # 1. Fetch all services and their owning teams and changes count
        services_cypher = """
        MATCH (s:Service)
        OPTIONAL MATCH (t:Team)-[:OWNS]->(s)
        OPTIONAL MATCH (d:Deployment)-[:CHANGED]->(s)
        RETURN s.id AS id,
               s.name AS name,
               s.status AS status,
               s.tier AS tier,
               t.name AS team_name,
               t.oncall AS oncall_email,
               t.slack AS slack_channel,
               COUNT(d) AS changes_count
        ORDER BY s.name ASC
        """
        services_res = graph.query(services_cypher)

        nodes = []
        teams_set = set()
        statuses_set = set()

        for row in services_res.result_set:
            status = row[2] or "unknown"
            team = row[4]
            if team:
                teams_set.add(team)
            if status:
                statuses_set.add(status)

            nodes.append(
                GraphTopologyNode(
                    id=row[0] or row[1],
                    name=row[1],
                    status=status,
                    tier=row[3],
                    team_name=team,
                    oncall_email=row[5],
                    slack_channel=row[6],
                    recent_changes_count=row[7] or 0,
                )
            )

        # 2. Fetch all DEPENDS_ON relationship edges between services
        edges_cypher = """
        MATCH (src:Service)-[r:DEPENDS_ON]->(tgt:Service)
        RETURN src.name AS from_service,
               tgt.name AS to_service,
               r.protocol AS protocol,
               r.critical AS critical
        """
        edges_res = graph.query(edges_cypher)

        edges = []
        for row in edges_res.result_set:
            edges.append(
                GraphTopologyEdge(
                    from_node=row[0],
                    to_node=row[1],
                    type="DEPENDS_ON",
                    protocol=row[2],
                    critical=bool(row[3]) if row[3] is not None else None,
                )
            )

        return GraphTopologyResponse(
            nodes=nodes,
            edges=edges,
            teams=sorted(list(teams_set)),
            statuses=sorted(list(statuses_set)),
        )
    except Exception as e:
        logger.error(f"Error fetching system topology from graph: {e}")
        raise DatabaseQueryError(f"Database failure fetching system topology: {e}") from e

