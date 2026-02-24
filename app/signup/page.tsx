"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  const supabase = createClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    // 1) Create the account
    const { error: signUpErr } = await supabase.auth.signUp({ email, password });
    if (signUpErr) {
      setLoading(false);
      setMsg(signUpErr.message);
      return;
    }

    // 2) Immediately sign in (so they land in /app without needing /login)
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInErr) {
      // If your Supabase project requires email confirmation, this may happen.
      setMsg("Account created. Please check your email to confirm, then log in.");
      router.push("/login");
      return;
    }

    // 3) Send them straight into the app with free credits
    router.push("/app");
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            Start with 20,000 free credits (1 credit = 1 search term reviewed).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-700">Email</label>
              <Input
                className="mt-1"
                placeholder="you@company.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Password</label>
              <Input
                className="mt-1"
                placeholder="••••••••"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button className="w-full" disabled={loading}>
              {loading ? "Creating..." : "Create account"}
            </Button>

            {msg && <p className="text-sm text-slate-700">{msg}</p>}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
