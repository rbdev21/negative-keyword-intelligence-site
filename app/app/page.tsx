"use client";

import { useMemo, useRef, useState } from "react";

type Stats = {
  initial_rows?: number;
  filtered_rows?: number;
  candidates?: number;
  negatives_before_brand?: number;
  negatives_after_brand?: number;
  protected_brand_rows?: number;
  saving_cost?: number;
  saving_cost_annual?: number;
};

type ApiResponse = {
  ok: boolean;
  error?: any;
  detail?: any;
  stats?: Stats;
  results?: Record<string, any>[];
};

type JobStatus =
  | "idle"
  | "queued"
  | "running"
  | "done"
  | "error"
  | "canceled";

type JobPollResponse = {
  ok?: boolean;
  job_id?: string;
  jobId?: string;
  status?: "queued" | "running" | "done" | "error" | "canceled";
  progress?: number; // 0..1 optional
  stats?: Stats;
  results?: Record<string, any>[];
  error?: any;
  detail?: any;
};

function LogoMark() {
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="TermTidy" className="h-9 w-9" />
      <span className="text-lg font-semibold tracking-tight">TermTidy</span>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="text-xs font-medium text-zinc-600">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

// ---------- helpers ----------
function formatGBP(n?: number) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `£${v.toFixed(2)}`;
}

function safeStringify(obj: any) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

// This prevents "Objects are not valid as a React child"
function asDisplayText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Error) return v.message;
  // If API returns { message: "..." }
  if (typeof v === "object" && typeof v.message === "string") return v.message;
  return safeStringify(v);
}

function downloadCsv(filename: string, rows: Record<string, any>[]) {
  if (!rows || rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const escape = (val: any) => {
    const s = val == null ? "" : String(val);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AppPage() {
  const [searchFile, setSearchFile] = useState<File | null>(null);
  const [keywordsFile, setKeywordsFile] = useState<File | null>(null);

  const [minClicks, setMinClicks] = useState(3);
  const [minCost, setMinCost] = useState(0);
  const [similarity, setSimilarity] = useState(0.75);
  const [useLLM, setUseLLM] = useState(true);
  const [batchSize, setBatchSize] = useState(5);
  const [brandTerms, setBrandTerms] = useState("");

  // Job mode state
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ApiResponse | null>(null);

  // Prevent multiple poll loops
  const pollTimerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Results + stats from response
  const rawResults = resp?.results ?? [];
  const stats = resp?.stats ?? {};

  // Dynamic campaign filter (based on results)
  const campaigns = useMemo(() => {
    const set = new Set<string>();
    rawResults.forEach((r) => {
      const c = (r?.campaign ?? "").toString().trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawResults]);

  const [campaignFilter, setCampaignFilter] = useState<string>("ALL");

  // Apply campaign filter
  const results = useMemo(() => {
    if (!rawResults.length) return [];
    if (campaignFilter === "ALL") return rawResults;
    return rawResults.filter(
      (r) => (r?.campaign ?? "").toString().trim() === campaignFilter
    );
  }, [rawResults, campaignFilter]);

  const top5 = useMemo(() => {
    const rows = [...results];
    rows.sort((a, b) => Number(b.cost || 0) - Number(a.cost || 0));
    return rows.slice(0, 5);
  }, [results]);

  function clearPoll() {
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  async function pollJob(id: string) {
    clearPoll();
    setJobId(id);

    const poll = async () => {
      try {
        if (abortRef.current?.signal.aborted) return;

        const r = await fetch(`/api/jobs/${encodeURIComponent(id)}`, {
          method: "GET",
          cache: "no-store",
          signal: abortRef.current?.signal,
        });

        const text = await r.text();
        let data: JobPollResponse;
        try {
          data = JSON.parse(text);
        } catch {
          data = { status: "error", error: "Non-JSON response", detail: text };
        }

        if (!r.ok) {
          setJobStatus("error");
          setLoading(false);
          setResp({
            ok: false,
            error: data?.error || "Job poll failed",
            detail: data?.detail ?? data,
          });
          return;
        }

        const status = data.status ?? "running";

        if (status === "queued" || status === "running") {
          setJobStatus(status);
          setJobProgress(
            typeof data.progress === "number" ? data.progress : null
          );
          pollTimerRef.current = window.setTimeout(poll, 1500);
          return;
        }

        if (status === "done") {
          setJobStatus("done");
          setJobProgress(1);
          setResp({
            ok: true,
            stats: data.stats ?? {},
            results: data.results ?? [],
          });
          setLoading(false);
          return;
        }

        if (status === "canceled") {
          setJobStatus("canceled");
          setLoading(false);
          setResp({
            ok: false,
            error: "Canceled",
            detail: "Job was canceled.",
          });
          return;
        }

        setJobStatus("error");
        setLoading(false);
        setResp({
          ok: false,
          error: data.error || "Job failed",
          detail: data.detail ?? data,
        });
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setJobStatus("error");
        setLoading(false);
        setResp({
          ok: false,
          error: "Failed to fetch",
          detail: e?.message ?? String(e),
        });
      }
    };

    poll();
  }

  async function cancelJob() {
    if (!jobId) return;
    clearPoll();
    abortRef.current?.abort();
    abortRef.current = null;

    try {
      await fetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: "POST",
      });
    } catch {
      // ignore
    }

    setJobStatus("canceled");
    setLoading(false);
  }

  async function runAudit() {
    setResp(null);
    setJobProgress(null);
    setJobStatus("idle");
    setJobId(null);
    clearPoll();

    if (!searchFile || !keywordsFile) {
      setResp({
        ok: false,
        error: "Missing files",
        detail: "Please upload both Search Terms and Keywords CSVs.",
      });
      return;
    }

    setLoading(true);
    abortRef.current = new AbortController();

    try {
      const form = new FormData();
      form.append("search_terms_file", searchFile);
      form.append("keywords_file", keywordsFile);

      form.append("min_clicks", String(minClicks));
      form.append("min_cost", String(minCost));
      form.append("similarity_threshold", String(similarity));
      form.append("use_llm", String(useLLM));
      form.append("batch_size", String(batchSize));
      form.append("currency", "GBP");
      form.append(
        "brand_terms",
        brandTerms
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .join(",")
      );

      const r = await fetch("/api/jobs", {
        method: "POST",
        body: form,
        signal: abortRef.current.signal,
      });

      const text = await r.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = { ok: false, error: "Non-JSON response", detail: text };
      }

      if (!r.ok) {
        setLoading(false);
        setJobStatus("error");
        setResp({
          ok: false,
          error: data?.error || "Request failed",
          detail: data?.detail ?? data,
        });
        return;
      }

      // Your /api/jobs returns { ok: true, jobId: "..." } (or job_id)
      const newJobId = data?.jobId || data?.job_id || data?.id;
      if (!newJobId) {
        setLoading(false);
        setJobStatus("error");
        setResp({
          ok: false,
          error: "Job start failed",
          detail: data,
        });
        return;
      }

      setJobStatus("queued");
      setJobId(newJobId);

      // Reset filter after each new run
      setCampaignFilter("ALL");

      // Start polling
      await pollJob(newJobId);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setLoading(false);
      setJobStatus("error");
      setResp({
        ok: false,
        error: "Failed to fetch",
        detail: e?.message ?? String(e),
      });
    }
  }

  const statusLabel = useMemo(() => {
    if (!loading && jobStatus === "idle") return null;
    if (jobStatus === "queued") return "Queued…";
    if (jobStatus === "running") return "Running audit…";
    if (jobStatus === "done") return "Done";
    if (jobStatus === "canceled") return "Canceled";
    if (jobStatus === "error") return "Error";
    return loading ? "Working…" : null;
  }, [jobStatus, loading]);

  const errorTitle =
    resp?.ok === false ? asDisplayText(resp.error) || "Error" : "";
  const errorBody =
    resp?.ok === false ? asDisplayText(resp.detail ?? resp) : "";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-zinc-50/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <LogoMark />
          <div className="text-sm text-zinc-600">
            Using proxy routes:{" "}
            <span className="font-medium text-zinc-900">/api/jobs</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <SectionCard title="Upload exports (temporary — until Google Ads integration)">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="text-sm font-semibold text-zinc-900">
                Search Terms CSV
              </div>
              <p className="mt-1 text-xs text-zinc-600">
                Export from Google Ads Search Terms report.
              </p>
              <input
                type="file"
                accept=".csv"
                className="mt-3 block w-full text-sm"
                onChange={(e) => setSearchFile(e.target.files?.[0] ?? null)}
              />
              {searchFile ? (
                <p className="mt-2 text-xs text-zinc-600">
                  Selected:{" "}
                  <span className="font-medium text-zinc-900">
                    {searchFile.name}
                  </span>
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="text-sm font-semibold text-zinc-900">
                Keywords CSV
              </div>
              <p className="mt-1 text-xs text-zinc-600">
                Export from Google Ads Keywords view.
              </p>
              <input
                type="file"
                accept=".csv"
                className="mt-3 block w-full text-sm"
                onChange={(e) => setKeywordsFile(e.target.files?.[0] ?? null)}
              />
              {keywordsFile ? (
                <p className="mt-2 text-xs text-zinc-600">
                  Selected:{" "}
                  <span className="font-medium text-zinc-900">
                    {keywordsFile.name}
                  </span>
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="text-sm font-semibold text-zinc-900">Filters</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-xs text-zinc-700">
                  Min clicks
                  <input
                    value={minClicks}
                    onChange={(e) => setMinClicks(Number(e.target.value))}
                    type="number"
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-zinc-700">
                  Min cost
                  <input
                    value={minCost}
                    onChange={(e) => setMinCost(Number(e.target.value))}
                    type="number"
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="text-sm font-semibold text-zinc-900">
                Similarity threshold
              </div>
              <p className="mt-1 text-xs text-zinc-600">
                Higher = more aggressive.
              </p>
              <input
                value={similarity}
                onChange={(e) => setSimilarity(Number(e.target.value))}
                type="number"
                step="0.01"
                min="0"
                max="1"
                className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="text-sm font-semibold text-zinc-900">
                AI + brand protection
              </div>
              <div className="mt-3 flex items-center gap-3">
                <input
                  id="use-llm"
                  checked={useLLM}
                  onChange={(e) => setUseLLM(e.target.checked)}
                  type="checkbox"
                  className="h-4 w-4"
                />
                <label htmlFor="use-llm" className="text-sm text-zinc-700">
                  Use AI decisions (recommended)
                </label>
              </div>

              <label className="mt-3 block text-xs text-zinc-700">
                Brand terms (comma separated)
                <input
                  value={brandTerms}
                  onChange={(e) => setBrandTerms(e.target.value)}
                  placeholder="e.g. ihasco, termtidy"
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
              </label>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-xs text-zinc-700">
                  Batch size
                  <input
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                    type="number"
                    min="1"
                    max="50"
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={runAudit}
                disabled={loading}
                className={[
                  "inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition",
                  loading
                    ? "bg-zinc-300 text-zinc-600"
                    : "bg-zinc-900 text-white hover:bg-zinc-800",
                ].join(" ")}
              >
                {loading ? "Starting…" : "Run audit"}
              </button>

              <button
                onClick={() =>
                  downloadCsv("termtidy_negative_keywords.csv", results)
                }
                disabled={loading || results.length === 0}
                className={[
                  "inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition",
                  loading || results.length === 0
                    ? "border border-zinc-200 bg-white text-zinc-400"
                    : "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
                ].join(" ")}
              >
                Download CSV
              </button>

              {loading ? (
                <button
                  onClick={cancelJob}
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Cancel
                </button>
              ) : null}
            </div>

            {statusLabel ? (
              <div className="flex items-center gap-3 text-sm text-zinc-600">
                <span className="font-medium text-zinc-900">{statusLabel}</span>
                {jobId ? (
                  <span className="text-xs text-zinc-500">
                    Job: <span className="font-mono">{jobId}</span>
                  </span>
                ) : null}
                {typeof jobProgress === "number" ? (
                  <span className="text-xs text-zinc-500">
                    {(jobProgress * 100).toFixed(0)}%
                  </span>
                ) : null}
              </div>
            ) : null}

            {resp?.ok === false ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 max-w-xl">
                <div className="font-semibold">{errorTitle}</div>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-red-700">
                  {errorBody}
                </pre>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Summary">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Rows after filters"
              value={String(stats.filtered_rows ?? 0)}
            />
            <Metric label="Candidates" value={String(stats.candidates ?? 0)} />
            <Metric
              label="Final negatives"
              value={String(stats.negatives_after_brand ?? 0)}
            />
            <Metric
              label="Estimated saving"
              value={formatGBP(stats.saving_cost)}
            />
          </div>

          <div className="mt-3 text-xs text-zinc-600">
            Annualised saving estimate:{" "}
            <span className="font-medium text-zinc-900">
              {formatGBP(stats.saving_cost_annual)}
            </span>
            {stats.protected_brand_rows ? (
              <>
                {" "}
                • Brand-protected rows:{" "}
                <span className="font-medium text-zinc-900">
                  {stats.protected_brand_rows}
                </span>
              </>
            ) : null}
          </div>
        </SectionCard>

        {results.length > 0 ? (
          <SectionCard title="Filter results">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <label className="text-sm text-zinc-700">
                Campaign
                <select
                  value={campaignFilter}
                  onChange={(e) => setCampaignFilter(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="ALL">All campaigns</option>
                  {campaigns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-sm text-zinc-600">
                Showing{" "}
                <span className="font-semibold text-zinc-900">
                  {results.length}
                </span>{" "}
                rows
                {campaignFilter !== "ALL" ? (
                  <>
                    {" "}
                    in{" "}
                    <span className="font-semibold text-zinc-900">
                      {campaignFilter}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard title="Top 5 most expensive wasted queries">
          {top5.length === 0 ? (
            <p className="text-sm text-zinc-600">No results yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs text-zinc-600">
                  <tr className="border-b border-zinc-200">
                    <th className="py-2 text-left">Search term</th>
                    <th className="py-2 text-left">Campaign</th>
                    <th className="py-2 text-left">Ad group</th>
                    <th className="py-2 text-left">Cost</th>
                    <th className="py-2 text-left">Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {top5.map((r, i) => (
                    <tr key={i} className="border-b border-zinc-100">
                      <td className="py-2 pr-4">{r.search_term ?? ""}</td>
                      <td className="py-2 pr-4">{r.campaign ?? ""}</td>
                      <td className="py-2 pr-4">{r.ad_group ?? ""}</td>
                      <td className="py-2 pr-4">
                        {formatGBP(Number(r.cost || 0))}
                      </td>
                      <td className="py-2 pr-4">{r.clicks ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Negative keyword suggestions">
          {results.length === 0 ? (
            <p className="text-sm text-zinc-600">No results yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs text-zinc-600">
                  <tr className="border-b border-zinc-200">
                    <th className="py-2 text-left">Negative (exact)</th>
                    <th className="py-2 text-left">Search term</th>
                    <th className="py-2 text-left">Campaign</th>
                    <th className="py-2 text-left">Ad group</th>
                    <th className="py-2 text-left">Cost</th>
                    <th className="py-2 text-left">Clicks</th>
                    <th className="py-2 text-left">Conv.</th>
                    <th className="py-2 text-left">Risk</th>
                    <th className="py-2 text-left">Closest keyword</th>
                    <th className="py-2 text-left">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b border-zinc-100">
                      <td className="py-2 pr-4 font-medium">
                        {r.suggested_negative ?? ""}
                      </td>
                      <td className="py-2 pr-4">{r.search_term ?? ""}</td>
                      <td className="py-2 pr-4">{r.campaign ?? ""}</td>
                      <td className="py-2 pr-4">{r.ad_group ?? ""}</td>
                      <td className="py-2 pr-4">
                        {formatGBP(Number(r.cost || 0))}
                      </td>
                      <td className="py-2 pr-4">{r.clicks ?? ""}</td>
                      <td className="py-2 pr-4">
                        {Number(r.conversions || 0).toFixed(1)}
                      </td>
                      <td className="py-2 pr-4">{r.risk_score ?? ""}</td>
                      <td className="py-2 pr-4">{r.best_keyword ?? ""}</td>
                      <td className="py-2 pr-4 text-zinc-600">{r.reason ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </main>
    </div>
  );
}
