import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api/client';
import { Navigation } from './components/Navigation';
import { IncidentBanner } from './components/IncidentBanner';
import { InvestigationInput } from './components/InvestigationInput';
import { InvestigationReport } from './components/InvestigationReport';
import { DependencyGraph } from './components/DependencyGraph';
import { ServiceDetails } from './components/ServiceDetails';
import { GraphExplorer } from './components/GraphExplorer';
import { ComplianceNotice } from './components/ComplianceNotice';

export function App() {
  const [activeTab, setActiveTab] = useState('investigation');
  const [health, setHealth] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [selectedService, setSelectedService] = useState('PaymentsAPI');

  // Evidence states
  const [impactData, setImpactData] = useState(null);
  const [ownerData, setOwnerData] = useState(null);
  const [changesData, setChangesData] = useState(null);
  const [isEvidenceLoading, setIsEvidenceLoading] = useState(false);

  // Investigation states
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [investigationReport, setInvestigationReport] = useState(null);
  const [investigationError, setInvestigationError] = useState(null);

  // Fetch health
  const refreshHealth = useCallback(async () => {
    try {
      const data = await api.getHealth();
      setHealth(data);
    } catch (err) {
      setHealth({
        status: 'degraded',
        database: 'disconnected',
        error: err.message,
      });
    }
  }, []);

  // Fetch incidents
  const fetchIncidents = useCallback(async () => {
    try {
      const data = await api.getIncidents();
      setIncidents(data);
      if (data.length > 0) {
        setSelectedIncident(data[0]);
        // Default to first affected service or PaymentsAPI
        const firstAffected = data[0].affected_services?.[0]?.name;
        if (firstAffected) {
          setSelectedService(firstAffected);
        }
      }
    } catch (err) {
      console.error('Failed to fetch incidents:', err);
    }
  }, []);

  // Fetch service evidence
  const loadServiceEvidence = useCallback(async (serviceName) => {
    if (!serviceName) return;
    setIsEvidenceLoading(true);
    try {
      const [impact, owner, changes] = await Promise.allSettled([
        api.getServiceImpact(serviceName),
        api.getServiceOwner(serviceName),
        api.getServiceRecentChanges(serviceName),
      ]);

      setImpactData(impact.status === 'fulfilled' ? impact.value : null);
      setOwnerData(owner.status === 'fulfilled' ? owner.value : null);
      setChangesData(changes.status === 'fulfilled' ? changes.value : null);
    } catch (err) {
      console.error('Failed to load service evidence:', err);
    } finally {
      setIsEvidenceLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshHealth();
    fetchIncidents();
  }, [refreshHealth, fetchIncidents]);

  useEffect(() => {
    if (selectedService) {
      loadServiceEvidence(selectedService);
    }
  }, [selectedService, loadServiceEvidence]);

  const handleRunInvestigation = async (question) => {
    setIsInvestigating(true);
    setInvestigationError(null);
    try {
      const report = await api.investigate(question);
      setInvestigationReport(report);

      // Synchronize service selection with the investigated service
      // 1. Check tool calls arguments for service_name
      let investigatedService = null;
      if (report.tool_calls && report.tool_calls.length > 0) {
        for (const call of report.tool_calls) {
          if (call.arguments?.service_name) {
            investigatedService = call.arguments.service_name;
            break;
          }
        }
      }

      // 2. If not found in tool calls, inspect affected services in active incident
      if (!investigatedService && selectedIncident?.affected_services?.length > 0) {
        const found = selectedIncident.affected_services.find((s) =>
          question.toLowerCase().includes(s.name.toLowerCase())
        );
        if (found) investigatedService = found.name;
      }

      if (investigatedService && investigatedService !== selectedService) {
        setSelectedService(investigatedService);
      }
    } catch (err) {
      let msg = err.message;
      if (err.status === 429) {
        msg = err.message || 'AI incident investigations are temporarily unavailable due to API rate limits. Graph Explorer and FalkorDB dependency queries remain fully operational.';
      } else if (err.status === 503) {
        msg = err.message || 'AI API Key is not configured on the backend. Please check GROQ_API_KEY in backend/.env.';
      } else if (err.status === 502) {
        msg = `AI model communication failure: ${err.message}`;
      }
      setInvestigationError(msg);
    } finally {
      setIsInvestigating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink font-sans">
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        health={health}
        onRefreshHealth={refreshHealth}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-x-hidden">
        {activeTab === 'compliance' ? (
          <ComplianceNotice />
        ) : activeTab === 'topology' ? (
          /* Graph Explorer Tab - System-focused workspace */
          <GraphExplorer />
        ) : (
          /* Investigation Tab - Incident-focused workflow */
          <>
            {/* 1. Incident Overview: What is broken? What else is affected? */}
            <IncidentBanner
              incident={selectedIncident}
              selectedService={selectedService}
              onSelectService={(name) => {
                setSelectedService(name);
              }}
            />

            {/* 2. Interactive Dependency Graph: Visual Centerpiece */}
            <DependencyGraph
              impactData={impactData}
              selectedService={selectedService}
              onSelectService={(name) => setSelectedService(name)}
            />

            {/* 3. AI Investigation Workspace (What might explain it? What to check next?) */}
            <InvestigationInput
              onSubmit={handleRunInvestigation}
              isLoading={isInvestigating}
              error={investigationError}
            />

            <InvestigationReport
              report={investigationReport}
              onSelectService={(name) => setSelectedService(name)}
            />

            {/* 4. Service Evidence (Ownership & Recent Changes) */}
            <ServiceDetails
              selectedService={selectedService}
              ownerData={ownerData}
              changesData={changesData}
              isLoading={isEvidenceLoading}
            />
          </>
        )}
      </main>

      <footer className="border-t border-canvas-border bg-canvas-surface py-3 sm:py-4 text-[11px] font-mono text-ink-muted">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-center sm:text-left">
          <span>
            Retrace Incident Investigation Agent &middot; Built on FalkorDB &amp; Google Gemini
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab('compliance')}
              className="hover:text-ink underline"
            >
              Terms &amp; Privacy Disclosures
            </button>
            <span>&middot;</span>
            <span>Local Environment</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
