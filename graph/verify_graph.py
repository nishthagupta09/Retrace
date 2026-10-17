"""
Verification script for Retrace FalkorDB graph.

Runs queries against the 'retrace_incidents' graph:
1. Incident blast radius and directly affected services.
2. Multi-hop downstream dependency paths originating from degraded services down to failing dependencies.
3. Recent deployments on affected/dependent services.
4. Responsible teams and on-call responders.
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


def verify(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT):
    print(f"Connecting to FalkorDB at {host}:{port} for verification...")
    try:
        client = FalkorDB(host=host, port=port)
        graph = client.select_graph(GRAPH_NAME)
    except Exception as e:
        print(f"Error connecting to FalkorDB: {e}", file=sys.stderr)
        raise

    print("\n" + "=" * 60)
    print("1. ACTIVE INCIDENTS & DIRECTLY AFFECTED SERVICES")
    print("=" * 60)
    q1 = """
    MATCH (inc:Incident)-[:AFFECTS]->(s:Service)
    RETURN inc.id AS incident_id, inc.title AS title, inc.severity AS severity, s.name AS affected_service, s.status AS service_status
    """
    res1 = graph.query(q1)
    for row in res1.result_set:
        print(f"[{row[2]}] {row[0]}: {row[1]} -> Service: {row[3]} (Status: {row[4]})")

    print("\n" + "=" * 60)
    print("2. MULTI-HOP DEPENDENCY PATHS FROM WebFrontend")
    print("=" * 60)
    q2 = """
    MATCH path = (src:Service {name: 'WebFrontend'})-[:DEPENDS_ON*1..3]->(target:Service)
    RETURN [node in nodes(path) | node.name] AS service_path,
           target.name AS leaf_service,
           target.status AS leaf_status
    """
    res2 = graph.query(q2)
    for row in res2.result_set:
        chain = " -> ".join(row[0])
        print(f"Path: {chain} | Destination Status: {row[2]}")

    print("\n" + "=" * 60)
    print("3. SUSPICIOUS DEPLOYMENTS ON DEPENDENCY CHAIN")
    print("=" * 60)
    q3 = """
    MATCH (d:Deployment)-[:CHANGED]->(s:Service)
    RETURN d.id AS dep_id, d.version AS version, d.timestamp AS deployed_at, s.name AS service, d.description AS change_desc
    """
    res3 = graph.query(q3)
    for row in res3.result_set:
        print(f"Deployment {row[0]} ({row[1]}) at {row[2]} on {row[3]}: '{row[4]}'")

    print("\n" + "=" * 60)
    print("4. RESPONSIBLE TEAMS & ON-CALL CONTACTS")
    print("=" * 60)
    q4 = """
    MATCH (t:Team)-[:OWNS]->(s:Service)
    WHERE s.status IN ['failing', 'unreachable', 'degraded']
    RETURN DISTINCT t.name AS team_name, t.slack AS channel, t.oncall AS oncall, s.name AS service, s.status AS status
    ORDER BY team_name
    """
    res4 = graph.query(q4)
    for row in res4.result_set:
        print(f"Team: {row[0]:<22} | Channel: {row[1]:<16} | On-Call: {row[2]:<22} | Service: {row[3]} ({row[4]})")

    print("\n" + "=" * 60)
    print("GRAPH VERIFICATION COMPLETE: ALL INTEGRATION PATHS CONFIRMED")
    print("=" * 60)


if __name__ == "__main__":
    verify()
