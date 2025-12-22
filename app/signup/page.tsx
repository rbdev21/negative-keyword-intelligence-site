import Link from "next/link";

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-3">
          {/* Logo */}
          <img src="/logo.svg" alt="TermTidy" className="h-8 w-auto" />
        </Link>

        <Link
          href="/"
          className="text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          ← Back to home
        </Link>
      </header>

      <section className="mx-auto w-full max-w-2xl px-6 py-16">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
            Create your TermTidy account
          </h1>
          <p className="mt-3 text-gray-600">
            This is a placeholder signup page. We’ll add authentication and billing next.
          </p>

          <div className="mt-8 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">
                Work email
              </label>
              <input
                type="email"
                placeholder="you@company.com"
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none ring-0 focus:border-gray-300"
                disabled
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none ring-0 focus:border-gray-300"
                disabled
              />
            </div>

            <button
              className="mt-2 w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white opacity-60"
              disabled
            >
              Create account (coming soon)
            </button>

            <p className="pt-2 text-center text-sm text-gray-600">
              Already have an account?{" "}
              <span className="font-medium text-gray-900">
                Sign in (coming soon)
              </span>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
