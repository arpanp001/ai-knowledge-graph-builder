import { Loader2 } from "lucide-react";

function LoadingSpinner({ label = "Loading..." }) {
  return (
    <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-8">
      <Loader2 className="animate-spin text-brand-500" size={18} />
      {label}
    </div>
  );
}

export default LoadingSpinner;