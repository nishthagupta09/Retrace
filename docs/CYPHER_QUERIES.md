# Retrace Cypher Query Audit & Catalog

This document audits and catalogues all Cypher queries executed across the Retrace codebase, specifically within the backend service layer (`backend/app/services/graph_service.py`), database client connection check (`backend/app/db/falkordb_client.py`), graph provisioning/verification scripts (`graph/seed_graph.py`, `graph/verify_graph.py`), and sample reference queries (`graph/queries/sample_queries.cyp`).

---

## Graph Traversal and Algorithm Clarification

> **Architectural Note on Graph Algorithms:**  
> Retrace relies on **declarative Cypher graph pattern matching, variable-length path traversal (`*1..4`), and multi-hop graph traversals**.  
> The project does **not** employ separate dedicated graph algorithm packages (such as PageRank, Betweenness Centrality, Louvain Community Detection, or Dijkstra/A* via GDS/Graph Data Science libraries). Downstream dependency tracking and blast radius discovery are achieved through bounded depth-first / breadth-first path matching implemented natively within the FalkorDB Cypher engine via `[:DEPENDS_ON*1..4]`.

---

## 1. Production Backend Service Queries (`backend/app/services/graph_service.py`)

These queries power both the FastAPI REST endpoints (`/api/incidents`, `/api/services/{name}/*`, `/api/graph/topology`) and the AI Investigator tool execution layer (`find_active_incidents`, `find_impact`, `find_owner`, `find_recent_changes`).

### 1.1 Fetch All Active Incidents & Directly Affected Services
* **File & Function:** [`backend/app/services/graph_service.py`](file:///c:/Users/nishtha/Desktop/projects/Retrace/backend/app/services/graph_service.py#L42-L53) (`fetch_all_incidents`)
* **Endpoint / Tool:** `GET /api/incidents`, `find_active_incidents`

#### Exact Cypher Query
```cypher
MATCH (inc:Incident)-[:AFFECTS]->(s:Service)
RETURN inc.id AS id,
       inc.title AS title,
       inc.severity AS severity,
       inc.status AS status,
       inc.started_at AS started_at,
       s.name AS service_name,
       s.status AS service_status,
       s.tier AS service_tier
```

* **What it retrieves or changes:** Retrieves read-only records pairing each active `Incident` with each directly connected `Service` via the `[:AFFECTS]` relationship, returning incident metadata alongside current service status and criticality tier.
* **How it supports investigation & topology:** Establishes the entry point for incident response by identifying open incidents, their severities (`SEV-1`), and the direct blast radius of affected systems.
* **Query Logic Explanation:** Matches nodes labeled `:Incident` connected to nodes labeled `:Service` through outgoing `:AFFECTS` edges. Returns unaggregated rows that Python groups by `inc.id` into structured incident objects with nested `affected_services`.

---

### 1.2 Verify Service Existence & Status
* **File & Function:** [`backend/app/services/graph_service.py`](file:///c:/Users/nishtha/Desktop/projects/Retrace/backend/app/services/graph_service.py#L91-L92) (`fetch_service_impact`)
* **Endpoint / Tool:** `GET /api/services/{service_name}/impact`, `find_impact`

#### Exact Cypher Query
```cypher
MATCH (s:Service {name: $service_name}) RETURN s.status AS status
```

* **Parameters:** `{"service_name": clean_name}`
* **What it retrieves or changes:** Retrieves the `status` property of a single `Service` node matched by its unique `name`.
* **How it supports investigation & topology:** Acts as an existence check and baseline health inspection before computing downstream impact. If no row is returned, the backend raises `ServiceNotFoundError` (HTTP 404).
* **Query Logic Explanation:** Direct index/property lookup matching a `:Service` node whose `name` property equals `$service_name`. Returns `s.status`.

---

### 1.3 Downstream Dependency Path Traversal
* **File & Function:** [`backend/app/services/graph_service.py`](file:///c:/Users/nishtha/Desktop/projects/Retrace/backend/app/services/graph_service.py#L100-L106) (`fetch_service_impact`)
* **Endpoint / Tool:** `GET /api/services/{service_name}/impact`, `find_impact`

#### Exact Cypher Query
```cypher
MATCH path = (src:Service {name: $service_name})-[:DEPENDS_ON*1..4]->(target:Service)
RETURN [node in nodes(path) | node.name] AS service_path,
       target.name AS leaf_name,
       target.status AS leaf_status
```

* **Parameters:** `{"service_name": clean_name}`
* **What it retrieves or changes:** Retrieves all directed dependency paths between 1 and 4 hops deep originating at the source service, returning the ordered sequence of service names in each path, the terminal (leaf) service name, and its health status.
* **How it supports investigation & topology:** Critical for **dependency traversal** and **blast radius root-cause localization**. When a top-level service (e.g., `WebFrontend`) degrades, traversing downstream dependencies reveals failing deep dependencies (e.g., `PaymentsAPI` -> `PaymentsPostgresDB` with status `unreachable`).
* **Query Logic Explanation:** Uses Cypher variable-length relationship matching `[:DEPENDS_ON*1..4]` to bind the path variable `path`. Transforms the path nodes using the list comprehension `[node in nodes(path) | node.name]` to produce human-readable service dependency chains.

---

### 1.4 Service Existence Check (Owner Lookup)
* **File & Function:** [`backend/app/services/graph_service.py`](file:///c:/Users/nishtha/Desktop/projects/Retrace/backend/app/services/graph_service.py#L140-L141) (`fetch_service_owner`)
* **Endpoint / Tool:** `GET /api/services/{service_name}/owner`, `find_owner`

#### Exact Cypher Query
```cypher
MATCH (s:Service {name: $service_name}) RETURN s.id
```

* **Parameters:** `{"service_name": clean_name}`
* **What it retrieves or changes:** Verifies whether a `Service` node with the specified name exists by returning its identifier.
* **How it supports investigation & topology:** Distinguishes between a service that does not exist in the graph versus an existing service that has no owning team assigned.
* **Query Logic Explanation:** Matches `:Service` by parameter `$service_name` and returns `s.id`.

---

### 1.5 Service Owning Team & Responder Lookup
* **File & Function:** [`backend/app/services/graph_service.py`](file:///c:/Users/nishtha/Desktop/projects/Retrace/backend/app/services/graph_service.py#L146-L153) (`fetch_service_owner`)
* **Endpoint / Tool:** `GET /api/services/{service_name}/owner`, `find_owner`

#### Exact Cypher Query
```cypher
MATCH (t:Team)-[:OWNS]->(s:Service {name: $service_name})
RETURN t.id AS team_id,
       t.name AS team_name,
       t.slack AS slack_channel,
       t.oncall AS oncall_email
```

* **Parameters:** `{"service_name": clean_name}`
* **What it retrieves or changes:** Retrieves the engineering `Team` node connected to the given `Service` via the incoming `[:OWNS]` relationship.
* **How it supports investigation & topology:** Provides **service ownership** and on-call routing. Directly yields the responsible team, designated Slack triage channel, and on-call contact email for incident notification.
* **Query Logic Explanation:** Traverses incoming `[:OWNS]` edge from `:Team` to `:Service {name: $service_name}` and extracts communication/contact attributes.

---

### 1.6 Service Existence Check (Recent Changes Lookup)
* **File & Function:** [`backend/app/services/graph_service.py`](file:///c:/Users/nishtha/Desktop/projects/Retrace/backend/app/services/graph_service.py#L182-L183) (`fetch_service_recent_changes`)
* **Endpoint / Tool:** `GET /api/services/{service_name}/recent-changes`, `find_recent_changes`

#### Exact Cypher Query
```cypher
MATCH (s:Service {name: $service_name}) RETURN s.id
```

* **Parameters:** `{"service_name": clean_name}`
* **What it retrieves or changes:** Returns `s.id` to validate that the service node exists before querying changes.
* **How it supports investigation & topology:** Ensures 404 error handling occurs if an unknown service name is queried.
* **Query Logic Explanation:** Matches `:Service` by parameter `$service_name` and returns `s.id`.

---

### 1.7 Service Deployments and Changes Correlation
* **File & Function:** [`backend/app/services/graph_service.py`](file:///c:/Users/nishtha/Desktop/projects/Retrace/backend/app/services/graph_service.py#L189-L198) (`fetch_service_recent_changes`)
* **Endpoint / Tool:** `GET /api/services/{service_name}/recent-changes`, `find_recent_changes`

#### Exact Cypher Query
```cypher
MATCH (d:Deployment)-[:CHANGED]->(s:Service {name: $service_name})
RETURN d.id AS id,
       d.version AS version,
       d.commit AS commit,
       d.deployed_by AS deployed_by,
       d.timestamp AS timestamp,
       d.description AS description
ORDER BY d.timestamp DESC
```

* **Parameters:** `{"service_name": clean_name}`
* **What it retrieves or changes:** Retrieves all `Deployment` nodes connected to the service by `[:CHANGED]`, sorted chronologically with the latest first.
* **How it supports investigation & topology:** Provides **recent changes** correlation. Enables the AI investigator to detect suspicious configuration edits, schema migrations, or releases pushed shortly before degradation started.
* **Query Logic Explanation:** Matches nodes labeled `:Deployment` with an outgoing `:CHANGED` relationship to `:Service {name: $service_name}`. Projects deployment metadata and orders rows descending by `d.timestamp`.

---

### 1.8 Full System Topology: Services, Owners & Deployment Aggregation
* **File & Function:** [`backend/app/services/graph_service.py`](file:///c:/Users/nishtha/Desktop/projects/Retrace/backend/app/services/graph_service.py#L233-L247) (`fetch_system_topology`)
* **Endpoint / Tool:** `GET /api/graph/topology` (node set)

#### Exact Cypher Query
```cypher
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
```

* **What it retrieves or changes:** Retrieves every service in the graph with optional team ownership metadata and an aggregated count of attached deployment changes.
* **How it supports investigation & topology:** Powers the frontend **Graph Explorer** node directory and system map, displaying health status badges, criticality tiers, and owning team channels.
* **Query Logic Explanation:** Performs an outer join using `OPTIONAL MATCH` so services without teams or deployments still appear. Uses `COUNT(d)` to aggregate deployment volume per service and sorts alphabetically by `s.name`.

---

### 1.9 Full System Topology: Dependency Graph Edges
* **File & Function:** [`backend/app/services/graph_service.py`](file:///c:/Users/nishtha/Desktop/projects/Retrace/backend/app/services/graph_service.py#L275-L282) (`fetch_system_topology`)
* **Endpoint / Tool:** `GET /api/graph/topology` (edge set)

#### Exact Cypher Query
```cypher
MATCH (src:Service)-[r:DEPENDS_ON]->(tgt:Service)
RETURN src.name AS from_service,
       tgt.name AS to_service,
       r.protocol AS protocol,
       r.critical AS critical
```

* **What it retrieves or changes:** Retrieves all direct `[:DEPENDS_ON]` edges between service pairs, including protocol (`HTTPS`, `gRPC`, `TCP/5432`) and boolean criticality flag.
* **How it supports investigation & topology:** Builds the complete dependency edge graph in **Graph Explorer**, enabling responders to trace inter-service communication protocols and critical path links.
* **Query Logic Explanation:** Pattern matches every directed `:DEPENDS_ON` relationship between two `:Service` nodes and extracts connection attributes.

---

## 2. Database Connectivity Health Check (`backend/app/db/falkordb_client.py`)

### 2.1 FalkorDB Liveness Ping
* **File & Function:** [`backend/app/db/falkordb_client.py`](file:///c:/Users/nishtha/Desktop/projects/Retrace/backend/app/db/falkordb_client.py#L47) (`ping_falkordb`)
* **Endpoint / Tool:** `GET /health`

#### Exact Cypher Query
```cypher
RETURN 1
```

* **What it retrieves or changes:** Evaluates a minimal constant scalar expression on the selected graph.
* **How it supports investigation & topology:** Verifies active socket connectivity, authentication, and engine readiness before routing user queries or agent calls.
* **Query Logic Explanation:** Returns the constant integer `1`.

---

## 3. Graph Provisioning Mutation (`graph/seed_graph.py`)

* **File & Function:** [`graph/seed_graph.py`](file:///c:/Users/nishtha/Desktop/projects/Retrace/graph/seed_graph.py#L53-L107) (`seed_graph`)
* **Execution:** Initializer script (`python graph/seed_graph.py`)

#### Exact Cypher Query
```cypher
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
```

* **What it retrieves or changes:** Writes nodes (`Team`, `Service`, `Deployment`, `Incident`) and creates relationships (`OWNS`, `DEPENDS_ON`, `CHANGED`, `AFFECTS`) to seed synthetic topology data into FalkorDB graph `retrace_incidents`.
* **How it supports investigation & topology:** Supplies the graph topology and realistic multi-hop outage scenario (`INC-8401`) used across the demonstration, tests, and exploration UI.
* **Query Logic Explanation:** Single atomic Cypher write script creating nodes with assigned properties and establishing directed edges with attributes (`protocol`, `critical`).

---

## 4. Verification Script Queries (`graph/verify_graph.py`)

The verification script runs sanity checks to ensure the graph instance is correctly provisioned.

### 4.1 Verification 1: Active Incidents & Directly Affected Services
* **File:** [`graph/verify_graph.py`](file:///c:/Users/nishtha/Desktop/projects/Retrace/graph/verify_graph.py#L43-L46) (`q1`)

```cypher
MATCH (inc:Incident)-[:AFFECTS]->(s:Service)
RETURN inc.id AS incident_id, inc.title AS title, inc.severity AS severity, s.name AS affected_service, s.status AS service_status
```

* **What it retrieves or changes:** Retrieves incidents and direct affected services.
* **How it supports investigation & topology:** Verifies baseline incident connectivity and status reporting.
* **Query Logic Explanation:** Traverses `(:Incident)-[:AFFECTS]->(:Service)` returning tabular metadata.

---

### 4.2 Verification 2: Multi-Hop Dependency Paths from WebFrontend
* **File:** [`graph/verify_graph.py`](file:///c:/Users/nishtha/Desktop/projects/Retrace/graph/verify_graph.py#L54-L59) (`q2`)

```cypher
MATCH path = (src:Service {name: 'WebFrontend'})-[:DEPENDS_ON*1..3]->(target:Service)
RETURN [node in nodes(path) | node.name] AS service_path,
       target.name AS leaf_service,
       target.status AS leaf_status
```

* **What it retrieves or changes:** Returns 1-to-3 hop dependency chains originating from `WebFrontend`.
* **How it supports investigation & topology:** Validates path traversal correctness from edge services through gateways to internal storage services.
* **Query Logic Explanation:** Bounded path match `[:DEPENDS_ON*1..3]` yielding full node sequence and terminal node status.

---

### 4.3 Verification 3: Deployments on Affected Services
* **File:** [`graph/verify_graph.py`](file:///c:/Users/nishtha/Desktop/projects/Retrace/graph/verify_graph.py#L68-L71) (`q3`)

```cypher
MATCH (d:Deployment)-[:CHANGED]->(s:Service)
RETURN d.id AS dep_id, d.version AS version, d.timestamp AS deployed_at, s.name AS service, d.description AS change_desc
```

* **What it retrieves or changes:** Returns all deployments linked to services.
* **How it supports investigation & topology:** Verifies recent change event correlation against service nodes.
* **Query Logic Explanation:** Matches `(:Deployment)-[:CHANGED]->(:Service)` and projects change properties.

---

### 4.4 Verification 4: Responsible Teams for Unhealthy Services
* **File:** [`graph/verify_graph.py`](file:///c:/Users/nishtha/Desktop/projects/Retrace/graph/verify_graph.py#L79-L84) (`q4`)

```cypher
MATCH (t:Team)-[:OWNS]->(s:Service)
WHERE s.status IN ['failing', 'unreachable', 'degraded']
RETURN DISTINCT t.name AS team_name, t.slack AS channel, t.oncall AS oncall, s.name AS service, s.status AS status
ORDER BY team_name
```

* **What it retrieves or changes:** Filters services by degraded/failing statuses and returns their owning team contact info.
* **How it supports investigation & topology:** Validates on-call escalation routing for active degradations.
* **Query Logic Explanation:** Matches `(:Team)-[:OWNS]->(:Service)`, filters by `s.status IN [...]`, removes duplicate rows with `DISTINCT`, and sorts alphabetically by team name.

---

## 5. Sample Query Reference File (`graph/queries/sample_queries.cyp`)

Reference queries provided in the repository for manual inspection and debugging in Cypher CLI tools.

### 5.1 Sample Service Dependency Topology
* **File:** [`graph/queries/sample_queries.cyp`](file:///c:/Users/nishtha/Desktop/projects/Retrace/graph/queries/sample_queries.cyp#L4-L5)

```cypher
MATCH (s:Service)-[r:DEPENDS_ON]->(target:Service)
RETURN s, r, target;
```

* **What it retrieves or changes:** Returns entire nodes and relationship entities for all direct service dependencies.
* **How it supports investigation & topology:** Used in FalkorDB Browser or CLI to visualize service dependency subgraphs.
* **Query Logic Explanation:** Direct relationship match returning full node and relationship objects.

---

### 5.2 Sample Alert Trigger Correlation
* **File:** [`graph/queries/sample_queries.cyp`](file:///c:/Users/nishtha/Desktop/projects/Retrace/graph/queries/sample_queries.cyp#L8-L9)

```cypher
MATCH (a:Alert)-[:TRIGGERED_ON]->(s:Service)
RETURN a, s;
```

* **What it retrieves or changes:** Returns all alerts and their targeted services according to the schema design.
* **How it supports investigation & topology:** Illustrates planned alert-to-service correlation.
* **Query Logic Explanation:** Matches `(:Alert)-[:TRIGGERED_ON]->(:Service)` returning both entities.

---

## Summary Mapping Table

| Cypher Query Purpose | Source File | Relationship Types Used | Node Labels Used | Query Type |
|---|---|---|---|---|
| Active incidents & blast radius | `graph_service.py` | `AFFECTS` | `Incident`, `Service` | Read (MATCH) |
| Service verification | `graph_service.py` | None | `Service` | Read (MATCH) |
| Downstream dependency traversal | `graph_service.py` | `DEPENDS_ON*1..4` | `Service` | Traversal (Path MATCH) |
| Service existence check | `graph_service.py` | None | `Service` | Read (MATCH) |
| Service ownership & oncall lookup | `graph_service.py` | `OWNS` | `Team`, `Service` | Read (MATCH) |
| Service recent changes lookup | `graph_service.py` | `CHANGED` | `Deployment`, `Service` | Read (MATCH + ORDER BY) |
| Topology services & deployment counts | `graph_service.py` | `OWNS`, `CHANGED` | `Service`, `Team`, `Deployment` | Aggregation (OPTIONAL MATCH) |
| Topology dependency edges | `graph_service.py` | `DEPENDS_ON` | `Service` | Read (MATCH) |
| Database connectivity ping | `falkordb_client.py`| None | None | Scalar (RETURN 1) |
| Synthetic incident seeding | `seed_graph.py` | `OWNS`, `DEPENDS_ON`, `CHANGED`, `AFFECTS` | `Team`, `Service`, `Deployment`, `Incident` | Mutation (CREATE) |
| Graph verification queries (q1-q4)| `verify_graph.py` | `AFFECTS`, `DEPENDS_ON*1..3`, `CHANGED`, `OWNS` | `Incident`, `Service`, `Deployment`, `Team` | Read / Traversal |
| Sample dependency topology | `sample_queries.cyp` | `DEPENDS_ON` | `Service` | Reference Read |
| Sample alerts correlation | `sample_queries.cyp` | `TRIGGERED_ON` | `Alert`, `Service` | Reference Read |
