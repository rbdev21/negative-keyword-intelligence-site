import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UsagePanel from "@/components/UsagePanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AccountPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage your profile and credits.
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <Button variant="secondary">Sign out</Button>
          </form>
        </div>

        <div className="mt-6">
          <UsagePanel />
        </div>

        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>User profile</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto rounded-md bg-slate-50 p-4 text-xs text-slate-800">
                {JSON.stringify(user, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
