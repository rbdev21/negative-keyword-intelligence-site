import Link from "next/link";

function LogoMark() {
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="TermTidy" className="h-9 w-9" />
      <span className="text-lg font-semibold tracking-tight">TermTidy</span>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
      {children}
    </span>
  );
}

function Card({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{desc}</p>
    </div>
  );
}

function PricingTier({
  name,
  price,
  credits,
  highlight,
  footnote,
}: {
  name: string;
  price: string;
  credits: string;
  highlight?: boolean;
  footnote?: string;
}) {
  return (
    <div
      className={[
        "rounded-lg border border-slate-200 bg-white p-6",
        highlight
          ? "border-blue-600 ring-1 ring-blue-600/20"
          : "border-slate-200",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-900">{name}</h3>
        {highlight ? (
          <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white">
            Most popular
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="flex items-end gap-2">
          <span className="text-4xl font-semibold tracking-tight text-zinc-900">
            {price}
          </span>
          <span className="pb-1 text-sm text-zinc-500">one-time</span>
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          Includes{" "}
          <span className="font-medium text-zinc-900">{credits}</span>{" "}
          credits.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          1 credit = 1 search term reviewed. Credits never expire.
        </p>
        {footnote ? (
          <p className="mt-2 text-xs text-zinc-500">{footnote}</p>
        ) : null}
      </div>

      <ul className="mt-6 space-y-3 text-sm text-zinc-700">
        <li className="flex gap-2">
          <span className="mt-[2px] inline-block h-2 w-2 rounded-full bg-zinc-900" />
          Google Ads account connection (OAuth)
        </li>
        <li className="flex gap-2">
          <span className="mt-[2px] inline-block h-2 w-2 rounded-full bg-zinc-900" />
          AI negative keyword recommendations
        </li>
        <li className="flex gap-2">
          <span className="mt-[2px] inline-block h-2 w-2 rounded-full bg-zinc-900" />
          Brand protection + safety checks
        </li>
        <li className="flex gap-2">
          <span className="mt-[2px] inline-block h-2 w-2 rounded-full bg-zinc-900" />
          On-demand audits with credit packs
        </li>
        <li className="flex gap-2">
          <span className="mt-[2px] inline-block h-2 w-2 rounded-full bg-zinc-900" />
          Export-ready negative keyword list
        </li>
      </ul>

      <div className="mt-8">
        <Link
          href="/signup"
          className={[
            "inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition",
            highlight
              ? "bg-zinc-900 text-white hover:bg-zinc-800"
              : "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
          ].join(" ")}
        >
          Try for free
        </Link>
        <p className="mt-2 text-center text-xs text-zinc-500">
          Start with 1,000 free credits, then top up anytime.
        </p>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <LogoMark />
          <nav className="flex items-center gap-3">
            <a
              href="#pricing"
              className="hidden text-sm text-slate-600 hover:text-slate-900 sm:inline"
            >
              Pricing
            </a>
            <a
              href="#how"
              className="hidden text-sm text-slate-600 hover:text-slate-900 sm:inline"
            >
              How it works
            </a>
            <Link
              href="/signup"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Try for free
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-6xl px-6">
        <section className="py-16 sm:py-20">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Google Ads integration</Badge>
                <Badge>AI negative keywords</Badge>
                <Badge>Brand protection</Badge>
              </div>

              <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
                Stop paying for irrelevant searches.
              </h1>

              <p className="mt-5 text-lg leading-relaxed text-slate-600">
                TermTidy connects to your Google Ads account, audits search
                terms, and recommends precise negative keywords to cut wasted
                spend — without harming good traffic. Pay only for filtered,
                billable terms.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Try for free
                </Link>
                <a
                  href="#pricing"
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  View pricing
                </a>
              </div>

              <p className="mt-3 text-sm text-slate-500">
                Free credits include{" "}
                <span className="font-medium text-slate-900">1,000 credits</span>{" "}
                (1 credit = 1 search term reviewed).
              </p>
            </div>

            <div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">
                  What you get
                </p>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  In minutes
                </span>
              </div>

              <div className="mt-5 space-y-4">
                <div className="rounded-md border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    1) Connect Google Ads
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Secure OAuth connection — pull search terms & keywords
                    directly.
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    2) Run an audit
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    AI flags irrelevant queries with spend and intent context.
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    3) Apply negatives
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Export-ready list + estimated savings. Schedule
                    on demand.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Social proof strip */}
          <div className="mt-14 grid gap-3 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Cleaner search terms
              </p>
              <p className="mt-1 text-sm text-slate-600">Less waste, more signal.</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Brand-safe</p>
              <p className="mt-1 text-sm text-slate-600">
                Protect your branded traffic.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Client-ready output
              </p>
              <p className="mt-1 text-sm text-slate-600">Export negatives instantly.</p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="py-10 sm:py-14">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                How TermTidy works
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                TermTidy compares your search terms to your keyword targets,
                detects mismatched intent, and recommends safe exact-match
                negatives — with brand protection built in. Only filtered,
                billable terms use credits.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card
              title="Connect your account"
              desc="Pull search terms and keywords directly via Google Ads OAuth."
            />
            <Card
              title="AI audit + safety checks"
              desc="Identify irrelevant intent, protect brand traffic, and avoid over-blocking."
            />
            <Card
              title="Export + schedule"
              desc="Download export-ready negatives and schedule audits on demand."
            />
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-12 sm:py-16">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Pricing</h2>
              <p className="mt-2 text-sm text-slate-600">
                Buy credits when you need them. Credits never expire.
              </p>
            </div>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Try for free
            </Link>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <PricingTier name="Starter Pack" price="£10" credits="10,000" />
            <PricingTier
              name="Growth Pack"
              price="£25"
              credits="30,000"
              highlight
              footnote="Great for most accounts and agencies running regular audits."
            />
            <PricingTier name="Pro Pack" price="£50" credits="75,000" />
            <PricingTier name="Scale Pack" price="£100" credits="175,000" />
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Free credits</p>
            <p className="mt-1">
              Get{" "}
              <span className="font-medium text-slate-900">1,000 free credits</span>{" "}
              to run your first audit.
            </p>
            <p className="mt-3">
              <span className="font-medium text-slate-900">Top-ups:</span> When
              you’re ready, buy a credit pack — credits never expire.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-200 py-10 text-sm text-slate-500">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="TermTidy" className="h-8 w-8" />
              <div>
                <p className="font-semibold text-slate-900">TermTidy</p>
                <p className="text-slate-500">
                  Negative Keyword Intelligence for Google Ads
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <a className="hover:text-slate-900" href="#pricing">
                Pricing
              </a>
              <a className="hover:text-slate-900" href="#how">
                How it works
              </a>
              <Link className="hover:text-slate-900" href="/signup">
                Try for free
              </Link>
            </div>
          </div>
          <p className="mt-8 text-xs">
            © {new Date().getFullYear()} TermTidy. All rights reserved.
          </p>
        </footer>
      </main>
    </div>
  );
}
