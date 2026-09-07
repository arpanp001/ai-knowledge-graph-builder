import { useEffect, useState, useMemo, useRef } from "react";
import { Search, FolderKanban, Upload, MessageCircle, Network, BarChart3, Moon, Sun } from "lucide-react";

/**
 * A Cmd+K / Ctrl+K quick-action palette. Actions are plain objects with a
 * label, an icon, and an onRun callback - App.jsx supplies the actual list
 * so this component stays purely presentational and reusable.
 */
function CommandPalette({ isOpen, onClose, projects, onSelectProject, actions }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isOpen && e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const projectItems = useMemo(
    () =>
      (projects || []).map((p) => ({
        label: `Open project: ${p.name}`,
        icon: FolderKanban,
        onRun: () => {
          onSelectProject(p.id, p.name);
          onClose();
        },
      })),
    [projects, onSelectProject, onClose]
  );

  const allItems = useMemo(() => [...(actions || []), ...projectItems], [actions, projectItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((item) => item.label.toLowerCase().includes(q));
  }, [allItems, query]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center pt-24"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg mx-4 overflow-hidden fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search size={16} className="text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects or actions..."
            className="flex-1 bg-transparent text-sm focus:outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
          />
          <kbd className="text-[10px] text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        <div className="max-h-72 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">No matches.</p>
          )}
          {filtered.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                onClick={item.onRun}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-brand-50 dark:hover:bg-brand-900/30 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
export const paletteIcons = { Upload, MessageCircle, Network, BarChart3, Moon, Sun };