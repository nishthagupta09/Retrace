import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api/client';

/**
 * System-focused Graph Explorer Workspace.
 * Explores the broader system topology independently of a single incident.
 * Features:
 * 1. Search services by name with quick jump/focus.
 * 2. Filter by health/status (All, failing, degraded, healthy).
 * 3. Filter by owning team (All + distinct teams from FalkorDB).
 * 4. Select a node to view its upstream dependencies, downstream dependents, team, and recent changes.
 * 5. Dependency isolation: Focus button to isolate upstream & downstream neighbors.
 * 6. Interactive zoom, pan, and reset-view controls.
 * 7. Compact HUD legend for node health & edge semantics.
 */
export function GraphExplorer() {
  const [topology, setTopology] = useState({ nodes: [], edges: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters and search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedTeam, setSelectedTeam] = useState('ALL');
  const [focusedService, setFocusedService] = useState(null);

  // Selected node inspection state
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [nodeOwner, setNodeOwner] = useState(null);
  const [nodeChanges, setNodeChanges] = useState(null);
  const [isLoadingNodeDetails, setIsLoadingNodeDetails] = useState(false);

  // Pan / Zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Load topology from FalkorDB
  const loadTopology = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getGraphTopology();
      setTopology(data);
      if (data.nodes.length > 0 && !selectedNodeId) {
        setSelectedNodeId(data.nodes[0].name);
      }
    } catch (err) {
      console.error('Failed to load graph topology:', err);
      setError(err.message || 'Failed to load graph topology');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTopology();
  }, []);

  // Fetch node owner and changes when selectedNodeId changes
  useEffect(() => {
    if (!selectedNodeId) return;

    let isMounted = true;
    setIsLoadingNodeDetails(true);

    Promise.allSettled([
      api.getServiceOwner(selectedNodeId),
      api.getServiceRecentChanges(selectedNodeId),
    ]).then(([ownerRes, changesRes]) => {
      if (!isMounted) return;
      setNodeOwner(ownerRes.status === 'fulfilled' ? ownerRes.value : null);
      setNodeChanges(changesRes.status === 'fulfilled' ? changesRes.value : null);
      setIsLoadingNodeDetails(false);
    });

    return () => {
      isMounted = false;
    };
  }, [selectedNodeId]);

  // Extract distinct teams from real FalkorDB data
  const availableTeams = useMemo(() => {
    const teams = new Set();
    topology.nodes.forEach((n) => {
      const team = n.team_name || n.team;
      if (team) teams.add(team);
    });
    return Array.from(teams).sort();
  }, [topology.nodes]);

  // Compute upstream and downstream sets for the selected node
  const { directUpstream, directDownstream } = useMemo(() => {
    if (!selectedNodeId) return { directUpstream: [], directDownstream: [] };

    const upstream = []; // nodes that selectedNodeId depends on (selected -> target)
    const downstream = []; // nodes that depend on selectedNodeId (source -> selected)

    topology.edges.forEach((e) => {
      const src = e.from_node || e.source;
      const tgt = e.to_node || e.target;
      if (src === selectedNodeId) {
        upstream.push(tgt);
      }
      if (tgt === selectedNodeId) {
        downstream.push(src);
      }
    });

    return {
      directUpstream: Array.from(new Set(upstream)),
      directDownstream: Array.from(new Set(downstream)),
    };
  }, [selectedNodeId, topology.edges]);

  // Filter nodes based on search, status, team, and optional focusedService isolation
  const filteredNodes = useMemo(() => {
    let list = topology.nodes;

    if (focusedService) {
      // Keep focused service, its upstream targets, and downstream sources
      const allowed = new Set([focusedService]);
      topology.edges.forEach((e) => {
        const src = e.from_node || e.source;
        const tgt = e.to_node || e.target;
        if (src === focusedService) allowed.add(tgt);
        if (tgt === focusedService) allowed.add(src);
      });
      list = list.filter((n) => allowed.has(n.name));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((n) => n.name.toLowerCase().includes(q));
    }

    if (selectedStatus !== 'ALL') {
      list = list.filter((n) => (n.status || 'unknown').toLowerCase() === selectedStatus.toLowerCase());
    }

    if (selectedTeam !== 'ALL') {
      list = list.filter((n) => (n.team_name || n.team) === selectedTeam);
    }

    return list;
  }, [topology.nodes, topology.edges, focusedService, searchQuery, selectedStatus, selectedTeam]);

  const visibleNodeNames = useMemo(() => new Set(filteredNodes.map((n) => n.name)), [filteredNodes]);

  // Visible edges where both source and target are visible
  const visibleEdges = useMemo(() => {
    return topology.edges.filter((e) => {
      const src = e.from_node || e.source;
      const tgt = e.to_node || e.target;
      return visibleNodeNames.has(src) && visibleNodeNames.has(tgt);
    });
  }, [topology.edges, visibleNodeNames]);


  // Container ref to measure actual viewport size for fitting
  const containerRef = useRef(null);

  // Compute layout coordinates for visible nodes with clean left-to-right topological order
  const layoutNodes = useMemo(() => {
    if (filteredNodes.length === 0) return [];

    const nodeNames = new Set(filteredNodes.map((n) => n.name));

    // Calculate topological levels based on outgoing/incoming paths
    const adj = new Map();
    const revAdj = new Map();
    nodeNames.forEach((name) => {
      adj.set(name, []);
      revAdj.set(name, []);
    });

    visibleEdges.forEach((e) => {
      const src = e.from_node || e.source;
      const tgt = e.to_node || e.target;
      if (nodeNames.has(src) && nodeNames.has(tgt)) {
        adj.get(src).push(tgt);
        revAdj.get(tgt).push(src);
      }
    });

    // Level assignment: roots (no incoming visible edges) start at level 0
    const levelMap = new Map();
    nodeNames.forEach((name) => {
      if (revAdj.get(name).length === 0) {
        levelMap.set(name, 0);
      }
    });

    // Propagate levels through BFS / longest path
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 10) {
      changed = false;
      iterations++;
      visibleEdges.forEach((e) => {
        const src = e.from_node || e.source;
        const tgt = e.to_node || e.target;
        if (nodeNames.has(src) && nodeNames.has(tgt)) {
          const srcLevel = levelMap.get(src) ?? 0;
          const currTgtLevel = levelMap.get(tgt) ?? 0;
          if (srcLevel + 1 > currTgtLevel) {
            levelMap.set(tgt, srcLevel + 1);
            changed = true;
          }
        }
      });
    }

    // Group into columns by level
    const cols = [];
    filteredNodes.forEach((n) => {
      const lvl = Math.min(levelMap.get(n.name) ?? 0, 5);
      if (!cols[lvl]) cols[lvl] = [];
      cols[lvl].push(n);
    });

    // Dynamic node dimension and spacing
    const NODE_WIDTH = 210;
    const NODE_HEIGHT = 58;
    const COL_GAP = 70;
    const ROW_GAP = 30;
    const COL_WIDTH = NODE_WIDTH + COL_GAP;
    const ROW_HEIGHT = NODE_HEIGHT + ROW_GAP;
    const START_X = 40;
    const START_Y = 40;

    const result = [];
    cols.forEach((colList, colIdx) => {
      if (!colList) return;
      colList.forEach((n, rowIdx) => {
        result.push({
          ...n,
          id: n.name,
          label: n.name,
          x: START_X + colIdx * COL_WIDTH,
          y: START_Y + rowIdx * ROW_HEIGHT,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        });
      });
    });

    return result;
  }, [filteredNodes, visibleEdges]);

  // Node position dictionary for fast straight edge rendering
  const nodePosMap = useMemo(() => {
    const map = new Map();
    layoutNodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [layoutNodes]);

  // Auto-fit function to calculate optimal initial zoom and pan so all nodes fit with comfortable margins
  const fitToView = () => {
    if (!layoutNodes.length || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cWidth = rect.width || 700;
    const cHeight = rect.height || 450;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    layoutNodes.forEach((n) => {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + n.width);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y + n.height);
    });

    const graphWidth = maxX - minX + 60;
    const graphHeight = maxY - minY + 60;

    const scaleX = (cWidth - 60) / graphWidth;
    const scaleY = (cHeight - 60) / graphHeight;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.55), 1.05);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setZoom(Number(newZoom.toFixed(2)));
    setPan({
      x: Math.round(cWidth / 2 - centerX * newZoom),
      y: Math.round(cHeight / 2 - centerY * newZoom),
    });
  };

  // Run fitToView on first load or when filters change
  useEffect(() => {
    if (layoutNodes.length > 0) {
      fitToView();
    }
  }, [filteredNodes.length, focusedService]);

  // Ensure selected node remains in view when focused
  useEffect(() => {
    if (!selectedNodeId || !nodePosMap.has(selectedNodeId) || !containerRef.current) return;
    const node = nodePosMap.get(selectedNodeId);
    const rect = containerRef.current.getBoundingClientRect();
    const cWidth = rect.width || 700;
    const cHeight = rect.height || 450;

    // Check if node is outside current viewport bounds
    const screenX = pan.x + node.x * zoom;
    const screenY = pan.y + node.y * zoom;
    const nodeScreenWidth = node.width * zoom;
    const nodeScreenHeight = node.height * zoom;

    const isOutOfBounds =
      screenX < 20 ||
      screenY < 20 ||
      screenX + nodeScreenWidth > cWidth - 20 ||
      screenY + nodeScreenHeight > cHeight - 20;

    if (isOutOfBounds) {
      // Smoothly recenter pan on the selected node
      setPan({
        x: Math.round(cWidth / 2 - (node.x + node.width / 2) * zoom),
        y: Math.round(cHeight / 2 - (node.y + node.height / 2) * zoom),
      });
    }
  }, [selectedNodeId]);

  // Pan / Zoom handlers
  const handleMouseDown = (e) => {
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
    setFocusedService(null);
    setSearchQuery('');
    setSelectedStatus('ALL');
    setSelectedTeam('ALL');
    setTimeout(() => {
      fitToView();
    }, 50);
  };

  const getNodeColorStyle = (status) => {
    switch ((status || '').toLowerCase()) {
      case 'unreachable':
      case 'failing':
        return {
          fill: '#FDF2F3',
          stroke: '#C93845',
          dot: '#C93845',
          text: '#C93845',
          label: (status || 'FAILING').toUpperCase(),
        };
      case 'degraded':
        return {
          fill: '#FEF8EE',
          stroke: '#B9770E',
          dot: '#B9770E',
          text: '#B9770E',
          label: 'DEGRADED',
        };
      case 'healthy':
        return {
          fill: '#EEF8F3',
          stroke: '#23845B',
          dot: '#23845B',
          text: '#23845B',
          label: 'HEALTHY',
        };
      default:
        return {
          fill: '#FFFFFF',
          stroke: '#D7E0EB',
          dot: '#8594A6',
          text: '#58677D',
          label: (status || 'ACTIVE').toUpperCase(),
        };
    }
  };

  return (
    <div className="space-y-4">
      {/* Explorer Header & Controls */}
      <div className="border border-canvas-border rounded-sm bg-canvas-surface p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-canvas-border pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-primary" />
              <h2 className="text-xs sm:text-sm font-semibold uppercase font-sans tracking-wider text-ink">
                System Topology Explorer
              </h2>
            </div>
            <p className="text-[11px] font-sans text-ink-secondary mt-0.5">
              Live service dependency graph sourced from FalkorDB. Explore topology, isolate connections, and inspect ownership.
            </p>
          </div>
          <div className="flex items-center space-x-2 text-xs font-mono shrink-0">
            <span className="px-2 py-0.5 border border-canvas-border rounded-sm bg-canvas-subtle text-ink-secondary text-[11px]">
              Services: <strong>{filteredNodes.length}</strong> / {topology.nodes.length}
            </span>
            <span className="px-2 py-0.5 border border-canvas-border rounded-sm bg-canvas-subtle text-ink-secondary text-[11px]">
              Edges: <strong>{visibleEdges.length}</strong> / {topology.edges.length}
            </span>
            <button
              type="button"
              onClick={fitToView}
              className="px-2.5 py-1 border border-canvas-border rounded-sm bg-canvas-surface hover:bg-canvas-subtle text-[11px] font-sans text-ink-secondary hover:text-brand-primary transition-colors"
              title="Fit graph to viewport"
            >
              Fit View
            </button>
            <button
              type="button"
              onClick={resetView}
              className="px-2.5 py-1 border border-canvas-border rounded-sm bg-canvas-surface hover:bg-canvas-subtle text-[11px] font-sans text-ink-secondary hover:text-brand-primary transition-colors"
            >
              Reset View
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          {/* Search Box */}
          <div>
            <label className="block text-[10px] font-mono uppercase text-ink-muted mb-1 font-semibold">
              Search Service
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. PaymentsAPI, CorePlatform..."
              className="w-full text-xs font-mono px-2.5 py-1.5 border border-canvas-border rounded-sm bg-canvas-surface text-ink focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
            />
          </div>

          {/* Health Status Filter */}
          <div>
            <label className="block text-[10px] font-mono uppercase text-ink-muted mb-1 font-semibold">
              Filter by Health
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full text-xs font-mono px-2.5 py-1.5 border border-canvas-border rounded-sm bg-canvas-surface text-ink focus:outline-none focus:border-brand-primary"
            >
              <option value="ALL">All Statuses</option>
              <option value="failing">Failing Only</option>
              <option value="degraded">Degraded Only</option>
              <option value="healthy">Healthy Only</option>
              <option value="unreachable">Unreachable Only</option>
            </select>
          </div>

          {/* Owning Team Filter */}
          <div>
            <label className="block text-[10px] font-mono uppercase text-ink-muted mb-1 font-semibold">
              Filter by Team
            </label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-full text-xs font-mono px-2.5 py-1.5 border border-canvas-border rounded-sm bg-canvas-surface text-ink focus:outline-none focus:border-brand-primary"
            >
              <option value="ALL">All Teams</option>
              {availableTeams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Focused Isolation Banner */}
        {focusedService && (
          <div className="flex items-center justify-between bg-brand-orange-light border border-brand-primary/30 px-3 py-1.5 rounded-sm text-xs font-sans text-brand-primary">
            <span>
              Isolated graph around: <strong>{focusedService}</strong> (showing direct upstream &amp; downstream nodes)
            </span>
            <button
              type="button"
              onClick={() => setFocusedService(null)}
              className="text-brand-primary underline font-semibold hover:text-brand-primary-hover"
            >
              Clear Focus
            </button>
          </div>
        )}
      </div>

      {/* Main Explorer Workspace: Canvas + Inspector Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Graph Canvas (2 Columns on large screens) */}
        <div className="lg:col-span-2 border border-canvas-border rounded-sm bg-canvas-surface relative overflow-hidden flex flex-col">
          {/* Canvas Controls Header */}
          <div className="flex items-center justify-between p-2.5 border-b border-canvas-border bg-canvas text-xs font-mono">
            <span className="text-ink-muted text-[11px]">
              Click a node to inspect &middot; Drag to pan &middot; Zoom to scale
            </span>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.35, Number((z - 0.15).toFixed(2))))}
                className="w-6 h-6 border border-canvas-border rounded-sm bg-canvas-surface hover:bg-canvas-subtle flex items-center justify-center text-ink font-bold"
                title="Zoom Out"
              >
                -
              </button>
              <span className="text-[10px] font-mono w-10 text-center text-ink-muted">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.0, Number((z + 0.15).toFixed(2))))}
                className="w-6 h-6 border border-canvas-border rounded-sm bg-canvas-surface hover:bg-canvas-subtle flex items-center justify-center text-ink font-bold"
                title="Zoom In"
              >
                +
              </button>
            </div>
          </div>

          {/* SVG Canvas Area */}
          <div
            ref={containerRef}
            className="w-full h-96 sm:h-[460px] relative cursor-grab active:cursor-grabbing bg-canvas select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {layoutNodes.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-xs font-mono text-ink-muted">
                <p>No services match your current search and filter criteria.</p>
                <button
                  type="button"
                  onClick={resetView}
                  className="mt-2 text-brand-primary underline font-semibold"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <svg className="w-full h-full">
                <defs>
                  <marker
                    id="explorer-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 9 5 L 0 9 z" fill="#8594A6" />
                  </marker>
                  <marker
                    id="explorer-arrow-active"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 9 5 L 0 9 z" fill="#E87532" />
                  </marker>
                </defs>

                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                  {/* Edges: Clean straight connections */}
                  {visibleEdges.map((e, idx) => {
                    const fromId = e.from_node || e.source;
                    const toId = e.to_node || e.target;
                    const src = nodePosMap.get(fromId);
                    const tgt = nodePosMap.get(toId);
                    if (!src || !tgt) return null;

                    const x1 = src.x + src.width;
                    const y1 = src.y + src.height / 2;
                    const x2 = tgt.x;
                    const y2 = tgt.y + tgt.height / 2;

                    // Straight edge line
                    const d = `M ${x1} ${y1} L ${x2} ${y2}`;

                    const isRelated =
                      selectedNodeId === fromId || selectedNodeId === toId;

                    return (
                      <g key={idx}>
                        <path
                          d={d}
                          fill="none"
                          stroke={isRelated ? '#E87532' : '#CBD5E1'}
                          strokeWidth={isRelated ? '2' : '1.2'}
                          strokeDasharray={isRelated ? 'none' : '3,3'}
                          markerEnd={isRelated ? 'url(#explorer-arrow-active)' : 'url(#explorer-arrow)'}
                        />
                      </g>
                    );
                  })}

                  {/* Nodes */}
                  {layoutNodes.map((node) => {
                    const isSelected = selectedNodeId === node.id;
                    const style = getNodeColorStyle(node.status);
                    const teamLabel = node.team_name || node.team;

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedNodeId(node.id);
                        }}
                        className="cursor-pointer"
                      >
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
                        <rect
                          width={node.width}
                          height={node.height}
                          rx="3"
                          fill={isSelected ? '#FDF2EB' : style.fill}
                          stroke={isSelected ? '#E87532' : style.stroke}
                          strokeWidth={isSelected ? '2' : '1.2'}
                        />
                        <circle cx="16" cy="22" r="5" fill={style.dot} />
                        <text
                          x="28"
                          y="26"
                          fontSize="12"
                          fontFamily='"IBM Plex Sans", sans-serif'
                          fontWeight={isSelected ? '700' : '600'}
                          fill="#17243A"
                        >
                          {node.label}
                        </text>
                        <text
                          x="16"
                          y="45"
                          fontSize="9.5"
                          fontFamily='"IBM Plex Mono", monospace'
                          fontWeight="600"
                          fill={style.text}
                        >
                          {style.label}
                        </text>
                        {teamLabel && (
                          <text
                            x="90"
                            y="45"
                            fontSize="9.5"
                            fontFamily='"IBM Plex Sans", sans-serif'
                            fontWeight="500"
                            fill="#58677D"
                          >
                            &middot; {teamLabel.length > 16 ? teamLabel.slice(0, 15) + '…' : teamLabel}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
            )}

            {/* Canvas Legend */}
            <div className="absolute bottom-2 left-2 bg-canvas-surface/95 backdrop-blur-xs border border-canvas-border rounded-sm px-2.5 py-1.5 flex items-center space-x-3 text-[10px] font-mono text-ink-muted">
              <div className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-status-red" />
                <span>Failing / Unreachable</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-status-amber" />
                <span>Degraded</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-status-green" />
                <span>Healthy</span>
              </div>
              <div className="hidden sm:flex items-center space-x-1 border-l border-canvas-border pl-2 text-ink-secondary">
                <span>Solid Arrow: DEPENDS_ON</span>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Node Inspector Sidebar (1 Column) */}
        <div className="border border-canvas-border rounded-sm bg-canvas-surface p-4 flex flex-col space-y-4">
          <div className="border-b border-canvas-border pb-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase text-ink-muted tracking-wider">
                Service Inspector
              </span>
              <h3 className="text-sm font-sans font-bold text-ink">
                {selectedNodeId || 'None Selected'}
              </h3>
            </div>
            {selectedNodeId && (
              <button
                type="button"
                onClick={() => setFocusedService(focusedService === selectedNodeId ? null : selectedNodeId)}
                className={`px-2.5 py-1 text-[11px] font-sans rounded-sm border transition-colors ${
                  focusedService === selectedNodeId
                    ? 'border-brand-primary bg-brand-orange-light text-brand-primary font-semibold'
                    : 'border-canvas-border bg-canvas-surface text-ink-secondary hover:text-brand-primary hover:border-brand-primary'
                }`}
              >
                {focusedService === selectedNodeId ? 'Unfocus' : 'Focus Graph'}
              </button>
            )}
          </div>

          {selectedNodeId ? (
            <div className="space-y-4 text-xs font-mono flex-1 overflow-y-auto">
              {/* Direct Dependencies */}
              <div>
                <h4 className="text-[10px] font-sans uppercase tracking-wider text-ink-muted font-bold mb-1.5">
                  Direct Dependencies (Upstream)
                </h4>
                <div className="border border-canvas-border rounded-sm bg-canvas-subtle p-2.5 space-y-1">
                  {directUpstream.length > 0 ? (
                    directUpstream.map((up) => (
                      <div
                        key={up}
                        onClick={() => setSelectedNodeId(up)}
                        className="cursor-pointer hover:text-brand-primary flex items-center justify-between text-ink"
                      >
                        <span>&rarr; {up}</span>
                        <span className="text-[10px] text-ink-muted hover:underline">Select</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-ink-muted">No upstream service dependencies.</span>
                  )}
                </div>
              </div>

              {/* Direct Dependents */}
              <div>
                <h4 className="text-[10px] font-sans uppercase tracking-wider text-ink-muted font-bold mb-1.5">
                  Direct Dependents (Downstream)
                </h4>
                <div className="border border-canvas-border rounded-sm bg-canvas-subtle p-2.5 space-y-1">
                  {directDownstream.length > 0 ? (
                    directDownstream.map((down) => (
                      <div
                        key={down}
                        onClick={() => setSelectedNodeId(down)}
                        className="cursor-pointer hover:text-brand-primary flex items-center justify-between text-ink"
                      >
                        <span>&larr; {down}</span>
                        <span className="text-[10px] text-ink-muted hover:underline">Select</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-ink-muted">No downstream callers found.</span>
                  )}
                </div>
              </div>

              {/* Responsible Team & On-Call */}
              <div>
                <h4 className="text-[10px] font-sans uppercase tracking-wider text-ink-muted font-bold mb-1.5">
                  Owning Team (:OWNS)
                </h4>
                <div className="border border-canvas-border rounded-sm bg-canvas-subtle p-2.5 space-y-1.5 text-[11px]">
                  {isLoadingNodeDetails ? (
                    <span className="text-ink-muted">Loading ownership...</span>
                  ) : nodeOwner ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Team:</span>
                        <span className="font-semibold text-ink">{nodeOwner.team_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Channel:</span>
                        <span className="text-brand-primary font-semibold">{nodeOwner.slack_channel || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted">On-Call:</span>
                        <span className="text-ink break-all font-semibold">{nodeOwner.oncall_email || 'N/A'}</span>
                      </div>
                    </>
                  ) : (
                    <span className="text-ink-muted">No owner assigned in FalkorDB.</span>
                  )}
                </div>
              </div>

              {/* Recent Deployments */}
              <div>
                <h4 className="text-[10px] font-sans uppercase tracking-wider text-ink-muted font-bold mb-1.5">
                  Recent Deployments (:CHANGED)
                </h4>
                <div className="border border-canvas-border rounded-sm bg-canvas-subtle p-2.5 space-y-2 text-[11px]">
                  {isLoadingNodeDetails ? (
                    <span className="text-ink-muted">Loading changes...</span>
                  ) : nodeChanges?.changes?.length > 0 ? (
                    nodeChanges.changes.map((c) => (
                      <div key={c.id} className="border-b border-canvas-border last:border-0 pb-1.5 last:pb-0">
                        <div className="flex justify-between font-semibold">
                          <span className="text-brand-primary">{c.version}</span>
                          <span className="text-[10px] text-ink-muted">{c.timestamp}</span>
                        </div>
                        <p className="text-ink text-[10px] mt-0.5 leading-snug">{c.description}</p>
                        <p className="text-[9px] text-ink-muted mt-0.5">By: {c.deployed_by}</p>
                      </div>
                    ))
                  ) : (
                    <span className="text-ink-muted">No recent deployment changes.</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-xs font-sans text-ink-muted py-12">
              Select any node in the graph to view its connections and operational details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

