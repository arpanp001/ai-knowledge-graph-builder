/**
 * A generic animated placeholder block. Compose these to build
 * skeleton layouts that roughly match the shape of the real content,
 * so loading states feel like "almost there" rather than a blank pause.
 */
function Skeleton({ className = "" }) {
  return (
    <div className={`animate-pulse bg-slate-200 dark:bg-slate-800 rounded-lg ${className}`} />
  );
}

export function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card p-6 max-w-md w-full space-y-3">
      <Skeleton className="h-5 w-1/2" />
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonGraph() {
  return (
    <div className="h-96 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 flex items-center justify-center gap-4 p-8">
      <Skeleton className="w-16 h-16 rounded-full" />
      <Skeleton className="w-20 h-20 rounded-full" />
      <Skeleton className="w-14 h-14 rounded-full" />
    </div>
  );
}

export default Skeleton;