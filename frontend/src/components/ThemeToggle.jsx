import { Sun, Moon } from "lucide-react";

function ThemeToggle({ isDark, onToggle }) {
  return (
    <button
      onClick={() => onToggle(!isDark)}
      className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export default ThemeToggle;