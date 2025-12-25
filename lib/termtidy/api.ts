export type TermTidyRunRequest = {
  search_terms: Record<string, any>[];
  keywords: Record<string, any>[];
  min_clicks?: number;
  min_cost?: number;
  similarity_threshold?: number;
  use_llm?: boolean;
  batch_size?: number;
  currency?: string;
  brand_terms?: string[];
};

export type TermTidyRunResponse = {
  ok: boolean;
  stats?: Record<string, any>;
  results?: Record<string, any>[];
  error?: string;
  detail?: any;
};

export async function runAudit(payload: TermTidyRunRequest): Promise<TermTidyRunResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_TERMTIDY_API_URL;
  if (!baseUrl) {
    return { ok: false, error: "Missing NEXT_PUBLIC_TERMTIDY_API_URL" };
  }

  try {
    const res = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Try JSON either way
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: data?.error ?? "Request failed",
        detail: data,
      };
    }

    return data as TermTidyRunResponse;
  } catch (err: any) {
    return {
      ok: false,
      error: "Failed to fetch",
      detail: err?.message ?? String(err),
    };
  }
}
