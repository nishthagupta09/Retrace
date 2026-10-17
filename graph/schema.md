# FalkorDB Knowledge Graph Schema Design

## Node Labels (Entity Types)
- `:Service` (id, name, tier, status)
- `:Team` (id, name, slack, oncall)
- `:Incident` (id, title, severity, started_at, status)
- `:Deployment` (id, version, commit, deployed_by, timestamp, description)
- `:Alert` (id, name, severity, timestamp, status)
- `:LogEvent` (id, level, message, timestamp)

## Relationship Types
- `(:Service)-[:DEPENDS_ON {protocol, critical}]->(:Service)`
- `(:Team)-[:OWNS]->(:Service)`
- `(:Incident)-[:AFFECTS]->(:Service)`
- `(:Deployment)-[:CHANGED]->(:Service)`
- `(:Alert)-[:TRIGGERED_ON]->(:Service)`
- `(:LogEvent)-[:EMITTED_BY]->(:Service)`
- `(:Alert)-[:CORRELATES_WITH]->(:Deployment)`

