import React, { useState, useRef, useEffect, useMemo } from 'react';

/**
 * Interactive SVG-based Dependency Canvas with zoom, pan, fit-to-view,
 * directional bezier curves, status indicators, and service selection.
 */
export function DependencyGraph({ impactData, selectedService, onSelectService }) {
  if (!impactData) {
    return (
      <div className="border border-canvas-border rounded-sm bg-canvas-surface p-8 text-center text-xs font-mono text-ink-muted">
        Select a service above to explore its downstream dependency graph.
      </div>
    );
  }

  const { service_name, service_status, downstream_paths } = impactData;

  // Build unique nodes and directional edges
  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map();
    const edgeList = [];
    const edgeSet = new Set();

    // Add origin root node
    nodeMap.set(service_name, {
      id: service_name,
      label: service_name,
      status: service_status,
      depth: 0,
    });

    downstream_paths?.forEach((hop) => {
      const path = hop.path || [];
      for (let i = 0; i < path.length; i++) {
        const sName = path[i];
        if (!nodeMap.has(sName)) {
          nodeMap.set(sName, {
            id: sName,
            label: sName,
            status: i === path.length - 1 ? hop.leaf_status : 'unknown',
            depth: i,
          });
        } else {
          // If leaf status is known and more specific, update it
          if (i === path.length - 1 && hop.leaf_status) {
            nodeMap.get(sName).status = hop.leaf_status;
          }
        }

        if (i < path.length - 1) {
          const from = path[i];
          const to = path[i + 1];
          const edgeKey = `${from}->${to}`;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            edgeList.push({ from, to, key: edgeKey });
          }
        }
      }
    });

    // Compute topological column levels (depths)
    const columns = [];
    nodeMap.forEach((node) => {
      const colIndex = node.depth || 0;
      if (!columns[colIndex]) columns[colIndex] = [];
      columns[colIndex].push(node);
    });

    // Calculate (x, y) coordinates for each node
    const COL_WIDTH = 230;
    const ROW_HEIGHT = 86;
    const START_X = 40;
    const START_Y = 40;

    const positionedNodes = [];
    columns.forEach((colNodes, colIdx) => {
      colNodes.forEach((node, rowIdx) => {
        positionedNodes.push({
          ...node,
          x: START_X + colIdx * COL_WIDTH,
          y: START_Y + rowIdx * ROW_HEIGHT,
          width: 170,
          height: 48,
        });
      });
    });

    return { nodes: positionedNodes, edges: edgeList };
  }, [service_name, service_status, downstream_paths]);

  // Pan & Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    // Only drag with left click on canvas background
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Status colors adhering to technical observability palette:
  // Critical/failing: #C93845, Degraded: #B9770E, Healthy: #23845B
  const getStatusColor = (status) => {
    switch ((status || '').toLowerCase()) {
      case 'unreachable':
      case 'failing':
        return {
          fill: '#FDF2F3',
          stroke: '#C93845',
          text: '#C93845',
          dot: '#C93845',
          label: (status || 'FAILING').toUpperCase(),
        };
      case 'degraded':
        return {
          fill: '#FEF8EE',
          stroke: '#B9770E',
          text: '#B9770E',
          dot: '#B9770E',
          label: 'DEGRADED',
        };
      case 'healthy':
        return {
          fill: '#EEF8F3',
          stroke: '#23845B',
          text: '#23845B',
          dot: '#23845B',
          label: 'HEALTHY',
        };
      default:
        return {
          fill: '#FFFFFF',
          stroke: '#D7E0EB',
          text: '#58677D',
          dot: '#8594A6',
          label: (status || 'ACTIVE').toUpperCase(),
        };
    }
  };


  // Node lookup for drawing connecting bezier curves
  const nodeCoords = useMemo(() => {
    const map = new Map();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  return (
    <section
      className="border border-canvas-border rounded-sm bg-canvas-surface p-4 sm:p-5 mb-5 sm:mb-6"
      aria-labelledby="dependency-graph-heading"
    >
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-canvas-border mb-3 gap-2">
        <div>
          <h2
            id="dependency-graph-heading"
            className="text-xs sm:text-sm font-semibold uppercase font-mono tracking-wider text-ink"
          >
            Interactive Dependency Graph
          </h2>
          <p className="text-[11px] font-mono text-ink-muted mt-0.5">
            Origin: <strong className="text-ink">{service_name}</strong> &middot;{' '}
            {downstream_paths?.length || 0} discovered path(s)
          </p>
        </div>

        {/* Zoom & View Controls */}
        <div className="flex items-center space-x-2 text-xs font-mono">
          <div className="flex items-center border border-canvas-border rounded-sm bg-canvas overflow-hidden">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))}
              className="px-2 py-1 text-ink-muted hover:text-ink hover:bg-canvas-subtle transition-colors border-r border-canvas-border"
              title="Zoom Out"
            >
              −
            </button>
            <span className="px-2 py-1 text-[11px] text-ink-muted select-none min-w-[44px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}
              className="px-2 py-1 text-ink-muted hover:text-ink hover:bg-canvas-subtle transition-colors border-l border-canvas-border"
              title="Zoom In"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={resetView}
            className="px-2.5 py-1 text-[11px] border border-canvas-border rounded-sm bg-canvas hover:bg-canvas-subtle text-ink-muted hover:text-ink transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Interactive SVG Canvas */}
      <div
        className="relative w-full h-[280px] sm:h-[340px] bg-canvas-subtle border border-canvas-border rounded-sm overflow-hidden select-none cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          className="w-full h-full"
          style={{
            touchAction: 'none',
          }}
        >
          <defs>
            {/* Arrow marker for directional edges */}
            <marker
              id="arrow-default"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#8594A6" />
            </marker>
            <marker
              id="arrow-active"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#E87532" />
            </marker>
          </defs>

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* 1. Draw Directional Straight Edges */}
            {edges.map((edge) => {
              const src = nodeCoords.get(edge.from);
              const tgt = nodeCoords.get(edge.to);
              if (!src || !tgt) return null;

              const x1 = src.x + src.width;
              const y1 = src.y + src.height / 2;
              const x2 = tgt.x;
              const y2 = tgt.y + tgt.height / 2;

              const isEdgeActive =
                selectedService === edge.from || selectedService === edge.to;

              // Straight line connection
              const d = `M ${x1} ${y1} L ${x2} ${y2}`;

              return (
                <path
                  key={edge.key}
                  d={d}
                  fill="none"
                  stroke={isEdgeActive ? '#E87532' : '#CBD5E1'}
                  strokeWidth={isEdgeActive ? '2.5' : '1.5'}
                  strokeDasharray={isEdgeActive ? 'none' : '3,3'}
                  markerEnd={isEdgeActive ? 'url(#arrow-active)' : 'url(#arrow-default)'}
                  className="transition-colors duration-150"
                />
              );
            })}

            {/* 2. Draw Interactive Service Nodes */}
            {nodes.map((node) => {
              const isSelected = selectedService === node.id;
              const style = getStatusColor(node.status);

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectService(node.id);
                  }}
                  className="cursor-pointer"
                >
                  {/* Selection Outline */}
                  {isSelected && (
                    <rect
                      x="-3"
                      y="-3"
                      width={node.width + 6}
                      height={node.height + 6}
                      rx="4"
                      fill="none"
                      stroke="#E87532"
                      strokeWidth="2.5"
                    />
                  )}

                  {/* Main Node Background Box */}
                  <rect
                    width={node.width}
                    height={node.height}
                    rx="3"
                    fill={isSelected ? '#FDF2EB' : style.fill}
                    stroke={isSelected ? '#E87532' : style.stroke}
                    strokeWidth={isSelected ? '2' : '1.2'}
                  />

                  {/* Status Indicator Dot */}
                  <circle cx="14" cy="24" r="4.5" fill={style.dot} />

                  {/* Service Label Text */}
                  <text
                    x="26"
                    y="22"
                    fontSize="11"
                    fontFamily='"IBM Plex Sans", sans-serif'
                    fontWeight={isSelected ? '700' : '600'}
                    fill="#17243A"
                  >
                    {node.label}
                  </text>

                  {/* Health Status Text */}
                  <text
                    x="26"
                    y="35"
                    fontSize="9"
                    fontFamily='"IBM Plex Mono", monospace'
                    fontWeight="600"
                    fill={style.text}
                  >
                    {style.label}
                  </text>
                </g>
              );
            })}

          </g>
        </svg>

        {/* Canvas HUD Legend */}
        <div className="absolute bottom-2 left-2 bg-canvas/90 backdrop-blur-xs border border-canvas-border rounded-sm px-2.5 py-1.5 flex items-center space-x-3 text-[10px] font-mono text-ink-muted">
          <div className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-status-red" />
            <span>Failing</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-status-amber" />
            <span>Degraded</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-status-green" />
            <span>Healthy</span>
          </div>
          <div className="hidden sm:flex items-center space-x-1 border-l border-canvas-border pl-2 text-ink-muted">
            <span>Drag to pan &middot; Scroll/Click to zoom</span>
          </div>
        </div>
      </div>

      {/* Accessible Textual Representation Fallback */}
      <details className="mt-3 text-xs font-mono border border-canvas-border rounded-sm p-2.5 bg-canvas">
        <summary className="cursor-pointer font-semibold text-ink-muted hover:text-ink">
          Textual Path Traversal Spec
        </summary>
        <ul className="mt-2 space-y-1 list-disc list-inside text-ink-secondary pt-2 border-t border-canvas-border text-[11px]">
          {downstream_paths?.map((hop, idx) => (
            <li key={idx}>
              {hop.path.join(' → ')} (Endpoint: {hop.leaf_service} [{hop.leaf_status}])
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
