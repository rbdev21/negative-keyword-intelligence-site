export default function Home() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Stop Wasting Money on Irrelevant Google Ads Searches
        </h1>

        <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-10">
          AI-powered negative keyword recommendations that automatically reduce
          wasted spend and improve ROAS — without manual search term audits.
        </p>

        <div className="flex justify-center gap-4">
          <a
            href="#pricing"
            className="bg-black text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-800 transition"
          >
            Start 7-day free trial
          </a>

          <a
            href="#how-it-works"
            className="border border-gray-300 px-6 py-3 rounded-lg font-medium hover:bg-gray-100 transition"
          >
            See how it works
          </a>
        </div>
      </section>
    </main>
  );
}
