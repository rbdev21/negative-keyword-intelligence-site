import { NextResponse } from "next/server";

// IMPORTANT:
// This route should stay LIGHT.
// It should validate + parse CSV quickly + forward to the Python API.
// The Python API is where the heavy work happens.

export const runtime = "nodejs"; // ensure Node runtime (needed for Buffer, etc.)

const API_BASE = process.env.TERMTIDY_API_URL || process.env.NEXT_PUBLIC_TERMTIDY_API_URL;

function badRequest(message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: "Bad Request", detail: { message, extra } }, { status: 400 });
}

function serverError(message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: "Server Error", detail: { message, extra } }, { status: 500 });
}

function parseCsvBasic(text: string): Record<string, any>[] {
  // Basic CSV parser (handles quoted values minimally).
  // Good enough for Google Ads exports.
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '"') {
        // escaped quote
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, any>[] = [];

  for (const line of lines.slice(1)) {
    const cols = parseLine(line);
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] ?? "").trim();
    });
    rows.push(obj);
  }

  return rows;
}

export async function POST(req: Request) {
  try {
    if (!API_BASE) {
      return serverError("Missing TERMTIDY_API_URL env var", {
        hint: "Set TERMTIDY_API_URL in Vercel and in local .env.local (no quotes). Example: https://termtidy-api.onrender.com",
      });
    }

    // Expect multipart/form-data with:
    // - search_terms_file (csv)
    // - keywords_file (csv)
    // plus optional fields: min_clicks, min_cost, similarity_threshold, use_llm, batch_size, brand_terms (comma string)
    const form = await req.formData();

    const searchFile = form.get("search_terms_file");
    const keywordsFile = form.get("keywords_file");

    if (!(searchFile instanceof File) || !(keywordsFile instanceof File)) {
      return badRequest("Missing CSV files. Expect form-data keys: search_terms_file, keywords_file");
    }

    // Read CSVs (quickly)
    const [searchText, keywordText] = await Promise.all([searchFile.text(), keywordsFile.text()]);
    const search_terms = parseCsvBasic(searchText);
    const keywords = parseCsvBasic(keywordText);

    // Read config fields from form
    const min_clicks = Number(form.get("min_clicks") ?? 3);
    const min_cost = Number(form.get("min_cost") ?? 0);
    const similarity_threshold = Number(form.get("similarity_threshold") ?? 0.75);
    const use_llm = String(form.get("use_llm") ?? "true") === "true";
    const batch_size = Number(form.get("batch_size") ?? 5);
    const currency = String(form.get("currency") ?? "GBP");

    const brand_terms_raw = String(form.get("brand_terms") ?? "");
    const brand_terms = brand_terms_raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload = {
      search_terms,
      keywords,
      min_clicks,
      min_cost,
      similarity_threshold,
      use_llm,
      batch_size,
      currency,
      brand_terms,
    };

    // Avoid hanging forever
    const controller = new AbortController();
    const timeoutMs = 240_000; // 4 minutes (local dev). On Vercel you may still hit platform limits if too slow.
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let upstreamResp: Response;
    try {
      upstreamResp = await fetch(`${API_BASE}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await upstreamResp.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: false, error: "Non-JSON response from API", detail: text };
    }

    return NextResponse.json(data, { status: upstreamResp.ok ? 200 : upstreamResp.status });
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Request timed out while calling the audit API" : (e?.message ?? String(e));
    return serverError(msg);
  }
}
