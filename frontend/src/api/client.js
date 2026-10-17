/**
 * Centralized API client for Retrace FastAPI backend.
 * Reads base URL from import.meta.env.VITE_API_URL or defaults to http://localhost:8000.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function handleResponse(response) {
  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson && errorJson.detail) {
        errorDetail = errorJson.detail;
      }
    } catch {
      // Non-JSON error body fallback
    }
    const err = new Error(errorDetail);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

export const api = {
  /**
   * Health check endpoint
   * GET /health -> { status: "ok"|"degraded", environment: "...", database: "...", graph: "..." }
   */
  async getHealth() {
    const res = await fetch(`${API_BASE_URL}/health`);
    return handleResponse(res);
  },

  /**
   * List active incidents
   * GET /api/incidents -> IncidentResponse[]
   */
  async getIncidents() {
    const res = await fetch(`${API_BASE_URL}/api/incidents`);
    return handleResponse(res);
  },

  /**
   * Downstream impact for a service
   * GET /api/services/{service_name}/impact -> ServiceImpactResponse
   */
  async getServiceImpact(serviceName) {
    const res = await fetch(`${API_BASE_URL}/api/services/${encodeURIComponent(serviceName)}/impact`);
    return handleResponse(res);
  },

  /**
   * Owning team metadata for a service
   * GET /api/services/{service_name}/owner -> ServiceOwnerResponse
   */
  async getServiceOwner(serviceName) {
    const res = await fetch(`${API_BASE_URL}/api/services/${encodeURIComponent(serviceName)}/owner`);
    return handleResponse(res);
  },

  /**
   * Recent deployments for a service
   * GET /api/services/{service_name}/recent-changes -> ServiceRecentChangesResponse
   */
  async getServiceRecentChanges(serviceName) {
    const res = await fetch(`${API_BASE_URL}/api/services/${encodeURIComponent(serviceName)}/recent-changes`);
    return handleResponse(res);
  },

  /**
   * AI Incident Investigation Agent
   * POST /api/investigate -> InvestigationResponse
   */
  async investigate(question) {
    const res = await fetch(`${API_BASE_URL}/api/investigate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question }),
    });
    return handleResponse(res);
  },

  /**
   * System topology for Graph Explorer
   * GET /api/graph/topology -> GraphTopologyResponse
   */
  async getGraphTopology() {
    const res = await fetch(`${API_BASE_URL}/api/graph/topology`);
    return handleResponse(res);
  },
};
