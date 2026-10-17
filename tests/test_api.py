"""
Retrace Backend Test Suite

Tests:
1. GET /health - verifies health check and DB connectivity.
2. GET /api/incidents - verifies active incident retrieval and affected services.
3. GET /api/services/WebFrontend/impact - verifies multi-hop dependency path traversal.
4. GET /api/services/PaymentsAPI/owner - verifies owning team and on-call metadata.
5. GET /api/services/PaymentsAPI/recent-changes - verifies recent deployment changes.
6. 404 validation for nonexistent services.
7. Simulated database failure returning HTTP 500.

Read-only strategy: All queries are read-only and do NOT delete or reset the development graph.
"""

import pytest
from starlette.testclient import TestClient
from unittest.mock import patch

from backend.app.main import app

client = TestClient(app)


def test_health_endpoint():
    """Verify backend is alive and reports FalkorDB connection status and configured model."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["environment"] == "development"
    assert data["database"] == "connected"
    assert data["status"] == "ok"
    assert data["graph"] == "retrace_incidents"
    assert "gemini_model" in data


def test_get_active_incidents():
    """Verify active incidents endpoint returns INC-8401 and affected services."""
    response = client.get("/api/incidents")
    assert response.status_code == 200
    incidents = response.json()
    assert len(incidents) >= 1

    inc = next((i for i in incidents if i["id"] == "INC-8401"), None)
    assert inc is not None
    assert inc["severity"] == "SEV-1"
    affected_names = [s["name"] for s in inc["affected_services"]]
    assert "PaymentsAPI" in affected_names
    assert "WebFrontend" in affected_names


def test_get_service_impact():
    """Verify downstream multi-hop paths from WebFrontend."""
    response = client.get("/api/services/WebFrontend/impact")
    assert response.status_code == 200
    data = response.json()
    assert data["service_name"] == "WebFrontend"
    assert data["service_status"] == "degraded"
    assert len(data["downstream_paths"]) > 0

    # Ensure PaymentsAPI and PostgresDB appear in the paths
    leaf_services = [hop["leaf_service"] for hop in data["downstream_paths"]]
    assert "PaymentsAPI" in leaf_services
    assert "PaymentsPostgresDB" in leaf_services


def test_get_service_owner():
    """Verify owner contact information for PaymentsAPI."""
    response = client.get("/api/services/PaymentsAPI/owner")
    assert response.status_code == 200
    data = response.json()
    assert data["service_name"] == "PaymentsAPI"
    assert data["team_name"] == "Checkout & Payments"
    assert data["slack_channel"] == "#team-checkout"
    assert data["oncall_email"] == "alice@company.com"


def test_get_service_recent_changes():
    """Verify recent deployments for PaymentsAPI."""
    response = client.get("/api/services/PaymentsAPI/recent-changes")
    assert response.status_code == 200
    data = response.json()
    assert data["service_name"] == "PaymentsAPI"
    assert len(data["changes"]) >= 1
    dep = data["changes"][0]
    assert dep["version"] == "v2.4.1"
    assert "connection pool" in dep["description"].lower()


def test_service_not_found():
    """Verify 404 response for nonexistent service."""
    response = client.get("/api/services/NonExistentService999/impact")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()

    owner_res = client.get("/api/services/NonExistentService999/owner")
    assert owner_res.status_code == 404

    changes_res = client.get("/api/services/NonExistentService999/recent-changes")
    assert changes_res.status_code == 404


def test_database_failure_handling():
    """Verify 500 error code when FalkorDB connection fails."""
    with patch("backend.app.services.graph_service.get_graph", side_effect=Exception("Database unreachable")):
        response = client.get("/api/incidents")
        assert response.status_code == 500
        assert "Database failure" in response.json()["detail"]


def test_get_graph_topology():
    """Verify GET /api/graph/topology returns nodes and edges from FalkorDB."""
    response = client.get("/api/graph/topology")
    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    assert "edges" in data
    assert len(data["nodes"]) >= 6
    assert len(data["edges"]) >= 5

    names = [n["name"] for n in data["nodes"]]
    assert "PaymentsAPI" in names
    assert "WebFrontend" in names

    # Verify edge structure
    for edge in data["edges"]:
        assert "from_node" in edge
        assert "to_node" in edge
        assert edge["type"] == "DEPENDS_ON"


