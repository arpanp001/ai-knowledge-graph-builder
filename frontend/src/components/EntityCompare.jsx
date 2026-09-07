import { useState, useMemo } from "react";
import { X, GitCompare } from "lucide-react";
import { findEntityPath } from "../services/graphService";
import { ENTITY_TYPE_COLORS } from "../utils/graphLayout";

/**
 * Compares two entities side-by-side: shared neighbors, neighbors unique to
 * each, and how they connect (a direct relationship, or - reusing the same
 * shortest-path endpoint built for "Find Path" / "Show reasoning in graph" -
 * a multi-hop chain if no direct edge exists).
 *
 * All neighbor computation happens client-side from the graph data already
 * loaded by GraphViewer - no extra API calls needed for that part.
 */
function EntityCompare({ nodes, edges, projectId, onClose }) {
  const [entityA, setEntityA] = useState("");
  const [entityB, setEntityB] = useState("");
  const [result, setResult] = useState(null);
  const [pathChain, setPathChain] = useState(null);
  const [pathLoading, setPathLoading] = useState(false);

  const nodeById = useMemo(() => {
    const map = {};
    nodes.forEach((n) => (map[n.id] = n));
    return map;
  }, [nodes]);

  const getNeighborIds = (id) => {
    const neighbors = new Set();
    edges.forEach((e) => {
      if (e.source === id) neighbors.add(e.target);
      else if (e.target === id) neighbors.add(e.source);
    });
    return neighbors;
  };

  const handleCompare = async () => {
    if (!entityA || !entityB || entityA === entityB) return;

    setPathChain(null);
    setResult(null);

    const neighborsA = getNeighborIds(entityA);
    const neighborsB = getNeighborIds(entityB);

    const sharedIds = [...neighborsA].filter((id) => neighborsB.has(id));
    const onlyAIds = [...neighborsA].filter((id) => !neighborsB.has(id) && id !== entityB);
    const onlyBIds = [...neighborsB].filter((id) => !neighborsA.has(id) && id !== entityA);

    const directEdges = edges.filter(
      (e) =>
        (e.source === entityA && e.target === entityB) ||
        (e.source === entityB && e.target === entityA)
    );

    setResult({
      shared: sharedIds.map((id) => nodeById[id]).filter(Boolean),
      onlyA: onlyAIds.map((id) => nodeById[id]).filter(Boolean),
      onlyB: onlyBIds.map((id) => nodeById[id]).filter(Boolean),
      directRelations: directEdges.map((e) => e.relation),
    });

    if (directEdges.length === 0 && projectId) {
      setPathLoading(true);
      try {
        const path = await findEntityPath(projectId, entityA, entityB);
        setPathChain(path);
      } catch {
        setPathChain(null); // genuinely no connection - not an error worth surfacing
      } finally {
        setPathLoading(false);
      }
    }
  };

  const entityAData = nodeById[entityA];
  const entityBData = nodeById[entityB];
  const sameEntitySelected = entityA && entityB && entityA === entityB;

  return (
    <div className="card p-4 mb-2 fade-in">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          <GitCompare size={15} /> Compare Entities
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={entityA} onChange={(e) => setEntityA(e.target.value)} className="input-field !py-1.5 !text-xs">
          <option value="">Entity A...</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>
        <span className="text-xs text-slate-400">vs</span>
        <select value={entityB} onChange={(e) => setEntityB(e.target.value)} className="input-field !py-1.5 !text-xs">
          <option value="">Entity B...</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>
        <button
          onClick={handleCompare}
          disabled={!entityA || !entityB || sameEntitySelected}
          className="btn-primary text-xs px-3 py-1.5"
        >
          Compare
        </button>
      </div>

      {sameEntitySelected && (
        <p className="text-xs text-red-500 dark:text-red-400 mb-2">Pick two different entities.</p>
      )}

      {result && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {[entityAData, entityBData].map((data, i) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: ENTITY_TYPE_COLORS[data?.type] || ENTITY_TYPE_COLORS.Other }}
                  ></span>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{data?.name}</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{data?.type}</p>
              </div>
            ))}
          </div>

          {result.directRelations.length > 0 ? (
            <div className="mb-3 text-xs bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded-lg p-2">
              Directly connected via: {result.directRelations.join(", ")}
            </div>
          ) : pathLoading ? (
            <div className="mb-3 text-xs text-slate-400">Looking for an indirect connection...</div>
          ) : pathChain && pathChain.nodes?.length > 2 ? (
            <div className="mb-3 text-xs bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-lg p-2">
              Connected indirectly: {pathChain.nodes.map((n) => n.name).join(" → ")}
            </div>
          ) : (
            <div className="mb-3 text-xs text-slate-400">No connection found between these entities.</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <p className="font-medium text-slate-500 dark:text-slate-400 mb-1">Only {entityAData?.name}</p>
              {result.onlyA.length === 0 ? (
                <p className="text-slate-400">None</p>
              ) : (
                <ul className="space-y-0.5">
                  {result.onlyA.map((n) => (
                    <li key={n.id} className="text-slate-700 dark:text-slate-300">{n.name}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="font-medium text-slate-500 dark:text-slate-400 mb-1">Shared</p>
              {result.shared.length === 0 ? (
                <p className="text-slate-400">None</p>
              ) : (
                <ul className="space-y-0.5">
                  {result.shared.map((n) => (
                    <li key={n.id} className="text-brand-600 dark:text-brand-400 font-medium">{n.name}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="font-medium text-slate-500 dark:text-slate-400 mb-1">Only {entityBData?.name}</p>
              {result.onlyB.length === 0 ? (
                <p className="text-slate-400">None</p>
              ) : (
                <ul className="space-y-0.5">
                  {result.onlyB.map((n) => (
                    <li key={n.id} className="text-slate-700 dark:text-slate-300">{n.name}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EntityCompare;