import { useEffect, useState } from "react";
import { getProjectStats } from "../services/statsService";
import LoadingSpinner from "./LoadingSpinner";
import { SkeletonText } from "./Skeleton";

function StatCard({ label, value }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
      <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</p>
    </div>
  );
}

function AnalyticsDashboard({ projectId }) {
  const [stats, setStats] = useState(null);
  const [loadState, setLoadState] = useState("loading");

  useEffect(() => {
    if (!projectId) return;
    setLoadState("loading");
    getProjectStats(projectId)
      .then((data) => {
        setStats(data);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [projectId]);

  if (loadState === "loading") {
    return (
      <div className="card p-6 max-w-3xl w-full fade-in">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-2">
              <div className="h-6 w-10 mx-auto bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
              <div className="h-3 w-16 mx-auto bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
        <SkeletonText lines={4} />
      </div>
    );
  }

  if (loadState === "error" || !stats) {
    return (
      <div className="bg-white shadow-md rounded-xl p-6 max-w-3xl w-full text-sm text-red-500">
        Could not load analytics for this project.
      </div>
    );
  }

  const maxActivity = Math.max(1, ...stats.chat_activity.map((d) => d.count));
  const maxDegree = Math.max(1, ...stats.top_entities.map((e) => e.degree));

  return (
    <div className="bg-white shadow-md rounded-xl p-6 max-w-3xl w-full">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Project Analytics</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Documents" value={stats.document_count} />
        <StatCard label="Entities" value={stats.entity_count} />
        <StatCard label="Relationships" value={stats.relationship_count} />
        <StatCard label="Chat Messages" value={stats.chat_message_count} />
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-600 mb-2">Most Connected Entities</h3>
        {stats.top_entities.length === 0 ? (
          <p className="text-xs text-gray-400">No entities yet.</p>
        ) : (
          <div className="space-y-2">
            {stats.top_entities.map((entity) => (
              <div key={entity.name} className="flex items-center gap-3">
                <span className="text-xs text-gray-700 w-40 truncate">{entity.name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                  <div
                    className="bg-blue-500 h-2.5 rounded-full"
                    style={{ width: `${(entity.degree / maxDegree) * 100}%` }}
                  ></div>
                </div>
                <span className="text-xs text-gray-400 w-8 text-right">{entity.degree}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-600 mb-2">Chat Activity (by day)</h3>
        {stats.chat_activity.length === 0 ? (
          <p className="text-xs text-gray-400">No chat activity yet.</p>
        ) : (
          <div className="flex items-end gap-2 h-24">
            {stats.chat_activity.map((day) => (
              <div key={day.date} className="flex flex-col items-center gap-1 flex-1">
                <div
                  className="bg-purple-400 rounded-t w-full"
                  style={{ height: `${(day.count / maxActivity) * 80}px` }}
                  title={`${day.count} messages`}
                ></div>
                <span className="text-[9px] text-gray-400">{day.date.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AnalyticsDashboard;