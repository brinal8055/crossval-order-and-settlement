import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
      <section className="grid w-full gap-10 rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm md:grid-cols-[1.2fr_0.8fr] md:p-14">
        <div>
          <p className="mb-5 text-sm font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
            CrossVal finance workspace
          </p>
          <h1 className="max-w-2xl text-5xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-7xl">
            Orders that stay accurate when money moves.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[var(--muted)]">
            Create customer orders, record partial settlements, and keep every balance and payment history defensible.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-full bg-[var(--accent)] px-6 py-3 font-semibold text-white transition hover:bg-[var(--accent-dark)]">
              Create workspace
            </Link>
            <Link href="/login" className="rounded-full border border-[var(--border)] px-6 py-3 font-semibold text-[var(--foreground)] transition hover:bg-[var(--soft)]">
              Sign in
            </Link>
          </div>
        </div>
        <div className="flex items-end rounded-3xl bg-[var(--soft)] p-6 md:p-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent-dark)]">Built for clarity</p>
            <p className="mt-4 text-3xl font-semibold tracking-tight">One source of truth.</p>
            <p className="mt-3 leading-7 text-[var(--muted)]">Server-authoritative totals, immutable settlement history, and a dashboard that makes outstanding work obvious.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
