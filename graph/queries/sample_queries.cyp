// Standard Cypher queries for Retrace investigation

// 1. Fetch entire service dependency topology
MATCH (s:Service)-[r:DEPENDS_ON]->(target:Service)
RETURN s, r, target;

// 2. Find alerts triggered within an incident timeframe and the affected services
MATCH (a:Alert)-[:TRIGGERED_ON]->(s:Service)
RETURN a, s;
