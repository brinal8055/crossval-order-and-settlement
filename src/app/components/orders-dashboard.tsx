"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Status = "pending" | "partially_paid" | "paid" | "overdue";
type Order = {
  id: string;
  customer: string;
  dueDate: string;
  total: string;
  amountPaid: string;
  amountDue: string;
  status: Status;
  version: number;
};

const statusLabels: Record<Status, string> = {
  pending: "Pending",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
};

const statusStyles: Record<Status, string> = {
  pending: "bg-[#f2f4f3] text-[#53615b]",
  partially_paid: "bg-[#fff5dc] text-[#8b5e00]",
  paid: "bg-[#e7f3ed] text-[#176044]",
  overdue: "bg-[#fff0ee] text-[#b42318]",
};
const PAGE_SIZE = 25;

type LineDraft = { description: string; quantity: string; unitPrice: string };
type ErrorBody = { error?: { message?: string; details?: Record<string, string> } };
type OrderSummary = { outstanding: string; overdue: number; partiallyPaid: number; paid: number };

function formatError(body: ErrorBody | null, fallback: string): string {
  const message = body?.error?.message ?? fallback;
  const details = Object.entries(body?.error?.details ?? {});
  if (details.length === 0) return message;
  return `${message} ${details.map(([field, detail]) => `${field}: ${detail}`).join(" · ")}`;
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusStyles[status]}`}>{statusLabels[status]}</span>;
}

function ExportOrdersPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(() => `${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function exportOrders(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { credentials: "include" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as ErrorBody | null;
        setError(formatError(body, "The export could not be generated."));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `orders-${from}-to-${to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
    <div><h2 className="text-lg font-semibold">Export orders</h2><p className="mt-1 text-sm text-[var(--muted)]">Download your tenant-scoped orders created in a date range.</p></div>
    <form onSubmit={exportOrders} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="text-sm font-semibold">From<input required type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-2 rounded-xl border border-[var(--border)] px-3 py-2.5" /></label>
      <label className="text-sm font-semibold">To<input required type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-2 rounded-xl border border-[var(--border)] px-3 py-2.5" /></label>
      <button disabled={busy} className="rounded-xl border border-[var(--border)] px-5 py-2.5 font-bold disabled:opacity-60">{busy ? "Preparing…" : "Download CSV"}</button>
    </form>
    {error ? <p role="alert" className="mt-3 rounded-xl bg-[#fff0ee] px-4 py-3 text-sm font-semibold text-[var(--danger)]">{error}</p> : null}
  </section>;
}

function CreateOrderPanel({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ description: "", quantity: "1", unitPrice: "" }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0), [lines]);
  function updateLine(index: number, field: keyof LineDraft, value: string) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line));
  }
  function reset() {
    setCustomer(""); setDueDate(""); setLines([{ description: "", quantity: "1", unitPrice: "" }]); setError("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json", origin: window.location.origin },
        body: JSON.stringify({ customer, dueDate, lines: lines.map((line) => ({ description: line.description, quantity: Number(line.quantity), unitPrice: line.unitPrice })) }),
      });
      if (!response.ok) { const body = await response.json().catch(() => null) as ErrorBody | null; setError(formatError(body, "Please check the order details.")); return; }
      reset(); setOpen(false); onCreated();
    } catch { setError("Connection failed. Please try again."); } finally { setBusy(false); }
  }

  if (!open) return <button onClick={() => setOpen(true)} className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[var(--accent-dark)]">+ New order</button>;
  return <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Create order</h2><p className="mt-1 text-sm text-[var(--muted)]">The server recalculates totals before saving.</p></div><button onClick={() => { setOpen(false); reset(); }} className="text-sm font-semibold text-[var(--muted)]">Cancel</button></div>
    <form onSubmit={submit} className="mt-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Customer<input required value={customer} onChange={(event) => setCustomer(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-2.5" /></label><label className="text-sm font-semibold">Due date<input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-2.5" /></label></div>
      <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-sm font-bold">Line items</h3><button type="button" onClick={() => setLines((current) => [...current, { description: "", quantity: "1", unitPrice: "" }])} className="text-sm font-bold text-[var(--accent)]">+ Add line</button></div>{lines.map((line, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_90px_130px_32px]"><input aria-label={`Description ${index + 1}`} required placeholder="Description" value={line.description} onChange={(event) => updateLine(index, "description", event.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2.5" /><input aria-label={`Quantity ${index + 1}`} required min="1" type="number" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2.5" /><input aria-label={`Unit price ${index + 1}`} required min="0" step="0.01" placeholder="0.00" value={line.unitPrice} onChange={(event) => updateLine(index, "unitPrice", event.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2.5" /><button type="button" aria-label={`Remove line ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} className="rounded-xl text-lg text-[var(--muted)] disabled:opacity-30">×</button></div>)}</div>
      <div className="flex items-center justify-between rounded-xl bg-[var(--soft)] px-4 py-3"><span className="text-sm font-semibold text-[var(--muted)]">Preview total</span><span className="text-lg font-bold">${preview.toFixed(2)}</span></div>
      {error ? <p role="alert" className="rounded-xl bg-[#fff0ee] px-4 py-3 text-sm font-semibold text-[var(--danger)]">{error}</p> : null}<button disabled={busy} className="rounded-xl bg-[var(--accent)] px-5 py-3 font-bold text-white disabled:opacity-60">{busy ? "Saving…" : "Create order"}</button>
    </form>
  </div>;
}

export default function OrdersDashboard() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0 });
  const [summary, setSummary] = useState<OrderSummary>({ outstanding: "0.00", overdue: 0, partiallyPaid: 0, paid: 0 });

  const loadOrders = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const me = await fetch("/api/auth/me", { credentials: "include" });
      if (me.status === 401) { router.push("/login"); return; }
      if (!me.ok) throw new Error();
      setUserEmail(((await me.json()) as { user: { email: string } }).user.email);
      const query = filter === "all" ? "" : `&status=${filter}`;
      const response = await fetch(`/api/orders?page=${page}&limit=${PAGE_SIZE}${query}`, { credentials: "include" });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as { items: Order[]; pagination: typeof pagination; summary: OrderSummary };
      setOrders(result.items);
      setPagination(result.pagination);
      setSummary(result.summary);
    } catch { setError("We could not load your orders. Try again."); } finally { setLoading(false); }
  }, [filter, page, router]);
  useEffect(() => { const timer = window.setTimeout(() => { void loadOrders(); }, 0); return () => window.clearTimeout(timer); }, [loadOrders]);

  const totalPages = Math.max(1, Math.ceil(pagination.total / PAGE_SIZE));

  async function logout() { await fetch("/api/auth/logout", { method: "POST", credentials: "include", headers: { origin: window.location.origin } }); router.push("/"); }

  return <main className="mx-auto min-h-screen max-w-7xl px-5 py-6 sm:px-8 sm:py-10">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><Link href="/" className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent)]">CrossVal</Link><h1 className="mt-3 text-4xl font-semibold tracking-tight">Orders &amp; settlements</h1><p className="mt-2 text-[var(--muted)]">A clear view of what is owed, paid, and next.</p></div><div className="flex items-center gap-3"><span className="hidden text-sm text-[var(--muted)] sm:inline">{userEmail}</span><button onClick={logout} className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface)]">Sign out</button></div></header>
    <div className="mt-9 space-y-4"><CreateOrderPanel onCreated={() => void loadOrders()} /><ExportOrdersPanel /></div>
    <section aria-label="Order summary" className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl bg-[var(--accent)] p-5 text-white"><p className="text-sm font-semibold text-white/75">Filtered outstanding</p><p className="mt-3 text-3xl font-semibold">${summary.outstanding}</p></div><div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><p className="text-sm font-semibold text-[var(--muted)]">Filtered overdue</p><p className="mt-3 text-3xl font-semibold">{summary.overdue}</p></div><div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><p className="text-sm font-semibold text-[var(--muted)]">Filtered partially paid</p><p className="mt-3 text-3xl font-semibold">{summary.partiallyPaid}</p></div><div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><p className="text-sm font-semibold text-[var(--muted)]">Filtered paid</p><p className="mt-3 text-3xl font-semibold">{summary.paid}</p></div></section>
    <section className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4"><div><h2 className="text-lg font-semibold">Your orders</h2><p className="mt-1 text-xs text-[var(--muted)]">Summary cards cover all orders matching the current filter.</p></div><div role="group" aria-label="Filter orders" className="flex flex-wrap gap-2">{(["all", "pending", "partially_paid", "paid", "overdue"] as const).map((value) => <button key={value} onClick={() => { setFilter(value); setPage(1); }} aria-pressed={filter === value} className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === value ? "bg-[var(--accent)] text-white" : "bg-[var(--soft)] text-[var(--muted)]"}`}>{value === "all" ? "All" : statusLabels[value]}</button>)}</div></div>{error ? <div role="alert" className="m-5 rounded-xl bg-[#fff0ee] px-4 py-3 text-sm font-semibold text-[var(--danger)]">{error} <button onClick={() => void loadOrders()} className="ml-2 underline">Retry</button></div> : loading ? <p className="px-5 py-12 text-center text-[var(--muted)]">Loading orders…</p> : orders.length === 0 ? <div className="px-5 py-14 text-center"><p className="text-lg font-semibold">No orders in this view</p><p className="mt-2 text-sm text-[var(--muted)]">Create an order to start tracking a settlement.</p></div> : <><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#f8faf9] text-xs uppercase tracking-[0.12em] text-[var(--muted)]"><tr><th className="px-5 py-4 font-bold">Customer</th><th className="px-5 py-4 font-bold">Status</th><th className="px-5 py-4 font-bold">Total</th><th className="px-5 py-4 font-bold">Paid</th><th className="px-5 py-4 font-bold">Due</th><th className="px-5 py-4 font-bold">Due date</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-[var(--border)] transition hover:bg-[#fbfdfc]"><td className="px-5 py-4"><Link href={`/orders/${order.id}`} className="font-semibold text-[var(--accent)] hover:underline">{order.customer}</Link></td><td className="px-5 py-4"><StatusBadge status={order.status} /></td><td className="px-5 py-4">${order.total}</td><td className="px-5 py-4">${order.amountPaid}</td><td className="px-5 py-4 font-semibold">${order.amountDue}</td><td className="px-5 py-4 text-[var(--muted)]">{order.dueDate}</td></tr>)}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-4"><p className="text-sm text-[var(--muted)]">Showing page {pagination.page} of {totalPages} · {pagination.total} total orders</p><div className="flex gap-2"><button disabled={page === 1 || loading} onClick={() => setPage((current) => current - 1)} className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Previous</button><button disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)} className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Next</button></div></div></>}</section>
  </main>;
}
