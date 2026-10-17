import React from 'react';

export function Navigation({ activeTab, setActiveTab, health, onRefreshHealth }) {
  const isHealthy = health?.status === 'ok' && health?.database === 'connected';

  return (
    <header className="border-b border-canvas-border bg-canvas-surface sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 py-2.5">
          {/* Wordmark & Badge */}
          <div className="flex items-center space-x-2.5 shrink-0">
            <span className="font-sans font-bold tracking-tight text-ink text-lg uppercase flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-brand-primary inline-block" />
              <span>Retrace</span>
            </span>
            <span className="hidden sm:inline-block text-[11px] font-mono text-ink-secondary px-2 py-0.5 border border-canvas-border rounded-sm bg-canvas-subtle">
              Incident Diagnostics
            </span>
          </div>

          {/* Desktop & Tablet Navigation */}
          <nav className="hidden sm:flex space-x-1" aria-label="Main Navigation">
            <button
              type="button"
              onClick={() => setActiveTab('investigation')}
              className={`px-3 py-1.5 text-xs font-sans rounded-sm border transition-colors ${
                activeTab === 'investigation'
                  ? 'border-brand-primary text-brand-primary bg-brand-orange-light font-semibold'
                  : 'border-transparent text-ink-secondary hover:text-ink hover:border-canvas-border'
              }`}
            >
              Investigation
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('topology')}
              className={`px-3 py-1.5 text-xs font-sans rounded-sm border transition-colors ${
                activeTab === 'topology'
                  ? 'border-brand-primary text-brand-primary bg-brand-orange-light font-semibold'
                  : 'border-transparent text-ink-secondary hover:text-ink hover:border-canvas-border'
              }`}
            >
              Graph Explorer
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('compliance')}
              className={`px-3 py-1.5 text-xs font-sans rounded-sm border transition-colors ${
                activeTab === 'compliance'
                  ? 'border-brand-primary text-brand-primary bg-brand-orange-light font-semibold'
                  : 'border-transparent text-ink-secondary hover:text-ink hover:border-canvas-border'
              }`}
            >
              Terms &amp; Disclosures
            </button>
          </nav>

          {/* Health Pill */}
          <div className="flex items-center space-x-2 text-xs font-mono shrink-0">
            <div className="flex items-center space-x-1.5 px-2 py-1 border border-canvas-border rounded-sm bg-canvas-subtle text-[11px]">

              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  isHealthy ? 'bg-status-green' : 'bg-status-red'
                }`}
                aria-hidden="true"
              />
              <span className="text-ink-secondary">
                FalkorDB:{' '}
                <strong className={isHealthy ? 'text-status-green font-semibold' : 'text-status-red font-semibold'}>
                  {health?.database || '...'}
                </strong>
              </span>
            </div>

            <button
              type="button"
              onClick={onRefreshHealth}
              title="Refresh connectivity"
              aria-label="Refresh FalkorDB connectivity"
              className="text-ink-muted hover:text-ink p-1 border border-canvas-border rounded-sm bg-canvas hover:bg-canvas-subtle"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <nav className="sm:hidden flex border-t border-canvas-border py-1.5 justify-between gap-1" aria-label="Mobile Navigation">
          <button
            type="button"
            onClick={() => setActiveTab('investigation')}
            className={`flex-1 text-center py-1 text-[11px] font-sans rounded-sm border transition-colors ${
              activeTab === 'investigation'
                ? 'border-brand-primary text-brand-primary bg-brand-blue-light font-semibold'
                : 'border-transparent text-ink-secondary hover:text-ink'
            }`}
          >
            Investigate
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('topology')}
            className={`flex-1 text-center py-1 text-[11px] font-sans rounded-sm border transition-colors ${
              activeTab === 'topology'
                ? 'border-brand-primary text-brand-primary bg-brand-blue-light font-semibold'
                : 'border-transparent text-ink-secondary hover:text-ink'
            }`}
          >
            Topology
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('compliance')}
            className={`flex-1 text-center py-1 text-[11px] font-sans rounded-sm border transition-colors ${
              activeTab === 'compliance'
                ? 'border-brand-primary text-brand-primary bg-brand-blue-light font-semibold'
                : 'border-transparent text-ink-secondary hover:text-ink'
            }`}
          >
            Disclosures
          </button>
        </nav>
      </div>
    </header>
  );
}
