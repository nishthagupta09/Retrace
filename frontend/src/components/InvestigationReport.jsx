import React from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';

/**
 * Plain-language Investigation Report.
 * Structured into:
 * A. What we know (Verified graph facts)
 * B. What might explain it (Hypotheses & relevant recent changes)
 * C. What to check next (Recommended next steps & responders)
 * Optional: Investigation details (Tool execution trace)
 */
export function InvestigationReport({ report, onSelectService }) {
  if (!report) return null;

  return (
    <article
      className="border border-canvas-border rounded-sm bg-canvas-surface p-4 sm:p-6 mb-5 sm:mb-6 space-y-6"
      aria-labelledby="report-heading"
    >
      {/* Header */}
      <div className="border-b border-canvas-border pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-primary" aria-hidden="true" />
            <h2 id="report-heading" className="text-xs sm:text-sm font-semibold uppercase font-sans tracking-wider text-ink">
              Incident Investigation Findings
            </h2>
          </div>
          <p className="text-[11px] font-mono text-ink-muted mt-0.5 break-words">
            Inquiry: "{report.question}"
          </p>
        </div>
        <div className="text-[11px] font-mono text-ink-secondary shrink-0">
          Tools executed: <strong className="text-ink">{report.tool_calls?.length || 0}</strong>
        </div>
      </div>

      {/* Synthesis / Executive Summary */}
      <div>
        <h3 className="text-xs font-sans uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
          Executive Summary
        </h3>
        <div className="bg-canvas-subtle border border-canvas-border p-3.5 sm:p-4 rounded-sm break-words">
          <MarkdownRenderer content={report.answer} />
        </div>
      </div>

      {/* Section A: What we know (Verified Facts) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-teal shrink-0" aria-hidden="true" />
            <h3 className="text-xs font-sans uppercase tracking-wider text-ink font-semibold">
              Verified System Evidence
            </h3>
          </div>
          <span className="text-[10px] font-sans font-semibold uppercase tracking-wider px-2 py-0.5 rounded-xs bg-brand-teal/10 text-brand-teal border border-brand-teal/20">
            Confirmed Graph Ground Truth
          </span>
        </div>
        <div className="border border-canvas-border rounded-sm bg-canvas p-3 text-xs font-sans text-ink space-y-2">
          {report.verified_facts?.length > 0 ? (
            report.verified_facts.map((fact, idx) => (
              <div key={idx} className="flex items-start space-x-2">
                <span className="text-brand-teal font-bold select-none shrink-0 mt-0.5">&bull;</span>
                <span className="break-words leading-relaxed font-sans">{fact}</span>
              </div>
            ))
          ) : (
            <span className="text-ink-muted font-sans text-xs">No direct graph facts recorded.</span>
          )}
        </div>
      </div>

      {/* Section B: What might explain it (Hypotheses) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-status-amber shrink-0" aria-hidden="true" />
            <h3 className="text-xs font-sans uppercase tracking-wider text-ink font-semibold">
              Hypotheses to Validate
            </h3>
          </div>
          <span className="text-[10px] font-sans font-semibold uppercase tracking-wider px-2 py-0.5 rounded-xs bg-status-amber/10 text-status-amber border border-status-amber/20">
            Unverified · Requires Telemetry Check
          </span>
        </div>
        <div className="border border-status-amber/20 rounded-sm bg-canvas p-3 text-xs font-sans text-ink space-y-2">
          {report.hypotheses?.length > 0 ? (
            report.hypotheses.map((hypo, idx) => (
              <div key={idx} className="flex items-start space-x-2">
                <span className="text-status-amber font-bold select-none shrink-0 mt-0.5">&bull;</span>
                <span className="break-words leading-relaxed font-sans">{hypo}</span>
              </div>
            ))
          ) : (
            <span className="text-ink-muted font-sans text-xs">No speculative hypotheses generated.</span>
          )}
        </div>
      </div>

      {/* Section C: What to check next (Actionable Next Steps) */}
      {report.recommended_next_steps?.length > 0 && (
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-status-green shrink-0" aria-hidden="true" />
            <h3 className="text-xs font-sans uppercase tracking-wider text-ink font-semibold">
              Recommended Actions
            </h3>
          </div>
          <div className="border border-status-green-border bg-status-green-bg p-3.5 rounded-sm text-xs font-sans text-ink space-y-2.5">
            {report.recommended_next_steps.map((step, idx) => (
              <div key={idx} className="flex items-start space-x-2.5">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-status-green text-[10px] font-bold text-white select-none shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span className="break-words leading-relaxed font-sans">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collapsible Tool Execution Trace */}
      {report.tool_calls?.length > 0 && (
        <details className="border border-canvas-border rounded-sm bg-canvas-subtle p-3 text-xs font-mono">
          <summary className="cursor-pointer font-semibold text-ink-secondary hover:text-ink">
            Investigation details ({report.tool_calls.length} tool executions against FalkorDB)
          </summary>
          <div className="mt-3 space-y-2.5 pt-3 border-t border-canvas-border">
            {report.tool_calls.map((call, idx) => (
              <div key={idx} className="border border-canvas-border rounded-sm bg-canvas p-2.5 space-y-1">
                <div className="flex items-center justify-between font-semibold text-ink">
                  <span>Tool: {call.tool}</span>
                  <span className="text-ink-muted text-[10px]">Call #{idx + 1}</span>
                </div>
                <div className="text-[11px] text-ink-muted break-all">
                  Arguments: <code>{JSON.stringify(call.arguments)}</code>
                </div>
                <pre className="text-[10px] overflow-x-auto p-2 bg-canvas-subtle rounded-sm text-ink-secondary max-h-44 overflow-y-auto">
                  {JSON.stringify(call.result, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}
