"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

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

    // 3) Send them straight into the app trial
    router.push("/app");
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">Create your account</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Start your 7-day free trial (20,000 search terms).
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <input
          className="w-full rounded-lg border px-4 py-3"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full rounded-lg border px-4 py-3"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button
          className="w-full rounded-lg bg-black px-4 py-3 text-white disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Creating..." : "Create account"}
        </button>

        {msg && <p className="text-sm text-neutral-700">{msg}</p>}
      </form>
    </main>
  );
}
