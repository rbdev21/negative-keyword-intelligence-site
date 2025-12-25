"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Usage = {
  ok: boolean;
  month_start: string;
  used: number;
  quota: number;
  remaining: number;
};

function formatNumber(n: number) {
  return new Intl.NumberFormat().format(Math.max(0, Math.round(n)));
}

export default function UsagePanel({ compact = false }: { compact?: boolean }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/usage", { method: "GET" });
        if (!res.ok) {
          setUsage(null);
          return;
        }
        const data = (await res.json()) as Usage;
        if (!cancelled) setUsage(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const pct = useMemo(() => {
    if (!usage || !usage.quota) return 0;
    return Math.min(100, Math.round((usage.used / usage.quota) * 100));
  }, [usage]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="h-4 w-40 animate-pulse rounded bg-zinc-100" />
        <div className="mt-3 h-2 w-full animate-pulse rounded bg-zinc-100" />
        <div className="mt-3 h-4 w-56 animate-pulse rounded bg-zinc-100" />
      </div>
    );
  }

  if (!usage) return null;

  const warn = pct >= 80;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            Usage this month
            <span className="ml-2 text-xs font-medium text-zinc-500">
              ({usage.month_start})
            </span>
          </p>

          {!compact && (
            <p className="mt-1 text-sm text-zinc-600">
              You’ve used{" "}
              <span className="font-semibold text-zinc-900">
                {formatNumber(usage.used)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-zinc-900">
                {formatNumber(usage.quota)}
              </span>{" "}
              search terms.
            </p>
          )}
        </div>

        <Link
          href="/account"
          className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
        >
          Manage
        </Link>
      </div>

      <div className="mt-3">
        <div className="h-2 w-full rounded-full bg-zinc-100">
          <div
            className={[
              "h-2 rounded-full transition-all",
              warn ? "bg-amber-500" : "bg-zinc-900",
            ].join(" ")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-zinc-600">
          <span>{pct}% used</span>
          <span>
            Remaining{" "}
            <span className="font-semibold text-zinc-900">
              {formatNumber(usage.remaining)}
            </span>
          </span>
        </div>

        {warn ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            You’re running low. You’ll be able to buy top-up credits inside the
            app.
          </div>
        ) : null}
      </div>
    </div>
  );
}
