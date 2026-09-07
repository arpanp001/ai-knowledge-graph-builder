import { useEffect, useState, useMemo, useRef, useCallback, memo } from "react";
import ReactFlow, { Background, Controls, MiniMap, Panel } from "reactflow";
import { toPng } from "html-to-image";
import {
  Network,
  AlertTriangle,
  ImageDown,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  Waypoints,
  RotateCcw,
  FileStack,
  Boxes,
  Play,
  Square,
  GitCompare,
} from "lucide-react";
import { getDocumentGraph } from "../services/documentService";
import { getProjectGraph, findEntityPath } from "../services/graphService";
import {
  computeForceLayout,
  computeNodeDegrees,
  computeCommunities,
  COMMUNITY_COLORS,
  ENTITY_TYPE_COLORS,
} from "../utils/graphLayout";
import EntityDetails from "./EntityDetails";
import EntityCompare from "./EntityCompare";
import { SkeletonGraph } from "./Skeleton";

const nodeTypes = {};
const edgeTypes = {};
const proOptions = { hideAttribution: true };
const fitViewOptions = { padding: 0.25, maxZoom: 1.2 };
const EXPLORE_SEED_COUNT = 5;
const ALL_DOCUMENTS = "__all__";

const MIN_EDGE_WIDTH = 1;
const MAX_EDGE_WIDTH = 5;
const MIN_EDGE_OPACITY = 0.35;
const MAX_EDGE_OPACITY = 0.85;

const BUILD_STEP_MS = 450;
const MAX_LEGEND_CLUSTERS = 6;

function GraphViewer({ documentId, projectId, presetPath, documents }) {
  const [graphData, setGraphData] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [hiddenTypes, setHiddenTypes] = useState(new Set());
  const [pathSource, setPathSource] = useState("");
  const [pathTarget, setPathTarget] = useState("");
  const [pathResult, setPathResult] = useState(null);
  const [pathError, setPathError] = useState("");
  const [pathLoading, setPathLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [exploreMode, setExploreMode] = useState(false);
  const [visibleNodeIds, setVisibleNodeIds] = useState(null);
  const [documentFilter, setDocumentFilter] = useState(ALL_DOCUMENTS);

  // --- Node clustering (community detection) ---
  const [clusterMode, setClusterMode] = useState(false);

  // --- Animated build playback ---
  const [isPlayingBuild, setIsPlayingBuild] = useState(false);
  const [revealedCount, setRevealedCount] = useState(Infinity); // Infinity = show everything

  // --- Entity comparison ---
  const [showCompare, setShowCompare] = useState(false);

  const graphContainerRef = useRef(null);

  useEffect(() => {
    if (!documentId && !projectId) return;
    setLoadState("loading");
    setSelectedEntity(null);
    setHoveredNodeId(null);
    setSearchTerm("");
    setHiddenTypes(new Set());
    setPathResult(null);
    setPathError("");
    setExploreMode(false);
    setVisibleNodeIds(null);
    setDocumentFilter(ALL_DOCUMENTS);
    setClusterMode(false);
    setIsPlayingBuild(false);
    setRevealedCount(Infinity);
    setShowCompare(false);

    const fetcher = documentId ? getDocumentGraph(documentId) : getProjectGraph(projectId);
    fetcher
      .then((data) => {
        if (!data.nodes || data.nodes.length === 0) {
          setLoadState("empty");
          return;
        }
        setGraphData(data);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [documentId, projectId]);

  useEffect(() => {
    if (presetPath) {
      setPathResult(presetPath);
      setDocumentFilter(ALL_DOCUMENTS);
    }
  }, [presetPath]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFullscreen]);

  const degreeById = useMemo(
    () => (graphData ? computeNodeDegrees(graphData.nodes, graphData.edges) : {}),
    [graphData]
  );

  useEffect(() => {
    if (!exploreMode || !graphData) return;
    const sorted = [...graphData.nodes].sort((a, b) => (degreeById[b.id] || 0) - (degreeById[a.id] || 0));
    const seedCount = Math.min(EXPLORE_SEED_COUNT, sorted.length);
    setVisibleNodeIds(new Set(sorted.slice(0, seedCount).map((n) => n.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploreMode, graphData]);

  const toggleExploreMode = useCallback(() => {
    setExploreMode((prev) => !prev);
    if (exploreMode) setVisibleNodeIds(null);
  }, [exploreMode]);

  const resetExploration = useCallback(() => {
    if (!graphData) return;
    const sorted = [...graphData.nodes].sort((a, b) => (degreeById[b.id] || 0) - (degreeById[a.id] || 0));
    const seedCount = Math.min(EXPLORE_SEED_COUNT, sorted.length);
    setVisibleNodeIds(new Set(sorted.slice(0, seedCount).map((n) => n.id)));
  }, [graphData, degreeById]);

  const typesPresent = useMemo(
    () => (graphData ? [...new Set(graphData.nodes.map((n) => n.type))] : []),
    [graphData]
  );

  const focusedNeighborIds = useMemo(() => {
    if (!hoveredNodeId || !graphData) return null;
    const ids = new Set([hoveredNodeId]);
    graphData.edges.forEach((e) => {
      if (e.source === hoveredNodeId) ids.add(e.target);
      if (e.target === hoveredNodeId) ids.add(e.source);
    });
    return ids;
  }, [hoveredNodeId, graphData]);

  const pathNodeKeys = useMemo(() => new Set((pathResult?.nodes || []).map((n) => n.key)), [pathResult]);
  const searchLower = searchTerm.trim().toLowerCase();

  const searchMatchIds = useMemo(() => {
    if (!graphData || !searchLower) return new Set();
    return new Set(graphData.nodes.filter((n) => n.name.toLowerCase().includes(searchLower)).map((n) => n.id));
  }, [graphData, searchLower]);

  const nodeMatchesDocumentFilter = useCallback(
    (node) => {
      if (documentFilter === ALL_DOCUMENTS) return true;
      if (!node.document_ids) return true;
      return node.document_ids.includes(documentFilter);
    },
    [documentFilter]
  );

  const edgeMatchesDocumentFilter = useCallback(
    (edge) => {
      if (documentFilter === ALL_DOCUMENTS) return true;
      if (!edge.document_ids) return true;
      return edge.document_ids.includes(documentFilter);
    },
    [documentFilter]
  );

  // Reset any in-progress build animation whenever the underlying visible
  // node set changes for a reason other than the animation itself - avoids
  // a stale partial reveal lingering after the user changes a filter.
  useEffect(() => {
    if (!isPlayingBuild) setRevealedCount(Infinity);
  }, [hiddenTypes, documentFilter, exploreMode, visibleNodeIds, clusterMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Layout is computed once per filter/cluster-mode change and never
  // depends on hover/search/path/build-reveal state - this is what keeps
  // hovering nodes or advancing the build animation from ever re-triggering
  // the physics simulation (the original cause of the flicker bug).
  const baseLayout = useMemo(() => {
    if (!graphData) return null;

    let candidateNodes = graphData.nodes
      .filter((n) => !hiddenTypes.has(n.type))
      .filter((n) => nodeMatchesDocumentFilter(n) || pathNodeKeys.has(n.id));

    if (exploreMode && visibleNodeIds) {
      const forced = new Set(visibleNodeIds);
      pathNodeKeys.forEach((k) => forced.add(k));
      searchMatchIds.forEach((id) => forced.add(id));
      candidateNodes = candidateNodes.filter((n) => forced.has(n.id));
    }

    const visibleIds = new Set(candidateNodes.map((n) => n.id));
    const visibleEdges = graphData.edges
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .filter((e) => edgeMatchesDocumentFilter(e) || pathNodeKeys.has(e.source));

    const communityById = clusterMode ? computeCommunities(candidateNodes, visibleEdges) : null;

    const positions = computeForceLayout(candidateNodes, visibleEdges, 820, 560, communityById);
    const nameById = {};
    graphData.nodes.forEach((n) => (nameById[n.id] = n.name));
    const maxDegree = Math.max(1, ...candidateNodes.map((n) => degreeById[n.id] || 0));

    const confidences = visibleEdges.map((e) => e.confidence || 1);
    const minConfidence = confidences.length ? Math.min(...confidences) : 1;
    const maxConfidence = confidences.length ? Math.max(...confidences) : 1;

    // A human-readable label per detected cluster = the name of its most-
    // connected member, so the legend reads "Machine Learning cluster"
    // rather than a meaningless "Cluster 3".
    let communityLabels = null;
    if (communityById) {
      communityLabels = {};
      candidateNodes.forEach((n) => {
        const cid = communityById[n.id];
        const deg = degreeById[n.id] || 0;
        if (!communityLabels[cid] || deg > communityLabels[cid].degree) {
          communityLabels[cid] = { name: n.name, degree: deg };
        }
      });
    }

    return {
      visibleNodes: candidateNodes,
      visibleEdges,
      positions,
      nameById,
      maxDegree,
      minConfidence,
      maxConfidence,
      communityById,
      communityLabels,
    };
  }, [
    graphData,
    hiddenTypes,
    degreeById,
    exploreMode,
    visibleNodeIds,
    pathNodeKeys,
    searchMatchIds,
    nodeMatchesDocumentFilter,
    edgeMatchesDocumentFilter,
    clusterMode,
  ]);

  // Advances the build-playback animation one node at a time.
  useEffect(() => {
    if (!isPlayingBuild || !baseLayout) return;
    const total = baseLayout.visibleNodes.length;

    if (revealedCount >= total) {
      setIsPlayingBuild(false);
      setRevealedCount(Infinity);
      return;
    }

    const timer = setTimeout(() => setRevealedCount((c) => c + 1), BUILD_STEP_MS);
    return () => clearTimeout(timer);
  }, [isPlayingBuild, revealedCount, baseLayout]);

  const handlePlayBuild = useCallback(() => {
    setRevealedCount(0);
    setIsPlayingBuild(true);
  }, []);

  const handleStopBuild = useCallback(() => {
    setIsPlayingBuild(false);
    setRevealedCount(Infinity);
  }, []);

  const { flowNodes, flowEdges, edgesWithNames } = useMemo(() => {
    if (!baseLayout) return { flowNodes: [], flowEdges: [], edgesWithNames: [] };
    const {
      visibleNodes,
      visibleEdges,
      positions,
      nameById,
      maxDegree,
      minConfidence,
      maxConfidence,
      communityById,
    } = baseLayout;

    // Which nodes are "revealed" for build-playback purposes. Infinity means
    // no animation is active, so every node in the filtered set is shown.
    const revealedIds =
      revealedCount === Infinity
        ? null
        : new Set(visibleNodes.slice(0, revealedCount).map((n) => n.id));

    const confidenceRange = Math.max(1, maxConfidence - minConfidence);

    const rawFlowNodes = visibleNodes.map((node) => {
      const isSearchMatch = searchLower && node.name.toLowerCase().includes(searchLower);
      const isOnPath = pathNodeKeys.has(node.id);
      const isFocused = !focusedNeighborIds || focusedNeighborIds.has(node.id);
      const isHovered = node.id === hoveredNodeId;
      const pos = positions[node.id] || { x: 0, y: 0 };

      const degreeRatio = (degreeById[node.id] || 0) / maxDegree;
      const fontSize = 11 + Math.round(degreeRatio * 3);
      const paddingY = 7 + Math.round(degreeRatio * 3);
      const paddingX = 12 + Math.round(degreeRatio * 5);

      const dimmed = (searchLower && !isSearchMatch && !isOnPath) || (focusedNeighborIds && !isFocused);
      const baseColor = ENTITY_TYPE_COLORS[node.type] || ENTITY_TYPE_COLORS.Other;
      const isExpandable = exploreMode && visibleNodeIds && !isHovered;

      const clusterColor =
        clusterMode && communityById && communityById[node.id] !== undefined
          ? COMMUNITY_COLORS[communityById[node.id] % COMMUNITY_COLORS.length]
          : null;

      return {
        id: node.id,
        data: { label: node.name },
        position: pos,
        draggable: true,
        className: "fade-in",
        style: {
          background: baseColor,
          color: "white",
          borderRadius: "10px",
          padding: `${paddingY}px ${paddingX}px`,
          fontSize: `${fontSize}px`,
          fontFamily: "Inter, sans-serif",
          fontWeight: isHovered ? 700 : 600,
          border: isOnPath
            ? "3px solid #f97316"
            : isSearchMatch
            ? "3px solid #facc15"
            : isHovered
            ? "3px solid rgba(255,255,255,0.9)"
            : isExpandable
            ? "1.5px dashed rgba(255,255,255,0.55)"
            : "1.5px solid rgba(255,255,255,0.18)",
          outline: clusterColor ? `3px solid ${clusterColor}` : "none",
          outlineOffset: clusterColor ? "2px" : "0px",
          opacity: dimmed ? 0.12 : 1,
          boxShadow: isHovered ? `0 0 0 5px ${baseColor}33, 0 8px 20px rgba(0,0,0,0.35)` : "0 2px 6px rgba(0,0,0,0.2)",
          width: "auto",
          transition: "opacity 0.2s ease, box-shadow 0.2s ease, border 0.15s ease, outline 0.15s ease",
          textShadow: "0 1px 2px rgba(0,0,0,0.35)",
          cursor: exploreMode ? "pointer" : "grab",
        },
      };
    });

    const rawFlowEdges = visibleEdges.map((edge, i) => {
      const isOnPath =
        pathNodeKeys.has(edge.source) &&
        pathNodeKeys.has(edge.target) &&
        (pathResult?.nodes || []).some((n) => n.key === edge.source) &&
        (pathResult?.nodes || []).some((n) => n.key === edge.target);

      const isFocusedEdge = hoveredNodeId && (edge.source === hoveredNodeId || edge.target === hoveredNodeId);
      const dimmed = focusedNeighborIds && !isFocusedEdge && !isOnPath;
      const showLabel = showAllLabels || isFocusedEdge || isOnPath;

      const confidence = edge.confidence || 1;
      const confidenceRatio = (confidence - minConfidence) / confidenceRange;
      const confidenceWidth = MIN_EDGE_WIDTH + confidenceRatio * (MAX_EDGE_WIDTH - MIN_EDGE_WIDTH);
      const confidenceOpacity = MIN_EDGE_OPACITY + confidenceRatio * (MAX_EDGE_OPACITY - MIN_EDGE_OPACITY);

      const finalWidth = isOnPath ? 3 : isFocusedEdge ? Math.max(confidenceWidth, 2.5) : confidenceWidth;
      const finalOpacity = dimmed ? 0.08 : isOnPath || isFocusedEdge ? 1 : confidenceOpacity;

      return {
        id: `edge-${i}`,
        source: edge.source,
        target: edge.target,
        type: "straight",
        label: showLabel ? edge.relation : "",
        labelStyle: { fontSize: 10.5, fill: isOnPath ? "#fb923c" : "#e2e8f0", fontWeight: 600, fontFamily: "Inter, sans-serif" },
        labelBgStyle: { fill: isOnPath ? "#431407" : "#1e293b", fillOpacity: 0.95 },
        labelBgPadding: [7, 4],
        labelBgBorderRadius: 6,
        style: {
          stroke: isOnPath ? "#f97316" : isFocusedEdge ? "#a78bfa" : "#64748b",
          strokeWidth: finalWidth,
          opacity: finalOpacity,
          transition: "opacity 0.2s ease, stroke 0.2s ease, stroke-width 0.2s ease",
        },
        animated: isOnPath || isFocusedEdge,
      };
    });

    // Apply build-playback reveal filtering last, on top of everything else.
    const flowNodes = revealedIds ? rawFlowNodes.filter((n) => revealedIds.has(n.id)) : rawFlowNodes;
    const flowEdges = revealedIds
      ? rawFlowEdges.filter((e) => revealedIds.has(e.source) && revealedIds.has(e.target))
      : rawFlowEdges;

    const edgesWithNames = (graphData?.edges || []).map((edge) => ({
      ...edge,
      sourceName: nameById[edge.source] || edge.source,
      targetName: nameById[edge.target] || edge.target,
    }));

    return { flowNodes, flowEdges, edgesWithNames };
  }, [
    baseLayout,
    searchLower,
    pathNodeKeys,
    pathResult,
    hoveredNodeId,
    focusedNeighborIds,
    degreeById,
    showAllLabels,
    graphData,
    exploreMode,
    visibleNodeIds,
    clusterMode,
    revealedCount,
  ]);

  const handleNodeClick = useCallback(
    (_event, node) => {
      const entity = graphData?.nodes.find((n) => n.id === node.id);
      setSelectedEntity(entity);

      if (!exploreMode || !graphData) return;

      setVisibleNodeIds((prev) => {
        const next = new Set(prev || []);
        next.add(node.id);
        graphData.edges.forEach((e) => {
          if (e.source === node.id) next.add(e.target);
          if (e.target === node.id) next.add(e.source);
        });
        return next;
      });
    },
    [graphData, exploreMode]
  );

  const handleNodeMouseEnter = useCallback((_event, node) => setHoveredNodeId(node.id), []);
  const handleNodeMouseLeave = useCallback(() => setHoveredNodeId(null), []);

  const toggleType = useCallback((type) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const handleFindPath = async () => {
    if (!projectId || !pathSource || !pathTarget) return;
    setPathLoading(true);
    setPathError("");
    setPathResult(null);
    try {
      setPathResult(await findEntityPath(projectId, pathSource, pathTarget));
    } catch (err) {
      setPathError(err.response?.data?.detail || "Could not find a path between these entities.");
    } finally {
      setPathLoading(false);
    }
  };

  const handleExportImage = () => {
    if (!graphContainerRef.current) return;
    const isDark = document.documentElement.classList.contains("dark");
    toPng(graphContainerRef.current, { backgroundColor: isDark ? "#0f172a" : "#ffffff", cacheBust: true })
      .then((dataUrl) => {
        const link = document.createElement("a");
        link.download = `knowledge-graph-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
      })
      .catch(() => {});
  };

  const minimapNodeColor = useCallback(
    (node) => {
      const entity = graphData?.nodes.find((n) => n.id === node.id);
      return entity ? ENTITY_TYPE_COLORS[entity.type] || ENTITY_TYPE_COLORS.Other : "#94a3b8";
    },
    [graphData]
  );

  if (loadState === "loading") return <SkeletonGraph />;

  if (loadState === "error") {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-2 text-sm text-red-500 dark:text-red-400">
        <AlertTriangle size={28} />
        Could not load the graph. Is the backend and Neo4j running?
      </div>
    );
  }

  if (loadState === "empty") {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-2 text-sm text-slate-400 dark:text-slate-500">
        <Network size={32} strokeWidth={1.5} />
        No entities found yet, so there's nothing to graph.
      </div>
    );
  }

  const canvasHeightClass = isFullscreen ? "h-[calc(100vh-3.5rem)]" : "h-[420px] sm:h-[480px]";
  const totalEntities = graphData.nodes.length;
  const visibleCount = baseLayout.visibleNodes.length;
  const showDocumentFilter = !!projectId && Array.isArray(documents) && documents.length > 1;
  const hasVaryingConfidence = baseLayout.maxConfidence > baseLayout.minConfidence;

  const clusterLegendEntries = clusterMode && baseLayout.communityLabels
    ? Object.entries(baseLayout.communityLabels)
        .sort((a, b) => b[1].degree - a[1].degree)
        .slice(0, MAX_LEGEND_CLUSTERS)
    : [];
  const clusterCount = clusterMode && baseLayout.communityLabels ? Object.keys(baseLayout.communityLabels).length : 0;

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 bg-white dark:bg-slate-950 p-4 flex flex-col" : ""}>
      <div className="flex flex-wrap gap-2 mb-2 items-center overflow-x-auto pb-1 min-h-[38px]">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search entity name..."
          className="input-field flex-1 min-w-[120px] !py-1.5 !text-xs"
        />
        {typesPresent.map((type) => (
          <button
            key={type}
            onClick={() => toggleType(type)}
            className={`pill border shrink-0 ${
              hiddenTypes.has(type)
                ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700"
                : "text-white border-transparent"
            }`}
            style={!hiddenTypes.has(type) ? { background: ENTITY_TYPE_COLORS[type] || ENTITY_TYPE_COLORS.Other } : {}}
          >
            {type}
          </button>
        ))}

        {showDocumentFilter && (
          <div className="flex items-center gap-1.5 shrink-0">
            <FileStack size={13} className="text-slate-400 dark:text-slate-500" />
            <select
              value={documentFilter}
              onChange={(e) => setDocumentFilter(e.target.value)}
              className="input-field !py-1.5 !text-xs !min-w-[130px]"
            >
              <option value={ALL_DOCUMENTS}>All documents</option>
              {documents.map((doc) => (
                <option key={doc.document_id} value={doc.document_id}>
                  {doc.file_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={toggleExploreMode}
          className={`text-xs flex items-center gap-1 shrink-0 pill border ${
            exploreMode
              ? "bg-brand-600 text-white border-transparent"
              : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
          }`}
          title={exploreMode ? "Switch back to showing the full graph" : "Start with key entities and click to reveal connections"}
        >
          <Waypoints size={13} />
          {exploreMode ? "Explore mode: on" : "Explore mode"}
        </button>

        {exploreMode && (
          <button onClick={resetExploration} className="btn-ghost text-xs flex items-center gap-1 shrink-0" title="Reset to top connected entities">
            <RotateCcw size={13} /> Reset
          </button>
        )}

        <button
          onClick={() => setClusterMode((prev) => !prev)}
          className={`text-xs flex items-center gap-1 shrink-0 pill border ${
            clusterMode
              ? "bg-brand-600 text-white border-transparent"
              : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
          }`}
          title="Group tightly-connected entities into visual clusters"
        >
          <Boxes size={13} />
          {clusterMode ? "Clusters: on" : "Cluster view"}
        </button>

        {!isPlayingBuild ? (
          <button onClick={handlePlayBuild} className="btn-ghost text-xs flex items-center gap-1 shrink-0" title="Replay how this graph was built, one entity at a time">
            <Play size={13} /> Play build
          </button>
        ) : (
          <button onClick={handleStopBuild} className="btn-ghost text-xs flex items-center gap-1 shrink-0 text-red-500 dark:text-red-400">
            <Square size={13} /> Stop
          </button>
        )}

        <button
          onClick={() => setShowCompare((prev) => !prev)}
          className={`text-xs flex items-center gap-1 shrink-0 pill border ${
            showCompare
              ? "bg-brand-600 text-white border-transparent"
              : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
          }`}
        >
          <GitCompare size={13} /> Compare
        </button>

        <button onClick={() => setShowAllLabels((prev) => !prev)} className="btn-ghost text-xs flex items-center gap-1 shrink-0">
          {showAllLabels ? <EyeOff size={14} /> : <Eye size={14} />}
          {showAllLabels ? "Hide labels" : "Show all labels"}
        </button>
        <button onClick={handleExportImage} className="btn-ghost text-xs flex items-center gap-1 shrink-0">
          <ImageDown size={14} /> Export
        </button>
        <button onClick={() => setIsFullscreen((prev) => !prev)} className="btn-ghost text-xs flex items-center gap-1 shrink-0">
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
        {isPlayingBuild
          ? `Building the graph — ${Math.min(revealedCount, visibleCount)} of ${visibleCount} entities shown so far.`
          : exploreMode
          ? `Showing ${visibleCount} of ${totalEntities} entities — click a dashed node to reveal its connections. Drag nodes to rearrange.`
          : clusterMode
          ? `Detected ${clusterCount} cluster${clusterCount === 1 ? "" : "s"} — the colored ring around each node shows which group it belongs to.`
          : documentFilter !== ALL_DOCUMENTS
          ? "Showing entities and relationships from the selected document only. Drag nodes to rearrange."
          : "Hover a node to focus on its connections and reveal relationship labels. Thicker lines mean a relationship was confirmed more often in the source text."}
      </p>

      {projectId && (
        <div className="flex flex-wrap items-center gap-2 mb-2 text-xs min-h-[34px]">
          <select value={pathSource} onChange={(e) => setPathSource(e.target.value)} className="input-field !py-1.5 !text-xs">
            <option value="">From entity...</option>
            {graphData.nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
          <select value={pathTarget} onChange={(e) => setPathTarget(e.target.value)} className="input-field !py-1.5 !text-xs">
            <option value="">To entity...</option>
            {graphData.nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
          <button
            onClick={handleFindPath}
            disabled={!pathSource || !pathTarget || pathLoading}
            className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 dark:disabled:bg-orange-950 text-white px-3 py-1.5 rounded-xl transition-colors"
          >
            {pathLoading ? "Finding..." : "Find Path"}
          </button>
          {pathResult && <button onClick={() => setPathResult(null)} className="btn-ghost">Clear path</button>}
          {pathError && <span className="text-red-500 dark:text-red-400">{pathError}</span>}
        </div>
      )}

      {showCompare && (
        <EntityCompare
          nodes={graphData.nodes}
          edges={graphData.edges}
          projectId={projectId}
          onClose={() => setShowCompare(false)}
        />
      )}

      <div
        ref={graphContainerRef}
        className={`relative ${canvasHeightClass} flex-1 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900`}
      >
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={handleNodeClick}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={handleNodeMouseLeave}
          minZoom={0.3}
          maxZoom={2}
          proOptions={proOptions}
          fitView
          fitViewOptions={fitViewOptions}
        >
          <Background color="#94a3b8" gap={22} size={1.3} className="opacity-25 dark:opacity-15" />
          <Controls
            showInteractive={false}
            className="!bg-white dark:!bg-slate-800 !shadow-md !rounded-lg overflow-hidden [&>button]:!border-slate-200 dark:[&>button]:!border-slate-700 [&>button]:!fill-slate-600 dark:[&>button]:!fill-slate-300"
          />
          <MiniMap
            pannable
            zoomable
            nodeColor={minimapNodeColor}
            nodeStrokeWidth={0}
            maskColor="rgba(15, 23, 42, 0.55)"
            className="!bg-white dark:!bg-slate-800 !rounded-lg !shadow-md"
          />

          <Panel position="top-right" className="!m-3">
            <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur rounded-lg px-3 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 shadow-sm">
              {exploreMode
                ? `${visibleCount} / ${totalEntities} entities shown`
                : isPlayingBuild
                ? `${Math.min(revealedCount, visibleCount)} / ${visibleCount} revealed`
                : `${visibleCount} entities · ${baseLayout.visibleEdges.length} relationships`}
            </div>
          </Panel>

          <Panel position="bottom-left" className="!m-3">
            <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur rounded-lg p-2.5 flex flex-col gap-2 max-w-xs shadow-sm">
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {typesPresent.map((type) => (
                  <div key={type} className="flex items-center gap-1.5 text-[10.5px] font-medium text-slate-600 dark:text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ENTITY_TYPE_COLORS[type] || ENTITY_TYPE_COLORS.Other }}></span>
                    {type}
                  </div>
                ))}
              </div>

              {hasVaryingConfidence && !clusterMode && (
                <div className="flex items-center gap-2 pt-1.5 border-t border-slate-200 dark:border-slate-700">
                  <svg width="36" height="10" className="shrink-0">
                    <line x1="0" y1="5" x2="36" y2="5" stroke="#64748b" strokeWidth={MIN_EDGE_WIDTH} strokeLinecap="round" />
                  </svg>
                  <span className="text-[9.5px] text-slate-500 dark:text-slate-400">less confirmed</span>
                  <svg width="36" height="10" className="shrink-0">
                    <line x1="0" y1="5" x2="36" y2="5" stroke="#64748b" strokeWidth={MAX_EDGE_WIDTH} strokeLinecap="round" />
                  </svg>
                  <span className="text-[9.5px] text-slate-500 dark:text-slate-400">more confirmed</span>
                </div>
              )}

              {clusterLegendEntries.length > 0 && (
                <div className="flex flex-col gap-1 pt-1.5 border-t border-slate-200 dark:border-slate-700">
                  {clusterLegendEntries.map(([cid, info]) => (
                    <div key={cid} className="flex items-center gap-1.5 text-[10.5px] text-slate-600 dark:text-slate-300">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 border-2"
                        style={{ borderColor: COMMUNITY_COLORS[Number(cid) % COMMUNITY_COLORS.length], background: "transparent" }}
                      ></span>
                      {info.name} cluster
                    </div>
                  ))}
                  {clusterCount > MAX_LEGEND_CLUSTERS && (
                    <span className="text-[9.5px] text-slate-400">+{clusterCount - MAX_LEGEND_CLUSTERS} more</span>
                  )}
                </div>
              )}
            </div>
          </Panel>
        </ReactFlow>

        <EntityDetails entity={selectedEntity} edges={edgesWithNames} onClose={() => setSelectedEntity(null)} />
      </div>
    </div>
  );
}

export default memo(GraphViewer);