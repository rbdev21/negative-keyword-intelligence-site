"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";

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
      <Card>
        <CardContent>
          <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
          <div className="mt-3 h-2 w-full animate-pulse rounded bg-slate-100" />
          <div className="mt-3 h-4 w-56 animate-pulse rounded bg-slate-100" />
        </CardContent>
      </Card>
    );
  }

  if (!usage) return null;

  const warn = pct >= 80;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Usage overview</CardTitle>
          {!compact && (
            <p className="mt-1 text-sm text-slate-600">
              Credits used this reporting window ({usage.month_start}).
            </p>
          )}
        </div>
        <Link href="/account">
          <Button variant="secondary" size="sm">
            Manage
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <ProgressBar value={pct} />
        <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
          <span>{pct}% used</span>
          <span>
            Remaining{" "}
            <span className="font-semibold text-slate-900">
              {formatNumber(usage.remaining)}
            </span>
          </span>
        </div>

        {warn ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            You’re running low. Buy a credit pack to continue running audits.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
