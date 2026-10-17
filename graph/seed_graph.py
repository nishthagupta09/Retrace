"""
Seed script for Retrace FalkorDB graph.

Inserts a realistic synthetic incident scenario:
- Incident: INC-8401 (Payments API elevated 500 error rates)
- Services: WebFrontend, APIGateway, PaymentsAPI, OrderService, FraudDetectionService, PostgreSQLDB
- Teams: CheckoutTeam, CorePlatformTeam, RiskTeam
- Deployments: v2.4.1 (Faulty DB connection pool change)
- Relationships: DEPENDS_ON, OWNS, AFFECTS, CHANGED
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from falkordb import FalkorDB

# Load backend/.env if present (support running from repo root or graph/ directory)
env_path = Path(__file__).resolve().parent.parent / "backend" / ".env"
load_dotenv(dotenv_path=env_path)

GRAPH_NAME = "retrace_incidents"
DEFAULT_HOST = os.getenv("FALKORDB_HOST", "localhost")
DEFAULT_PORT = int(os.getenv("FALKORDB_PORT", "6380"))


def seed_graph(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT):
    print(f"Connecting to FalkorDB at {host}:{port}...")
    try:
        client = FalkorDB(host=host, port=port)
        graph = client.select_graph(GRAPH_NAME)
    except Exception as e:
        print(f"Error connecting to FalkorDB: {e}", file=sys.stderr)
        raise

    print(f"Cleaning existing data in graph '{GRAPH_NAME}'...")
    try:
        graph.delete()
    except Exception:
        # If the graph did not exist yet, delete can fail safely
        pass

    # Re-select after delete
    graph = client.select_graph(GRAPH_NAME)

    print("Inserting synthetic incident topology and scenario...")

    cypher_mutation = """
    // 1. Teams
    CREATE (t_checkout:Team {id: 'team-checkout', name: 'Checkout & Payments', slack: '#team-checkout', oncall: 'alice@company.com'})
    CREATE (t_platform:Team {id: 'team-platform', name: 'Core Platform', slack: '#team-platform', oncall: 'bob@company.com'})
    CREATE (t_risk:Team {id: 'team-risk', name: 'Risk & Fraud', slack: '#team-risk', oncall: 'carol@company.com'})

    // 2. Services
    CREATE (s_frontend:Service {id: 'srv-frontend', name: 'WebFrontend', tier: 'tier-1', status: 'degraded'})
    CREATE (s_gateway:Service {id: 'srv-gateway', name: 'APIGateway', tier: 'tier-1', status: 'degraded'})
    CREATE (s_order:Service {id: 'srv-order', name: 'OrderService', tier: 'tier-1', status: 'healthy'})
    CREATE (s_payments:Service {id: 'srv-payments', name: 'PaymentsAPI', tier: 'tier-1', status: 'failing'})
    CREATE (s_fraud:Service {id: 'srv-fraud', name: 'FraudDetectionService', tier: 'tier-2', status: 'healthy'})
    CREATE (s_db:Service {id: 'srv-db', name: 'PaymentsPostgresDB', tier: 'tier-1', status: 'unreachable'})

    // 3. Team Ownership
    CREATE (t_checkout)-[:OWNS]->(s_frontend)
    CREATE (t_checkout)-[:OWNS]->(s_payments)
    CREATE (t_checkout)-[:OWNS]->(s_db)
    CREATE (t_platform)-[:OWNS]->(s_gateway)
    CREATE (t_platform)-[:OWNS]->(s_order)
    CREATE (t_risk)-[:OWNS]->(s_fraud)

    // 4. Dependencies (Multi-hop)
    // WebFrontend -> APIGateway -> OrderService & PaymentsAPI
    // PaymentsAPI -> FraudDetectionService & PaymentsPostgresDB
    CREATE (s_frontend)-[:DEPENDS_ON {protocol: 'HTTPS', critical: true}]->(s_gateway)
    CREATE (s_gateway)-[:DEPENDS_ON {protocol: 'gRPC', critical: true}]->(s_order)
    CREATE (s_gateway)-[:DEPENDS_ON {protocol: 'HTTPS', critical: true}]->(s_payments)
    CREATE (s_payments)-[:DEPENDS_ON {protocol: 'gRPC', critical: false}]->(s_fraud)
    CREATE (s_payments)-[:DEPENDS_ON {protocol: 'TCP/5432', critical: true}]->(s_db)

    // 5. Recent Deployments
    CREATE (d_payments:Deployment {
        id: 'dep-902',
        version: 'v2.4.1',
        commit: 'a9f81d3',
        deployed_by: 'alice@company.com',
        timestamp: '2026-10-17T16:30:00Z',
        description: 'Update connection pool max size and timeouts'
    })
    CREATE (d_payments)-[:CHANGED]->(s_payments)

    // 6. Active Incident
    CREATE (inc:Incident {
        id: 'INC-8401',
        title: 'Elevated 500 error rates on Checkout and Payments API',
        severity: 'SEV-1',
        started_at: '2026-10-17T16:45:00Z',
        status: 'investigating'
    })
    CREATE (inc)-[:AFFECTS]->(s_payments)
    CREATE (inc)-[:AFFECTS]->(s_frontend)
    """

    graph.query(cypher_mutation)
    print("Seed graph inserted successfully.")


if __name__ == "__main__":
    seed_graph()
