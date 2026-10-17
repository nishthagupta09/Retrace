import React from 'react';

/**
 * Clean, safe Markdown renderer for investigation reports.
 * Supports:
 * - Markdown tables (| col | col | and separator rows |---|---|)
 * - HTML tags like <br>, <br/>, <hr>
 * - Headings (h1 - h4)
 * - Numbered lists with continuous sequential numbering
 * - Bulleted lists
 * - Inline bold, code tokens, and links
 */
function cleanRawTags(text) {
  if (!text) return '';
  // Replace <br> or <br/> with line breaks or spaces
  return text.replace(/<br\s*\/?>/gi, ' ');
}

function parseInline(text) {
  if (!text) return null;

  const cleanText = cleanRawTags(text);
  const tokens = [];
  let remaining = cleanText;
  let keyIdx = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);

    let firstMatch = null;
    let matchType = null;

    if (boldMatch && codeMatch) {
      if (boldMatch.index < codeMatch.index) {
        firstMatch = boldMatch;
        matchType = 'bold';
      } else {
        firstMatch = codeMatch;
        matchType = 'code';
      }
    } else if (boldMatch) {
      firstMatch = boldMatch;
      matchType = 'bold';
    } else if (codeMatch) {
      firstMatch = codeMatch;
      matchType = 'code';
    }

    if (!firstMatch) {
      tokens.push(<span key={keyIdx++}>{remaining}</span>);
      break;
    }

    if (firstMatch.index > 0) {
      tokens.push(
        <span key={keyIdx++}>{remaining.slice(0, firstMatch.index)}</span>
      );
    }

    if (matchType === 'bold') {
      tokens.push(
        <strong key={keyIdx++} className="font-semibold text-ink">
          {firstMatch[1]}
        </strong>
      );
    } else if (matchType === 'code') {
      tokens.push(
        <code
          key={keyIdx++}
          className="bg-canvas-subtle border border-canvas-border px-1.5 py-0.5 rounded text-[11px] font-mono text-brand-primary font-medium"
        >
          {firstMatch[1]}
        </code>
      );
    }

    remaining = remaining.slice(firstMatch.index + firstMatch[0].length);
  }

  return tokens;
}

export function MarkdownRenderer({ content }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements = [];
  let currentList = null;
  let listType = null;
  let elementIdx = 0;

  const flushList = () => {
    if (currentList && currentList.length > 0) {
      if (listType === 'ol') {
        elements.push(
          <ol key={elementIdx++} className="list-decimal list-outside pl-5 space-y-1 my-2.5 text-ink text-xs font-sans">
            {currentList}
          </ol>
        );
      } else {
        elements.push(
          <ul key={elementIdx++} className="list-disc list-outside pl-5 space-y-1 my-2.5 text-ink text-xs font-sans">
            {currentList}
          </ul>
        );
      }
      currentList = null;
      listType = null;
    }
  };

  // Helper to parse table rows
  const isTableRow = (line) => {
    const trimmed = line.trim();
    return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 1;
  };

  const isTableSeparator = (line) => {
    const trimmed = line.trim();
    return /^\|(\s*:?-+:?\s*\|)+$/.test(trimmed);
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Table detection: starts with a header row followed by separator row
    if (isTableRow(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushList();
      const headerCols = trimmed
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());

      i++; // Skip the separator row |---|---|
      const rows = [];

      // Collect data rows
      while (i + 1 < lines.length && isTableRow(lines[i + 1])) {
        i++;
        const rowCols = lines[i]
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());
        rows.push(rowCols);
      }

      elements.push(
        <div key={elementIdx++} className="my-3 overflow-x-auto border border-canvas-border rounded-sm">
          <table className="w-full text-left text-xs font-sans border-collapse">
            <thead>
              <tr className="bg-canvas-subtle border-b border-canvas-border">
                {headerCols.map((col, colIdx) => (
                  <th
                    key={colIdx}
                    className="p-2.5 font-semibold text-ink uppercase text-[10px] tracking-wider"
                  >
                    {parseInline(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-canvas-border bg-canvas-surface">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-canvas-subtle/50 transition-colors">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="p-2.5 text-ink leading-relaxed">
                      {parseInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Skip standalone table separator rows if any leak through
    if (isTableSeparator(trimmed)) {
      continue;
    }

    // Heading 4: ####
    if (trimmed.startsWith('#### ')) {
      flushList();
      elements.push(
        <h4 key={elementIdx++} className="text-xs font-sans font-bold uppercase tracking-wider text-ink mt-3 mb-1">
          {parseInline(trimmed.slice(5))}
        </h4>
      );
      continue;
    }

    // Heading 3: ###
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={elementIdx++} className="text-xs font-sans font-semibold uppercase tracking-wider text-ink-secondary mt-3 mb-1">
          {parseInline(trimmed.slice(4))}
        </h3>
      );
      continue;
    }

    // Heading 2: ##
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h2 key={elementIdx++} className="text-sm font-sans font-bold uppercase tracking-wider text-ink mt-4 mb-1.5 border-b border-canvas-border pb-1">
          {parseInline(trimmed.slice(3))}
        </h2>
      );
      continue;
    }

    // Heading 1: #
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h1 key={elementIdx++} className="text-base font-sans font-bold uppercase tracking-wide text-ink mt-4 mb-2">
          {parseInline(trimmed.slice(2))}
        </h1>
      );
      continue;
    }

    // Bullet list: - or *
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
        currentList = [];
      }
      currentList.push(
        <li key={currentList.length} className="text-xs leading-relaxed text-ink pl-1">
          {parseInline(trimmed.slice(2))}
        </li>
      );
      continue;
    }

    // Numbered list: 1. 2. or repeating 1.
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
        currentList = [];
      }
      currentList.push(
        <li key={currentList.length} className="text-xs leading-relaxed text-ink pl-1">
          {parseInline(numMatch[2])}
        </li>
      );
      continue;
    }

    // Horizontal Rule: ---
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushList();
      elements.push(
        <hr key={elementIdx++} className="my-3 border-canvas-border" />
      );
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={elementIdx++} className="text-xs leading-relaxed text-ink my-1.5 font-sans">
        {parseInline(trimmed)}
      </p>
    );
  }

  flushList();

  return <div className="space-y-1">{elements}</div>;
}
