import ThemeToggle from "./ThemeToggle";
import { HelpCircle } from "lucide-react";

function Navbar({ isConnected, currentUser, onLogout, isDark, onToggleTheme, onReplayTour }) {
  return (
    <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex justify-between items-center sticky top-0 z-20 transition-colors">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">AI Knowledge Graph Builder</h1>
        <span
          className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`}
          title={isConnected ? "Backend connected" : "Backend disconnected"}
        ></span>
      </div>

      <div className="flex items-center gap-3">
        <kbd className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">
          <span>⌘</span>K
        </kbd>
        <button
          onClick={onReplayTour}
          className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Replay tour"
        >
          <HelpCircle size={18} />
        </button>
        <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
        {currentUser && (
          <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
            <span>{currentUser.name}</span>
            <button onClick={onLogout} className="btn-outline text-xs px-3 py-1">
              Log out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

export default Navbar;