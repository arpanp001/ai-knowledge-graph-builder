function EntityDetails({ entity, edges, onClose }) {
  if (!entity) return null;

  const outgoing = edges.filter((e) => e.source === entity.id);
  const incoming = edges.filter((e) => e.target === entity.id);

  return (
    <div className="absolute top-2 right-2 sm:top-4 sm:right-4 card p-4 w-[calc(100%-16px)] sm:w-72 z-10">
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{entity.name}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{entity.type}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-sm">
          ✕
        </button>
      </div>

      {(outgoing.length > 0 || incoming.length > 0) ? (
        <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
          {outgoing.map((edge, i) => (
            <div key={`out-${i}`} className="text-xs bg-brand-50 dark:bg-brand-900/30 rounded-lg p-2">
              <span className="text-brand-700 dark:text-brand-300 font-mono">{edge.relation}</span>
              {" → "}
              <span className="font-medium text-slate-800 dark:text-slate-100">{edge.targetName}</span>
            </div>
          ))}
          {incoming.map((edge, i) => (
            <div key={`in-${i}`} className="text-xs bg-slate-100 dark:bg-slate-800 rounded-lg p-2">
              <span className="font-medium text-slate-800 dark:text-slate-100">{edge.sourceName}</span>
              {" → "}
              <span className="text-slate-500 dark:text-slate-400 font-mono">{edge.relation}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">No connections found for this entity.</p>
      )}
    </div>
  );
}

export default EntityDetails;