import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UsagePanel from "@/components/UsagePanel";

export default async function AccountPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
          <form action="/auth/signout" method="post">
            <button className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50">
              Sign out
            </button>
          </form>
        </div>

        <div className="mt-6">
          <UsagePanel />
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-zinc-900">User</p>
          <pre className="mt-3 overflow-auto rounded-xl bg-zinc-50 p-4 text-xs text-zinc-800">
            {JSON.stringify(user, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
