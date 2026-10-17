import React from 'react';

/**
 * Plain-language Incident Overview component.
 * Answers:
 * 1. What is broken?
 * 2. What else is affected?
 */
export function IncidentBanner({ incident, onSelectService, selectedService }) {
  if (!incident) {
    return (
      <div className="border border-canvas-border rounded-sm bg-canvas-surface p-4 text-xs font-mono text-ink-muted">
        No active incident reported by FalkorDB graph.
      </div>
    );
  }

  const isCritical = incident.severity === 'SEV-1';
  const severityBadgeClass = isCritical
    ? 'bg-status-red-bg text-status-red border-status-red-border'
    : 'bg-status-amber-bg text-status-amber border-status-amber-border';

  // Plain-language title simplification
  const displayTitle =
    incident.title || 'Service degradation detected';

  // Human-readable summary explanation
  const failingServices = incident.affected_services?.filter(
    (s) => s.status === 'failing' || s.status === 'unreachable'
  ) || [];
  const degradedServices = incident.affected_services?.filter(
    (s) => s.status === 'degraded'
  ) || [];

  return (
    <section
      className="border border-canvas-border rounded-sm bg-canvas-surface p-4 sm:p-5 mb-5 sm:mb-6"
      aria-labelledby="incident-banner-heading"
    >
      {/* 1. Header: Severity & Plain Language Incident Title */}
      <div className="pb-3 border-b border-canvas-border mb-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center space-x-2">
            <span
              className={`px-2 py-0.5 text-xs font-mono font-semibold border rounded-sm ${severityBadgeClass}`}
            >
              {isCritical ? 'Critical' : 'Degraded'}
            </span>
            <span className="font-mono text-xs text-ink-muted">
              ({incident.severity} &middot; {incident.id})
            </span>
          </div>

          <div className="flex items-center space-x-3 text-xs font-mono text-ink-muted">
            <span>
              Status: <strong className="text-ink font-semibold capitalize">{incident.status}</strong>
            </span>
            {incident.started_at && (
              <span className="hidden sm:inline-block">
                Started: <time dateTime={incident.started_at}>{incident.started_at}</time>
              </span>
            )}
          </div>
        </div>

        <h2 id="incident-banner-heading" className="text-base sm:text-lg font-semibold text-ink leading-snug">
          {displayTitle}
        </h2>

        {/* Evidence-supported impact explanation */}
        <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
          {failingServices.length > 0 ? (
            <>
              <strong>{failingServices.map((s) => s.name).join(', ')}</strong> is reporting critical failures,
              causing upstream degradation in {degradedServices.map((s) => s.name).join(', ') || 'connected services'}.
            </>
          ) : (
            <>Investigating service alerts across connected dependencies.</>
          )}
        </p>
      </div>

      {/* 2. Directly Affected Services Status Blocks */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted font-semibold">
            Directly Affected Services (from graph :AFFECTS)
          </span>
          <span className="text-[10px] font-mono text-ink-muted">
            Click to inspect in graph
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {incident.affected_services?.map((svc) => {
            const isFailing = svc.status === 'failing' || svc.status === 'unreachable';
            const statusColor = isFailing ? 'text-status-red font-semibold' : 'text-status-amber font-semibold';
            const dotColor = isFailing ? 'bg-status-red' : 'bg-status-amber';
            const isSelected = selectedService === svc.name;

            return (
              <button
                key={svc.name}
                type="button"
                onClick={() => onSelectService && onSelectService(svc.name)}
                className={`flex items-center justify-between p-2.5 text-xs font-mono border rounded-sm transition-colors text-left ${
                  isSelected
                    ? 'border-brand-primary bg-brand-orange-light ring-1 ring-brand-primary'
                    : 'border-canvas-border bg-canvas-surface hover:bg-canvas-subtle hover:border-ink-secondary'
                }`}
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />
                  <span className="font-semibold text-ink truncate">{svc.name}</span>
                  {svc.tier && (
                    <span className="text-[10px] text-ink-muted shrink-0">
                      ({svc.tier})
                    </span>
                  )}
                </div>
                <span className={`text-[11px] uppercase shrink-0 ${statusColor}`}>
                  {svc.status}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
