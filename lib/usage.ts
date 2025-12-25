export type UsageSummary = {
  ok: boolean;
  userId?: string;
  monthStart?: string;
  used?: number;
  quota?: number;
  remaining?: number;
  error?: string;
  details?: string;
};

export async function fetchUsage(): Promise<UsageSummary> {
  const res = await fetch("/api/usage", { method: "GET" });
  const data = (await res.json()) as UsageSummary;
  return data;
}
