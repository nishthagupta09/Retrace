import React from 'react';

export function ServiceDetails({
  selectedService,
  ownerData,
  changesData,
  isLoading,
}) {
  if (!selectedService) {
    return (
      <div className="border border-canvas-border rounded-sm bg-canvas-surface p-6 text-center text-xs font-mono text-ink-muted">
        Select any service in the incident overview or dependency graph to view ownership and deployment history.
      </div>
    );
  }

  return (
    <section
      className="border border-canvas-border rounded-sm bg-canvas-surface p-4 sm:p-5 mb-5 sm:mb-6"
      aria-labelledby="service-details-heading"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-canvas-border mb-3 gap-1">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-brand-primary" aria-hidden="true" />
          <h2 id="service-details-heading" className="text-xs sm:text-sm font-semibold uppercase font-sans tracking-wider text-ink">
            Service Details: {selectedService}
          </h2>
        </div>
        {isLoading && (
          <span className="text-xs font-mono text-ink-muted animate-pulse">
            Loading evidence...
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Responsible Team */}
        <div>
          <h3 className="text-xs font-sans uppercase tracking-wider text-ink-muted font-semibold mb-2">
            Team Ownership &amp; On-Call Contact
          </h3>
          <div className="border border-canvas-border rounded-sm bg-canvas-surface p-3.5 text-xs font-mono space-y-2">
            {ownerData ? (
              <>
                <div className="flex flex-col sm:flex-row sm:justify-between py-1 border-b border-canvas-border gap-0.5">
                  <span className="text-ink-muted">Owning Team:</span>
                  <span className="font-semibold text-ink">{ownerData.team_name}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between py-1 border-b border-canvas-border gap-0.5">
                  <span className="text-ink-muted">Slack Channel:</span>
                  <span className="text-brand-primary font-semibold">{ownerData.slack_channel || 'N/A'}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between py-1 gap-0.5">
                  <span className="text-ink-muted">On-Call Responder:</span>
                  <span className="font-semibold text-ink break-all">{ownerData.oncall_email || 'N/A'}</span>
                </div>
              </>
            ) : (
              <div className="text-ink-muted py-2">
                No team ownership record found in FalkorDB for this service.
              </div>
            )}
          </div>
        </div>


        {/* Recent Deployments */}
        <div>
          <h3 className="text-xs font-sans uppercase tracking-wider text-ink-muted font-semibold mb-2">
            Recent Deployments (:CHANGED)
          </h3>
          <div className="border border-canvas-border rounded-sm bg-canvas-surface p-3 text-xs font-mono">
            {changesData?.changes?.length > 0 ? (
              <div className="space-y-2.5">
                {changesData.changes.map((change) => (
                  <div key={change.id} className="border border-canvas-border bg-canvas-subtle p-2.5 rounded-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-brand-primary">{change.version}</span>
                      <span className="text-[10px] text-ink-muted">{change.timestamp}</span>
                    </div>
                    <div className="text-ink text-[11px] leading-snug">
                      {change.description}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 text-[10px] text-ink-muted pt-1 border-t border-canvas-border">
                      <span>Commit: <code>{change.commit}</code></span>
                      <span>By: {change.deployed_by}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-ink-muted py-2">
                No recent deployments recorded in FalkorDB for this service.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
