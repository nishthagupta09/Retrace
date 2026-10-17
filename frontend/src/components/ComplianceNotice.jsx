import React from 'react';

export function ComplianceNotice() {
  return (
    <div className="border border-canvas-border rounded-sm bg-canvas-surface p-6 space-y-6 max-w-4xl mx-auto my-6">
      <div className="border-b border-canvas-border pb-3">
        <h2 className="text-base font-semibold font-mono uppercase tracking-wider text-ink">
          Terms of Use &amp; Privacy Disclosures
        </h2>
        <p className="text-xs font-mono text-ink-muted mt-1">
          Honest disclosures regarding prototype status and data handling.
        </p>
      </div>

      <div className="space-y-4 text-xs font-sans text-ink leading-relaxed">
        <div>
          <h3 className="font-mono font-semibold uppercase text-xs text-ink-secondary mb-1">
            1. Incident Investigation Prototype Notice
          </h3>
          <p>
            Retrace is an experimental AI-assisted incident investigation workspace developed for demonstration and engineering evaluation. It is not an automated replacement for human operational incident command.
          </p>
        </div>

        <div>
          <h3 className="font-mono font-semibold uppercase text-xs text-ink-secondary mb-1">
            2. Synthetic Demonstration Data
          </h3>
          <p>
            All topology graphs, service names, deployment timestamps, commits, and incident alerts displayed in this demonstration environment are synthetic fixtures generated in a local FalkorDB container. No production systems or customer credentials are stored or queried.
          </p>
        </div>

        <div>
          <h3 className="font-mono font-semibold uppercase text-xs text-ink-secondary mb-1">
            3. AI Provider &amp; Data Processing
          </h3>
          <p>
            Investigation inquiries submitted to the prompt interface are evaluated by the configured Google Gemini API model via the official Google GenAI Python SDK running on the FastAPI backend. Do not submit production secrets, private keys, or personal confidential data into the prompt field.
          </p>
        </div>

        <div>
          <h3 className="font-mono font-semibold uppercase text-xs text-ink-secondary mb-1">
            4. Limitation of Warranty
          </h3>
          <p>
            AI-generated hypotheses and recommendations are probabilistic inferences and must be manually verified against actual application telemetry, logs, and database metrics before initiating production changes or rollbacks.
          </p>
        </div>
      </div>
    </div>
  );
}
