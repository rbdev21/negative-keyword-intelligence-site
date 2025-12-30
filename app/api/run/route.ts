import { NextResponse } from "next/server";

const API_BASE = process.env.TERMTIDY_API_URL || process.env.NEXT_PUBLIC_TERMTIDY_API_URL;

type JobStatus = "queued" | "running" | "done" | "error";

type Job = {
  id: string;
  status: JobStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  message?: string;
  result?: any;
};

declare global {
  // eslint-disable-next-line no-var
  var __TERMTIDY_JOBS__: Map<string, Job> | undefined;
}

function jobsStore(): Map<string, Job> {
  if (!global.__TERMTIDY_JOBS__) global.__TERMTIDY_JOBS__ = new Map();
  return global.__TERMTIDY_JOBS__;
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function POST(req: Request) {
  if (!API_BASE) {
    return NextResponse.json(
      { ok: false, error: "Missing TERMTIDY_API_URL env var" },
      { status: 500 }
    );
  }

  const formData = await req.formData();
  const searchTermsFile = formData.get("search_terms_file") as File | null;
  const keywordsFile = formData.get("keywords_file") as File | null;

  if (!searchTermsFile || !keywordsFile) {
    return NextResponse.json(
      {
        ok: false,
        error: "Bad Request",
        message:
          "Missing CSV files. Expect form-data keys: search_terms_file, keywords_file",
      },
      { status: 400 }
    );
  }

  const configRaw = formData.get("config") as string | null;
  const config = configRaw ? JSON.parse(configRaw) : {};

  const jobId = uid();
  const store = jobsStore();

  store.set(jobId, {
    id: jobId,
    status: "queued",
    createdAt: Date.now(),
    message: "Queued…",
  });

  // Fire-and-forget background task (in-memory)
  (async () => {
    const job = store.get(jobId);
    if (!job) return;

    job.status = "running";
    job.startedAt = Date.now();
    job.message = "Running audit…";
    store.set(jobId, job);

    try {
      const upstreamForm = new FormData();
      upstreamForm.append("search_terms_file", searchTermsFile, searchTermsFile.name);
      upstreamForm.append("keywords_file", keywordsFile, keywordsFile.name);
      upstreamForm.append("config", JSON.stringify(config));

      const r = await fetch(`${API_BASE}/run_csv`, {
        method: "POST",
        body: upstreamForm,
      });

      const text = await r.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = { ok: false, error: "Non-JSON response", detail: text };
      }

      if (!r.ok) {
        job.status = "error";
        job.finishedAt = Date.now();
        job.message = data?.error || "Audit failed";
        job.result = data;
        store.set(jobId, job);
        return;
      }

      job.status = "done";
      job.finishedAt = Date.now();
      job.message = "Complete";
      job.result = data;
      store.set(jobId, job);
    } catch (e: any) {
      job.status = "error";
      job.finishedAt = Date.now();
      job.message = "Audit failed";
      job.result = { ok: false, error: "Failed to fetch", detail: e?.message ?? String(e) };
      store.set(jobId, job);
    }
  })();

  return NextResponse.json({ ok: true, job_id: jobId });
}
