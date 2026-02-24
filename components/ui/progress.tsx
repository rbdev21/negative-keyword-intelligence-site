export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="w-full">
      <div className="h-2 w-full rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-blue-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-slate-600">{pct}%</div>
    </div>
  );
}
