"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Status = "pending" | "partially_paid" | "paid" | "overdue";
type Line = { id: string; description: string; quantity: number; unitPrice: string; lineTotal: string };
type Order = { id: string; customer: string; dueDate: string; currency: string; lines: Line[]; total: string; amountPaid: string; amountDue: string; status: Status; version: number; editable: boolean; createdAt: string; updatedAt: string };
type Payment = { id: string; sequence: number; amount: string; paymentDate: string; recordedAt: string; note?: string; balanceBefore: string; balanceAfter: string };
type ErrorBody = { error?: { code?: string; message?: string; details?: { maximumAllowed?: string } } };

const labels: Record<Status, string> = { pending: "Pending", partially_paid: "Partially paid", paid: "Paid", overdue: "Overdue" };
const styles: Record<Status, string> = { pending: "bg-[#f2f4f3] text-[#53615b]", partially_paid: "bg-[#fff5dc] text-[#8b5e00]", paid: "bg-[#e7f3ed] text-[#176044]", overdue: "bg-[#fff0ee] text-[#b42318]" };

function Badge({ status }: { status: Status }) { return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${styles[status]}`}>{labels[status]}</span>; }

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as ErrorBody | null;
  return body?.error?.message ?? fallback;
}

function PaymentForm({ order, onSettled }: { order: Order; onSettled: () => void }) {
  const [amount, setAmount] = useState(order.amountDue);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [attempt, setAttempt] = useState<{ key: string; payload: { amount: string; paymentDate: string; note?: string } } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const payload = { amount, paymentDate, ...(note.trim() ? { note: note.trim() } : {}) };
  function changePayload(update: () => void) { setAttempt(null); setError(""); update(); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const samePayload = attempt && JSON.stringify(attempt.payload) === JSON.stringify(payload);
    const key = samePayload ? attempt.key : crypto.randomUUID();
    if (!samePayload) setAttempt({ key, payload });
    try {
      const response = await fetch(`/api/orders/${order.id}/payments`, { method: "POST", credentials: "include", headers: { "content-type": "application/json", origin: window.location.origin, "idempotency-key": key }, body: JSON.stringify(payload) });
      if (!response.ok) { const body = await response.json().catch(() => null) as ErrorBody | null; setError(body?.error?.code === "OVERPAYMENT" ? `Payment exceeds the outstanding balance. Maximum allowed: $${body.error.details?.maximumAllowed ?? order.amountDue}.` : body?.error?.message ?? "Payment could not be recorded."); return; }
      setAttempt(null); setError(""); onSettled();
    } catch { setError("The connection was interrupted. Press retry to safely resend the same payment."); } finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Record settlement</h2><p className="mt-1 text-sm text-[var(--muted)]">Outstanding: <strong className="text-[var(--foreground)]">${order.amountDue}</strong></p></div><span className="rounded-full bg-[var(--soft)] px-3 py-1 text-xs font-bold text-[var(--accent-dark)]">Immutable history</span></div><form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-3"><label className="text-sm font-semibold">Amount<input required min="0.01" step="0.01" value={amount} onChange={(event) => changePayload(() => setAmount(event.target.value))} className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-2.5" /></label><label className="text-sm font-semibold">Payment date<input required type="date" value={paymentDate} onChange={(event) => changePayload(() => setPaymentDate(event.target.value))} className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-2.5" /></label><label className="text-sm font-semibold">Note<span className="sr-only"> (optional)</span><input maxLength={1000} value={note} onChange={(event) => changePayload(() => setNote(event.target.value))} className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-2.5" placeholder="Bank transfer" /></label><div className="sm:col-span-3 flex flex-wrap items-center gap-3"><button disabled={busy} className="rounded-xl bg-[var(--accent)] px-5 py-3 font-bold text-white disabled:opacity-60">{busy ? "Recording…" : attempt ? "Retry settlement" : "Record payment"}</button>{attempt ? <span className="text-sm text-[var(--muted)]">Retry keeps the same idempotency key.</span> : null}</div></form>{error ? <p role="alert" className="mt-4 rounded-xl bg-[#fff0ee] px-4 py-3 text-sm font-semibold text-[var(--danger)]">{error}</p> : null}</section>;
}

function EditOrderForm({ order, onSaved, onCancel }: { order: Order; onSaved: () => void; onCancel: () => void }) {
  const [customer, setCustomer] = useState(order.customer);
  const [dueDate, setDueDate] = useState(order.dueDate);
  const [lines, setLines] = useState(order.lines.map((line) => ({ description: line.description, quantity: String(line.quantity), unitPrice: line.unitPrice })));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/orders/${order.id}`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json", origin: window.location.origin }, body: JSON.stringify({ version: order.version, customer, dueDate, lines: lines.map((line) => ({ ...line, quantity: Number(line.quantity) })) }) });
      if (!response.ok) { setError(await readError(response, "The order could not be updated.")); return; }
      onSaved();
    } catch { setError("Connection failed. Please try again."); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm"><h2 className="text-lg font-semibold">Edit order</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Customer<input required value={customer} onChange={(event) => setCustomer(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-2.5" /></label><label className="text-sm font-semibold">Due date<input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-2.5" /></label></div><div className="mt-5 space-y-2"><h3 className="text-sm font-bold">Line items</h3>{lines.map((line, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_90px_130px]"><input aria-label={`Description ${index + 1}`} required value={line.description} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} className="rounded-xl border border-[var(--border)] px-3 py-2.5" /><input aria-label={`Quantity ${index + 1}`} required min="1" type="number" value={line.quantity} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))} className="rounded-xl border border-[var(--border)] px-3 py-2.5" /><input aria-label={`Unit price ${index + 1}`} required min="0" step="0.01" value={line.unitPrice} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unitPrice: event.target.value } : item))} className="rounded-xl border border-[var(--border)] px-3 py-2.5" /></div>)}</div>{error ? <p role="alert" className="mt-4 rounded-xl bg-[#fff0ee] px-4 py-3 text-sm font-semibold text-[var(--danger)]">{error}</p> : null}<div className="mt-5 flex gap-3"><button disabled={busy} className="rounded-xl bg-[var(--accent)] px-5 py-3 font-bold text-white disabled:opacity-60">{busy ? "Saving…" : "Save changes"}</button><button type="button" onClick={onCancel} className="rounded-xl border border-[var(--border)] px-5 py-3 font-bold">Cancel</button></div></form>;
}

export default function OrderDetail({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [orderResponse, paymentResponse] = await Promise.all([fetch(`/api/orders/${orderId}`, { credentials: "include" }), fetch(`/api/orders/${orderId}/payments`, { credentials: "include" })]);
      if (orderResponse.status === 401) { router.push("/login"); return; }
      if (orderResponse.status === 404) { setError("That order could not be found."); return; }
      if (!orderResponse.ok || !paymentResponse.ok) throw new Error();
      setOrder(await orderResponse.json() as Order); setPayments((await paymentResponse.json() as { items: Payment[] }).items);
    } catch { setError("We could not load this order. Try again."); } finally { setLoading(false); }
  }, [orderId, router]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  async function deleteCurrent() {
    if (!order || !window.confirm("Delete this unpaid order? This cannot be undone.")) return;
    setDeleting(true);
    try { const response = await fetch(`/api/orders/${order.id}?version=${order.version}`, { method: "DELETE", credentials: "include", headers: { origin: window.location.origin } }); if (!response.ok) { setError(await readError(response, "The order could not be deleted.")); return; } router.push("/orders"); } catch { setError("Connection failed. Please try again."); } finally { setDeleting(false); }
  }
  if (loading) return <main className="mx-auto max-w-6xl px-6 py-16 text-[var(--muted)]">Loading order…</main>;
  if (error || !order) return <main className="mx-auto max-w-6xl px-6 py-16"><Link href="/orders" className="font-semibold text-[var(--accent)]">← Back to orders</Link><p role="alert" className="mt-10 rounded-2xl bg-[#fff0ee] px-5 py-4 font-semibold text-[var(--danger)]">{error || "Order not found."}</p></main>;
  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-6 sm:px-8 sm:py-10"><Link href="/orders" className="text-sm font-semibold text-[var(--accent)]">← Back to orders</Link><header className="mt-7 flex flex-wrap items-start justify-between gap-5"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-4xl font-semibold tracking-tight">{order.customer}</h1><Badge status={order.status} /></div><p className="mt-3 text-[var(--muted)]">Due {order.dueDate} · Updated {new Date(order.updatedAt).toLocaleString()}</p></div>{order.editable ? <div className="flex gap-2"><button onClick={() => setEditing(true)} className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold hover:bg-[var(--surface)]">Edit</button><button disabled={deleting} onClick={() => void deleteCurrent()} className="rounded-full border border-[#f2c6c1] px-4 py-2 text-sm font-bold text-[var(--danger)] hover:bg-[#fff0ee]">{deleting ? "Deleting…" : "Delete"}</button></div> : null}</header>{!order.editable ? <div className="mt-6 rounded-2xl bg-[var(--soft)] px-5 py-4 text-sm font-semibold text-[var(--accent-dark)]">Settlement has started. This order is now read-only so its financial history stays intact.</div> : null}{editing ? <div className="mt-7"><EditOrderForm order={order} onSaved={() => { setEditing(false); void load(); }} onCancel={() => setEditing(false)} /></div> : null}<section className="mt-7 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-[var(--accent)] p-5 text-white"><p className="text-sm font-semibold text-white/75">Outstanding</p><p className="mt-2 text-3xl font-semibold">${order.amountDue}</p></div><div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><p className="text-sm font-semibold text-[var(--muted)]">Order total</p><p className="mt-2 text-3xl font-semibold">${order.total}</p></div><div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><p className="text-sm font-semibold text-[var(--muted)]">Amount paid</p><p className="mt-2 text-3xl font-semibold">${order.amountPaid}</p></div></section><section className="mt-7 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm"><h2 className="text-lg font-semibold">Line items</h2><div className="mt-4 space-y-3">{order.lines.map((line) => <div key={line.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f8faf9] px-4 py-3"><div><p className="font-semibold">{line.description}</p><p className="mt-1 text-sm text-[var(--muted)]">{line.quantity} × ${line.unitPrice}</p></div><p className="font-bold">${line.lineTotal}</p></div>)}</div></section>{order.amountDue !== "0.00" ? <div className="mt-7"><PaymentForm order={order} onSettled={() => void load()} /></div> : null}<section className="mt-7 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm"><div className="flex items-end justify-between gap-4"><div><h2 className="text-lg font-semibold">Payment history</h2><p className="mt-1 text-sm text-[var(--muted)]">Ordered by settlement sequence, newest first.</p></div><span className="text-sm font-semibold text-[var(--muted)]">{payments.length} {payments.length === 1 ? "payment" : "payments"}</span></div>{payments.length === 0 ? <p className="mt-8 text-sm text-[var(--muted)]">No payments recorded yet.</p> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]"><tr><th className="px-3 py-3">Sequence</th><th className="px-3 py-3">Recorded</th><th className="px-3 py-3">Payment date</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Balance after</th><th className="px-3 py-3">Note</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-t border-[var(--border)]"><td className="px-3 py-4 font-bold">#{payment.sequence}</td><td className="px-3 py-4 text-[var(--muted)]">{new Date(payment.recordedAt).toLocaleString()}</td><td className="px-3 py-4">{payment.paymentDate}</td><td className="px-3 py-4 font-bold">${payment.amount}</td><td className="px-3 py-4">${payment.balanceAfter}</td><td className="px-3 py-4 text-[var(--muted)]">{payment.note ?? "—"}</td></tr>)}</tbody></table></div>}</section></main>;
}
