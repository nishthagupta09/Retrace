import React, { useState } from 'react';

const SUGGESTIONS = [
  { label: 'Root Cause', text: 'Why might the Payments API be failing?' },
  { label: 'Affected Services', text: 'What services are affected by this failure?' },
  { label: 'Recent Changes', text: 'Which recent changes should we investigate?' },
  { label: 'Team Ownership', text: 'Which team owns the failing service and who is on call?' },
  { label: 'Full Trace', text: 'Trace the failure from checkout to the database.' },
];

export function InvestigationInput({ onSubmit, isLoading, error }) {
  const [question, setQuestion] = useState(
    'Why might the Payments API be failing?'
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;
    onSubmit(question.trim());
  };

  return (
    <section
      className="border border-canvas-border rounded-sm bg-canvas-surface p-4 sm:p-5 mb-5 sm:mb-6"
      aria-labelledby="investigation-form-heading"
    >
      <div className="flex items-center justify-between mb-2">
        <h2
          id="investigation-form-heading"
          className="text-xs sm:text-sm font-semibold text-ink uppercase font-sans tracking-wider"
        >
          Incident Investigation Inquiry
        </h2>
        <span className="text-[10px] font-mono text-ink-muted">
          AI Investigation &middot; FalkorDB Graph Tools
        </span>
      </div>

      <p className="text-xs text-ink-secondary mb-3 leading-relaxed">
        Ask an investigation question. The agent autonomously traverses service topologies, deployment history, and team ownership to synthesize findings.
      </p>

      {/* Suggested Quick Inquiries Grid */}
      <div className="mb-3">
        <span className="text-[11px] font-sans text-ink-secondary block mb-1.5 font-medium">
          Suggested Diagnostics:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setQuestion(item.text)}
              disabled={isLoading}
              className="px-2.5 py-1 text-[11px] font-sans border border-canvas-border rounded-sm bg-canvas-surface hover:bg-brand-orange-light hover:border-brand-primary transition-colors text-ink-secondary hover:text-brand-primary disabled:opacity-50 disabled:pointer-events-none"
              title={item.text}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label htmlFor="investigation-query-input" className="sr-only">
          Investigation Question
        </label>
        <div className="relative">
          <textarea
            id="investigation-query-input"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={isLoading}
            placeholder="e.g. Which team owns the failing service and who is on call?"
            className="w-full text-xs font-sans p-3 border border-canvas-border rounded-sm bg-canvas-surface text-ink focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-colors disabled:bg-canvas-subtle disabled:text-ink-muted resize-y"
          />
        </div>

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={isLoading || !question.trim()}
            className={`w-full sm:w-auto px-6 py-2.5 text-xs font-sans font-semibold rounded-sm transition-colors flex items-center justify-center space-x-2 shadow-xs ${
              isLoading || !question.trim()
                ? 'bg-[#E2E8F0] text-[#64748B] border border-[#CBD5E1] cursor-not-allowed shadow-none'
                : 'bg-brand-primary text-white hover:bg-brand-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1 cursor-pointer'
            }`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5 text-current shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Evaluating graph evidence...</span>
              </>
            ) : (
              <span>Run Investigation</span>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-3 p-3 border border-status-red-border bg-status-red-bg rounded-sm text-xs font-sans text-status-red flex items-start space-x-2">
          <span className="font-bold shrink-0">
            {error.includes('quota') || error.includes('temporarily unavailable') ? 'API Notice:' : 'Error:'}
          </span>
          <span className="flex-1 break-words leading-relaxed">{error}</span>
        </div>
      )}
    </section>
  );
}
