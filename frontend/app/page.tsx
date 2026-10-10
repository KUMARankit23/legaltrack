"use client";
import { useState, useCallback, useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Client {
  id: string; name: string; email: string | null; phone: string | null;
  company: string | null; notes: string | null;
  case_count: number; invoice_count: number; outstanding: string;
}
interface CaseRow {
  id: string; case_no: string; cnr_number: string | null; case_year: number | null;
  case_title: string | null; court: string | null; case_type: string | null;
  status: string | null; next_hearing_date: string | null; last_hearing_date: string | null;
  filing_date: string | null; updated_at: string; client_name: string | null; client_id: string | null;
}
interface Party { id: string; name: string; role: string; }
interface Hearing { id: string; date: string; purpose: string | null; outcome: string | null; }
interface BillingEntry {
  id: string; description: string; entry_date: string; hours: number; rate: number;
  amount: number; entry_type: string; is_billed: boolean; case_no?: string;
}
interface Invoice {
  id: string; invoice_number: string; client_id: string; case_id: string | null;
  issue_date: string; due_date: string | null; subtotal: number; tax_pct: number;
  tax_amount: number; total: number; status: string; ai_summary: string | null;
  client_name?: string; case_no?: string; case_title?: string;
  items?: InvoiceItem[]; predicted_next_hearing?: string | null;
}
interface InvoiceItem { id: string; description: string; quantity: number; unit_price: number; amount: number; }
interface CaseDetail extends CaseRow { parties: Party[]; hearings: Hearing[]; billing: BillingEntry[]; }
interface Order {
  id: string;
  case_id: string;
  order_date: string;
  order_type: string;
  court_no: string | null;
  pdf_url: string;
  local_path: string | null;
  source: string | null;
  file_size: number | null;
  text_preview: string | null;
}
interface SearchResult {
  cases: CaseRow[];
  orders: Order[];
}
type Page = "dashboard" | "clients" | "cases" | "hearings" | "billing" | "settings";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(iso: string | null, short = false) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (short) return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}
function fmtDDMMYYYY(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  } catch { return iso; }
}
function isUpcoming(iso: string | null) {
  return !!iso && new Date(iso) >= new Date();
}
function isToday(iso: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}
function isThisWeek(iso: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / 86400000);
  return diffDays >= 0 && diffDays <= 7;
}
function splitTitle(t: string | null): [string, string] {
  if (!t) return ["—", ""];
  const i = t.indexOf(" v. ");
  return i === -1 ? [t, ""] : [t.slice(0, i), t.slice(i + 4)];
}
function rupees(n: number | string) {
  return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

async function api(path: string, opts?: RequestInit) {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { error?: string }).error ?? `HTTP ${r.status}`); }
  return r.json();
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const I = {
  dashboard: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  clients: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  cases: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m14.5 12.5-8 8a2.12 2.12 0 0 1-3-3l8-8"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></svg>,
  calendar: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  billing: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>,
  settings: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>,
  plus: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>,
  x: <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  search: <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  refresh: <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>,
  ai: <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 2a5 5 0 1 0 5 5"/><path d="m18 22-3-3 3-3"/><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/></svg>,
  file: <svg width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>,
  arrow: <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>,
  document: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>,
  download: <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  bell: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>,
  mail: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
  print: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>,
  check: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>,
  send: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>,
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const show = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);
  return { toast, show };
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage, counts }: { page: Page; setPage: (p: Page) => void; counts: Record<string, number> }) {
  const nav = (p: Page, icon: React.ReactNode, label: string, badge?: number) => (
    <button className={`nav-item${page === p ? " active" : ""}`} onClick={() => setPage(p)}>
      {icon} <span style={{ flex: 1 }}>{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
    </button>
  );
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          {/* Ashoka Chakra inspired icon */}
          <rect width="28" height="28" rx="5" fill="#E8600A"/>
          <circle cx="14" cy="14" r="8" fill="none" stroke="white" strokeWidth="1.5"/>
          <circle cx="14" cy="14" r="2" fill="white"/>
          {/* 8 spokes */}
          {[0,45,90,135,180,225,270,315].map(angle => {
            const rad = (angle * Math.PI) / 180;
            return <line key={angle} x1={14 + 3*Math.cos(rad)} y1={14 + 3*Math.sin(rad)} x2={14 + 7*Math.cos(rad)} y2={14 + 7*Math.sin(rad)} stroke="white" strokeWidth="1.2"/>;
          })}
        </svg>
        <span className="sidebar-logo-text">PROVAKIL<span>++</span></span>
      </div>
      <div className="sidebar-nav">
        <span className="nav-label">Overview</span>
        {nav("dashboard", I.dashboard, "Dashboard")}
        <span className="nav-label">Work</span>
        {nav("clients", I.clients, "Clients", counts.clients)}
        {nav("cases", <span style={{ display:"flex", alignItems:"center", gap:3 }}>{I.cases}{I.document}</span>, "Cases", counts.cases)}
        {nav("hearings", I.calendar, "Hearings", counts.hearings)}
        <span className="nav-label">Finance</span>
        {nav("billing", I.billing, "Billing & Invoices", counts.invoices)}
        <span className="nav-label">System</span>
        {nav("settings", I.settings, "Settings")}
      </div>
      <div className="sidebar-footer">
        <div className="avatar">A</div>
        <div><div className="user-name">Ankit</div><div className="user-role">Advocate</div></div>
      </div>
    </nav>
  );
}

// ─── Case Drawer ──────────────────────────────────────────────────────────────
function CaseDrawer({ id, onClose, toast }: { id: string; onClose: () => void; toast: (m: string, t?: "success" | "error") => void }) {
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState("");
  const [drawerTab, setDrawerTab] = useState<"listing" | "orders" | "summary">("listing");
  const [ordersRefresh, setOrdersRefresh] = useState(0);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => api(`/cases/${id}`).then(setDetail), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const loadOrders = useCallback(async () => {
    if (ordersLoading) return;
    setOrdersLoading(true);
    try {
      const data = await api(`/cases/${id}/orders`) as Order[];
      setOrders(data);
    } catch { setOrders([]); }
    finally { setOrdersLoading(false); }
  }, [id, ordersLoading]);

  useEffect(() => { if (drawerTab === "orders" && orders === null) loadOrders(); }, [drawerTab, orders, loadOrders]);

  const liveRefresh = async () => {
    if (fetching) return;
    setFetching(true);
    setFetchMsg("Starting fetch…");
    try {
      await api(`/cases/${id}/fetch`, { method: "POST" });
      setFetchMsg("Searching Delhi HC cause lists…");
      let attempts = 0;
      const maxAttempts = 20;
      pollRef.current = setInterval(async () => {
        attempts++;
        try {
          const s = await api(`/cases/${id}/fetch/status`) as { status: string; result?: { updated?: boolean; message?: string }; message?: string; case?: CaseDetail };
          if (s.status === "running") { setFetchMsg(`Searching… (${attempts * 3}s)`); return; }
          if (pollRef.current) clearInterval(pollRef.current);
          setFetching(false); setFetchMsg("");
          if (s.status === "done") {
            const result = s.result;
            if (result?.updated) { toast(`✓ ${result.message}`, "success"); }
            else { toast(result?.message ?? "No update", "error"); }
            if (s.case) { setDetail(s.case); } else { load(); }
            setOrdersRefresh((n) => n + 1);
          } else if (s.status === "error") {
            toast(`Fetch error: ${s.message}`, "error");
          } else { toast("Fetch complete", "success"); load(); }
        } catch (e) {
          if (pollRef.current) clearInterval(pollRef.current);
          setFetching(false); setFetchMsg("");
          toast(`Polling error: ${(e as Error).message}`, "error");
        }
        if (attempts >= maxAttempts) {
          if (pollRef.current) clearInterval(pollRef.current);
          setFetching(false); setFetchMsg("");
          toast("Fetch timed out after 60s — case may not be listed this week", "error");
        }
      }, 3000);
    } catch (e) {
      setFetching(false); setFetchMsg("");
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="drawer-header">
          <div>
            <span className="court-tag">{detail?.court ?? "Delhi HC"}</span>
            <div style={{ marginTop: 8, fontSize: 15, fontWeight: 700 }}>{detail?.case_no ?? "…"}</div>
            {detail && (
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <span className={`badge badge-${detail.status === "Pending" ? "pending" : "decided"}`}>
                  <span className="badge-dot"/>{detail.status}
                </span>
                {detail.client_name && (
                  <span className="badge" style={{ background: "#ede9fe", color: "#5b21b6" }}>
                    {I.clients} {detail.client_name}
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="fetch-btn" onClick={liveRefresh} disabled={fetching}>
              {I.refresh} {fetching ? (fetchMsg || "Fetching…") : "Fetch Live"}
            </button>
            <button className="fetch-btn" style={{ background: "var(--navy,#0f1f3d)", color: "#fff" }}
              onClick={async () => {
                try {
                  await api(`/cases/${id}/orders/download`, { method: "POST" });
                  toast("Downloading orders in background…");
                } catch (e) { toast((e as Error).message, "error"); }
              }}>
              {I.download} Get Orders
            </button>
            <button className="close-btn" onClick={onClose}>{I.x}</button>
          </div>
        </div>

        {!detail && <div className="state-box"><p>Loading…</p></div>}
        {detail && (
          <div className="drawer-body">
            {/* Hearing dates */}
            <div>
              <div className="section-title">Hearing Dates</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ background: isUpcoming(detail.next_hearing_date) ? "var(--accent-light)" : "var(--bg)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--accent)" }}>Next Hearing</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)", marginTop: 4 }}>{fmt(detail.next_hearing_date, true)}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{detail.next_hearing_date ? new Date(detail.next_hearing_date).getFullYear() : "—"}</div>
                </div>
                <div style={{ background: "var(--bg)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>Last Heard</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>{fmt(detail.last_hearing_date, true)}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{detail.last_hearing_date ? new Date(detail.last_hearing_date).getFullYear() : "—"}</div>
                </div>
              </div>
            </div>

            {/* Case info */}
            <div>
              <div className="section-title">Case Info</div>
              {([
                ["Case No.", <span key="cno" style={{ fontFamily: "monospace" }}>{detail.case_no}</span>],
                ["CNR No.", detail.cnr_number
                  ? <span key="cnr" style={{ fontFamily: "monospace", color: "var(--accent)", fontWeight: 600 }}>{detail.cnr_number}</span>
                  : <span key="cnr-empty" style={{ color: "var(--text-muted)", fontSize: 11 }}>Fetch Live to retrieve</span>],
                ["Court", detail.court ?? "—"],
                ["Type", detail.case_type ?? "—"],
                ["Filing Date", fmt(detail.filing_date)],
                ["Status", <span key="st" className={`badge badge-${detail.status === "Pending" ? "pending" : "decided"}`}><span className="badge-dot"/>{detail.status}</span>],
              ] as [string, React.ReactNode][]).map(([l, v]) => (
                <div key={l} className="detail-row">
                  <span className="detail-label">{l}</span>
                  <span className="detail-value">{v}</span>
                </div>
              ))}
            </div>

            {/* Parties */}
            {detail.parties.length > 0 && (
              <div>
                <div className="section-title">Parties</div>
                {detail.parties.map(p => (
                  <div key={p.id} className="party-chip">
                    <span className={p.role === "petitioner" ? "chip-pet" : "chip-resp"}>
                      {p.role === "petitioner" ? "PET" : "RESP"}
                    </span>
                    {p.name}
                  </div>
                ))}
              </div>
            )}

            {/* Hearing history */}
            {detail.hearings.length > 0 && (
              <div>
                <div className="section-title">Listing ({detail.hearings.length})</div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--bg)" }}>
                        <th style={{ padding: "7px 10px", fontSize: 11, fontWeight: 600, textAlign: "left", color: "var(--text-secondary)", width: 32 }}>#</th>
                        <th style={{ padding: "7px 10px", fontSize: 11, fontWeight: 600, textAlign: "left", color: "var(--text-secondary)", width: 110 }}>Date</th>
                        <th style={{ padding: "7px 10px", fontSize: 11, fontWeight: 600, textAlign: "left", color: "var(--text-secondary)" }}>Listing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...detail.hearings]
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((h, i) => (
                          <tr key={h.id} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-muted)" }}>{i + 1}</td>
                            <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "var(--accent)", whiteSpace: "nowrap" }}>
                              {fmtDDMMYYYY(h.date)}
                            </td>
                            <td style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4 }}>{h.purpose}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Billing */}
            {(detail.billing?.length ?? 0) > 0 && (
              <div>
                <div className="section-title">Billing Entries</div>
                {(detail.billing ?? []).map(b => (
                  <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{b.description}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmt(b.entry_date)} · {b.entry_type}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{rupees(b.amount)}</div>
                      <span className={`badge ${b.is_billed ? "badge-paid" : "badge-draft"}`} style={{ fontSize: 10 }}>
                        {b.is_billed ? "Billed" : "Unbilled"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Orders & Judgments */}
            <div>
              <div className="section-title">Orders & Judgments</div>
              <OrdersTab caseId={id} court={detail.court} toast={toast} refreshKey={ordersRefresh} />
            </div>

            <div style={{ fontSize: 11, color: "var(--text-muted)", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              Last synced: {fmt(detail.updated_at)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── OrdersTab component ──────────────────────────────────────────────────────
function OrdersTab({ caseId, court, toast, refreshKey }: { caseId: string; court?: string | null; toast: (m: string, t?: "success" | "error") => void; refreshKey: number }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadDate, setUploadDate] = useState("");
  const [uploadType, setUploadType] = useState("Order");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;

    const load = async () => {
      try {
        const rows = await api(`/cases/${caseId}/orders`) as Order[];
        if (cancelled) return;
        setOrders(rows);
        const stillWaiting = rows.length === 0 || tries < 8;
        if (stillWaiting && tries < 40) {
          tries += 1;
          timer = setTimeout(load, 4000);
        }
      } catch {
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [caseId, refreshKey]);

  const triggerDownload = async () => {
    setDownloading(true);
    try {
      const started = await api(`/cases/${caseId}/orders/download`, { method: "POST" }) as { message?: string };
      toast(started.message ?? "Downloading order PDFs…");
      for (let i = 0; i < 8; i++) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        const rows = await api(`/cases/${caseId}/orders`) as Order[];
        setOrders(rows);
        if (rows.some((row) => row.local_path)) break;
      }
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setDownloading(false); }
  };

  const openUpload = (date?: string) => {
    const iso = date ? date.slice(0, 10) : "";
    setUploadDate(iso);
    setUploadType("Order");
    setUploadFile(null);
    setShowUpload(true);
  };

  const submitUpload = async () => {
    if (!uploadDate) { toast("Choose the order date", "error"); return; }
    if (!uploadFile) { toast("Choose a PDF", "error"); return; }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", uploadFile);
      body.append("order_date", uploadDate);
      body.append("order_type", uploadType);
      const r = await fetch(`${API_BASE}/cases/${caseId}/orders/upload`, { method: "POST", body });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${r.status}`);
      const rows = await api(`/cases/${caseId}/orders`) as Order[];
      setOrders(rows);
      setShowUpload(false);
      toast("PDF uploaded");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setUploading(false); }
  };

  const typeBadge = (type: string) => {
    const map: Record<string, [string, string]> = {
      "Judgment": ["#ede9fe", "#5b21b6"],
      "Final Order": ["#dbeafe", "#1e40af"],
      "Interim Order": ["#fef9c3", "#854d0e"],
      "Notice": ["#fee2e2", "#b91c1c"],
    };
    const [bg, color] = map[type] ?? ["#f1f5f9", "#475569"];
    return <span style={{ background: bg, color, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>{type}</span>;
  };

  if (loading) return <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading orders…</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{orders.length} order{orders.length !== 1 ? "s" : ""}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-primary btn-sm" onClick={() => openUpload()}>Upload PDF</button>
          <button className="btn btn-secondary btn-sm" onClick={triggerDownload} disabled={downloading}>
            {I.download} {downloading ? "…" : "Download PDFs"}
          </button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
        {/delhi high court/i.test(court ?? "")
          ? "Delhi High Court PDFs download automatically. If a file is missing, upload it here."
          : "Published order PDFs download with Fetch Live. If a file is missing, upload it here."}
      </div>
      {showUpload && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Upload order PDF</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input className="form-input" type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)} />
            <select className="form-select" value={uploadType} onChange={e => setUploadType(e.target.value)}>
              <option>Order</option>
              <option>Judgment</option>
              <option>Final Order</option>
              <option>Interim Order</option>
              <option>Notice</option>
            </select>
          </div>
          <input style={{ marginTop: 8, fontSize: 12 }} type="file" accept="application/pdf,.pdf" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={submitUpload} disabled={uploading}>{uploading ? "Uploading…" : "Save PDF"}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowUpload(false)}>Cancel</button>
          </div>
        </div>
      )}
      {orders.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 16px", background: "var(--bg)", borderRadius: 8 }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📄</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>No orders yet</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>No PDF is saved yet. Fetch Live again, or upload the file.</div>
          <button className="btn btn-primary btn-sm" onClick={() => openUpload()}>Upload PDF</button>
        </div>
      ) : orders.map(o => (
        <div key={o.id} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 8, borderLeft: "3px solid var(--saffron,#E8600A)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: o.text_preview ? 6 : 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>
                {new Date(o.order_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
              {typeBadge(o.order_type)}
              {o.source === "manual" && <span style={{ fontSize: 10, fontWeight: 700, color: "#166534" }}>Uploaded</span>}
              {o.court_no && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{o.court_no}</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {o.local_path ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPreviewUrl(`${API_BASE}/documents/${o.local_path}`)}>
                  Open PDF
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => openUpload(o.order_date)}>
                  Upload PDF
                </button>
              )}
            </div>
          </div>
          {o.text_preview && <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, background: "var(--bg)", borderRadius: 5, padding: "5px 8px", maxHeight: 55, overflow: "hidden" }}>{o.text_preview.replace(/\s+/g, " ").trim().substring(0, 180)}…</div>}
          {o.file_size && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>{(o.file_size / 1024).toFixed(0)} KB</div>}
        </div>
      ))}
      {previewUrl && (
        <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Order PDF</span>
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600 }}>Open in new tab</a>
          </div>
          <iframe title="Order PDF" src={previewUrl} style={{ width: "100%", height: 520, border: 0 }} />
        </div>
      )}
    </div>
  );
}

// ─── Add Client Modal ─────────────────────────────────────────────────────────
function AddClientModal({ onClose, onDone }: { onClose: () => void; onDone: (c: Client) => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [showEmailHint, setShowEmailHint] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr("");
    try {
      const c = await api("/clients", { method: "POST", body: JSON.stringify(form) }) as Client;
      if (form.email) { setShowEmailHint(true); }
      onDone(c);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Add New Client</span>
          <button className="close-btn" onClick={onClose}>{I.x}</button>
        </div>
        <div className="modal-body">
          {err && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{err}</div>}
          {showEmailHint && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#166534", display: "flex", alignItems: "center", gap: 8 }}>
              {I.check} Client saved! Email will be used for automatic hearing reminders.
            </div>
          )}
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Client Name *</label>
              <input className="form-input" placeholder="e.g. Rakesh Gupta" value={form.name} onChange={set("name")} />
            </div>
            <div className="form-group">
              <label className="form-label">Company / Firm</label>
              <input className="form-input" placeholder="e.g. Gupta Industries Ltd" value={form.company} onChange={set("company")} />
            </div>
            <div className="form-group">
              <label className="form-label">Email (for hearing reminders)</label>
              <input className="form-input" type="email" placeholder="client@example.com" value={form.email} onChange={set("email")} />
              <span className="form-hint">We&apos;ll send automatic hearing date alerts to this address</span>
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" placeholder="9876543210" value={form.phone} onChange={set("phone")} />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" placeholder="Any notes about this client…" value={form.notes} onChange={set("notes")} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Add Client"}</button>
        </div>
      </div>
    </div>
  );
}

const COURTS = [
  "Supreme Court of India",
  "Delhi High Court",
  "Allahabad High Court",
  "Andhra Pradesh High Court",
  "Bombay High Court",
  "Calcutta High Court",
  "Chhattisgarh High Court",
  "Gauhati High Court",
  "Gujarat High Court",
  "Himachal Pradesh High Court",
  "High Court of Jammu & Kashmir and Ladakh",
  "Jharkhand High Court",
  "Karnataka High Court",
  "Kerala High Court",
  "Madhya Pradesh High Court",
  "Madras High Court",
  "Manipur High Court",
  "Meghalaya High Court",
  "Orissa High Court",
  "Patna High Court",
  "Punjab and Haryana High Court",
  "Rajasthan High Court",
  "Sikkim High Court",
  "Telangana High Court",
  "Tripura High Court",
  "Uttarakhand High Court",
  "District Court (eCourts)",
  "NCLT",
  "NCLAT",
  "NCDRC",
  "ITAT",
  "CAT",
  "DRT / DRAT",
  "Other",
];

// Map court display name to court_id for API
const COURT_ID_MAP: Record<string, string> = {
  // High Courts
  "Supreme Court of India": "supreme_court",
  "Delhi High Court": "delhi_hc",
  "Bombay High Court": "bombay_hc",
  "Madras High Court": "madras_hc",
  "Calcutta High Court": "kolkata_hc",
  "Chennai High Court": "chennai_hc",
  "Punjab High Court": "punjab_hc",
  "Gujarat High Court": "gujarat_hc",
  "Rajasthan High Court": "rajasthan_hc",
  "Kerala High Court": "kerala_hc",
  "Maharashtra High Court": "maharashtra_hc",
  "Allahabad High Court": "allahabad_hc",
  "Jharkhand High Court": "jharkhand_hc",
  "Orissa High Court": "orissa_hc",
  "Telangana High Court": "telangana_hc",
  "Guwahati High Court": "guwahati_hc",
  "Uttarakhand High Court": "uttarakhand_hc",
  "Jammu & Kashmir High Court": "jk_hc",
  "Himachal Pradesh High Court": "himachal_hc",
  "Chhattisgarh High Court": "chhattisgarh_hc",
  "Bihar High Court": "bihar_hc",
  "Madhya Pradesh High Court": "mp_hc",
  
  // District Courts
  "District Court (eCourts)": "district",
  
  // Tribunals
  "NCLT": "nclt",
  "NCLAT": "nclat",
  "NCDRC": "ncdrc",
  "ITAT": "itat",
  "CAT": "cat",
  "DRT / DRAT": "drt",
};

// ─── Add Case Modal ───────────────────────────────────────────────────────────
function AddCaseModal({ clients, onClose, onDone }: { clients: Client[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ case_no: "", cnr_number: "", client_id: "", court: "Delhi High Court", court_id: "delhi_hc", case_type: "", filing_date: "", other_court: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    const newForm = { ...form, [k]: value };
    // Update court_id when court changes
    if (k === "court" && COURT_ID_MAP[value]) {
      newForm.court_id = COURT_ID_MAP[value];
    }
    setForm(newForm);
  };
  const liveCourt = form.court === "Delhi High Court";

  const save = async () => {
    if (!form.case_no.trim()) { setErr("Case number is required"); return; }
    const court = form.court === "Other" ? form.other_court.trim() : form.court;
    const court_id = form.court === "Other" ? "other" : form.court_id;
    if (!court) { setErr("Court name is required"); return; }
    setSaving(true); setErr("");
    try {
      await api("/cases", { method: "POST", body: JSON.stringify({ ...form, court, court_id }) });
      onDone();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Add / Track a Case</span>
          <button className="close-btn" onClick={onClose}>{I.x}</button>
        </div>
        <div className="modal-body">
          {err && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{err}</div>}
          <div style={{ background: "var(--accent-light)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "var(--accent)" }}>
            {liveCourt
              ? <>{I.refresh} Delhi High Court cases can be fetched live. Open the case and click <strong>Fetch Live</strong>.</>
              : <>This court is stored on the case. Live download is only available for Delhi High Court. Upload order PDFs yourself when the court site has none.</>}
          </div>
          <div className="form-grid form-grid-2">
            <div className="form-group" style={{ gridColumn: "1/-1" }}>
              <label className="form-label">Case Number *</label>
              <input className="form-input" placeholder="e.g. W.P.(C)-13107/2026 or BAIL APPLN.-898/2026" value={form.case_no} onChange={set("case_no")} />
              <span className="form-hint">Exactly as it appears on the court website</span>
            </div>
            <div className="form-group">
              <label className="form-label">CNR Number</label>
              <input className="form-input" placeholder="e.g. DLHC01-000123-2025" value={form.cnr_number} onChange={set("cnr_number")} />
              <span className="form-hint">16-char CNR from eCourts portal</span>
            </div>
            <div className="form-group">
              <label className="form-label">Court</label>
              <select className="form-select" value={form.court} onChange={set("court")}>
                {COURTS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {form.court === "Other" && (
              <div className="form-group">
                <label className="form-label">Court name</label>
                <input className="form-input" placeholder="e.g. Saket District Court" value={form.other_court} onChange={set("other_court")} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Link to Client</label>
              <select className="form-select" value={form.client_id} onChange={set("client_id")}>
                <option value="">— Select client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ""}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Filing Date</label>
              <input className="form-input" type="date" value={form.filing_date} onChange={set("filing_date")} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Add Case"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice Viewer (Redesigned) ──────────────────────────────────────────────
function InvoiceViewer({ inv, onClose, onStatusChange }: {
  inv: Invoice; onClose: () => void;
  onStatusChange?: (id: string, status: string) => void;
}) {
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const statusColor: Record<string, string> = {
    draft: "badge-draft", sent: "badge-sent", paid: "badge-paid", overdue: "badge-overdue", cancelled: "badge-cancelled"
  };

  const markAs = async (status: string) => {
    setUpdatingStatus(true);
    try {
      await api(`/billing/invoices/${inv.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      onStatusChange?.(inv.id, status);
    } catch { /* swallow */ }
    finally { setUpdatingStatus(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      {/* Print styles */}
      <style>{`@media print { .no-print { display: none !important; } .modal-overlay { position: static !important; background: none !important; padding: 0 !important; } .modal { box-shadow: none !important; max-width: 100% !important; } }`}</style>
      <div className="modal" style={{ maxWidth: 600, background: "#fff" }}>
        {/* Invoice top bar */}
        <div style={{ padding: "22px 24px 16px", borderBottom: "2px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="32" height="32" viewBox="0 0 26 26" fill="none">
              <rect width="26" height="26" rx="7" fill="#2563eb"/>
              <path d="M6 19L13 6L20 19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M9 15h8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f1f3d" }}>LegalTrack</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Tax Invoice</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>{inv.invoice_number}</div>
            <span className={`badge ${statusColor[inv.status] ?? "badge-draft"}`} style={{ marginTop: 4 }}>{inv.status.toUpperCase()}</span>
          </div>
        </div>

        <div style={{ padding: "18px 24px" }}>
          {/* Two-column: Bill To + Invoice Details */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.08em", marginBottom: 6 }}>Bill To</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{inv.client_name ?? "—"}</div>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.08em", marginBottom: 6 }}>Invoice Details</div>
              {[["Invoice #", inv.invoice_number], ["Issue Date", fmt(inv.issue_date)], ["Due Date", fmt(inv.due_date)]].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: "var(--text-secondary)" }}>{l}</span>
                  <span style={{ fontWeight: 600, fontFamily: l === "Invoice #" ? "monospace" : "inherit" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Case reference */}
          {inv.case_no && (
            <div style={{ background: "var(--accent-light)", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--accent)", letterSpacing: "0.06em", marginBottom: 4 }}>Case Reference</div>
              <span className="case-no">{inv.case_no}</span>
              {inv.case_title && <span style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: 8 }}>{inv.case_title}</span>}
            </div>
          )}

          {/* Line items */}
          {inv.items && inv.items.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ textAlign: "left", padding: "9px 14px", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Description</th>
                    <th style={{ textAlign: "right", padding: "9px 14px", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.items.map(item => (
                    <tr key={item.id} style={{ borderTop: "1px solid var(--border)", cursor: "default" }}>
                      <td style={{ padding: "10px 14px", fontSize: 13 }}>{item.description}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, textAlign: "right" }}>{rupees(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div style={{ borderTop: "2px solid var(--border)", paddingTop: 14, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 7 }}>
              <span style={{ color: "var(--text-secondary)" }}>Subtotal</span>
              <span>{rupees(inv.subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 10 }}>
              <span style={{ color: "var(--text-secondary)" }}>GST ({inv.tax_pct}%)</span>
              <span>{rupees(inv.tax_amount)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f1f3d", borderRadius: 8, padding: "12px 16px" }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>Total</span>
              <span style={{ fontWeight: 800, fontSize: 22, color: "#7ca9f5" }}>{rupees(inv.total)}</span>
            </div>
          </div>

          {/* AI Summary */}
          {inv.ai_summary && (
            <div style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", border: "1px solid #86efac", borderRadius: 8, padding: "12px 16px", marginBottom: 12 }}>
              <div className="inv-ai-label">{I.ai} AI-Generated Work Summary</div>
              <div style={{ fontSize: 13, color: "#166534", lineHeight: 1.6, marginTop: 6 }}>{inv.ai_summary}</div>
            </div>
          )}

          {/* Predicted next hearing */}
          {inv.predicted_next_hearing && (
            <div className="predict-box">
              <div className="predict-label">🔮 AI-Predicted Next Hearing</div>
              <div className="predict-date">{fmt(inv.predicted_next_hearing)}</div>
              <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>Based on historical hearing frequency pattern</div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="modal-footer no-print" style={{ gap: 8, flexWrap: "wrap" }}>
          {inv.status === "draft" && (
            <button className="btn btn-secondary btn-sm" onClick={() => markAs("sent")} disabled={updatingStatus}>
              {I.send} Mark Sent
            </button>
          )}
          {(inv.status === "draft" || inv.status === "sent") && (
            <button className="btn btn-secondary btn-sm" style={{ background: "#f0fdf4", color: "#166534" }} onClick={() => markAs("paid")} disabled={updatingStatus}>
              {I.check} Mark Paid
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>
            {I.print} Print
          </button>
          <button className="btn btn-primary btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Link Case Modal ──────────────────────────────────────────────────────────
function LinkCaseModal({ clientId, clientName, allCases, onClose, onDone, toast }: {
  clientId: string; clientName: string; allCases: CaseRow[];
  onClose: () => void; onDone: () => void;
  toast: (m: string, t?: "success" | "error") => void;
}) {
  const [query, setQuery] = useState("");
  const [court, setCourt] = useState("delhi_hc");
  const [mode, setMode] = useState<"search" | "add-new">("search");
  const [saving, setSaving] = useState(false);
  const [lookupResult, setLookupResult] = useState<{
    case: CaseRow & { parties: Party[]; hearings: Hearing[] };
    lookup_info: { court: string; court_code: string; fetch_note: string; source: string; already_existed: boolean };
  } | null>(null);
  const [looking, setLooking] = useState(false);

  const matches = query.trim().length > 1
    ? allCases.filter(c => c.case_no.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];
  const exactMatch = allCases.find(c => c.case_no.toLowerCase() === query.trim().toLowerCase());

  const linkExisting = async (caseId: string) => {
    setSaving(true);
    try {
      await api(`/clients/${clientId}/link-case`, { method: "POST", body: JSON.stringify({ case_id: caseId }) });
      onDone();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSaving(false); }
  };

  const doLookup = async () => {
    if (!query.trim()) { toast("Enter a case number", "error"); return; }
    if (!court) { toast("Select a court", "error"); return; }
    setLooking(true); setLookupResult(null);
    try {
      const result = await api("/cases/lookup", { 
        method: "POST", 
        body: JSON.stringify({ case_no: query.trim(), client_id: clientId, court_id: court }) 
      });
      setLookupResult(result);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setLooking(false); }
  };

  const courtBadgeColor: Record<string, string> = { delhi_hc: "#dbeafe", supreme_court: "#fce7f3", district: "#dcfce7", nclt: "#fef9c3", other: "#f1f5f9" };
  const courtTextColor: Record<string, string> = { delhi_hc: "#1e40af", supreme_court: "#9d174d", district: "#166534", nclt: "#854d0e", other: "#475569" };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Add & Track Case</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Client: <strong>{clientName}</strong></div>
          </div>
          <button className="close-btn" onClick={onClose}>{I.x}</button>
        </div>
        <div className="modal-body">
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
            {(["search", "add-new"] as const).map((k) => (
              <button key={k} onClick={() => { setMode(k); setLookupResult(null); }} style={{
                padding: "8px 14px", border: "none", background: "none", cursor: "pointer",
                fontSize: 13, fontWeight: mode === k ? 700 : 500,
                color: mode === k ? "var(--accent)" : "var(--text-secondary)",
                borderBottom: mode === k ? "2px solid var(--accent)" : "2px solid transparent",
              }}>{k === "search" ? "Find Existing" : "Add by Case Number"}</button>
            ))}
          </div>
          {mode === "search" ? (
            <>
              <div className="form-group">
                <label className="form-label">Search by Case Number</label>
                <div className="search-box" style={{ height: 38 }}>
                  {I.search}
                  <input className="search-input" placeholder="e.g. W.P.(C), CRL.M.C., BAIL APPLN…"
                    value={query} onChange={e => setQuery(e.target.value)} autoFocus />
                </div>
              </div>
              {query.trim().length > 1 && (
                <div style={{ marginTop: 8, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  {matches.length === 0 ? (
                    <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--text-secondary)" }}>
                      Not in system yet.{" "}
                      <button onClick={() => setMode("add-new")} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                        Add &quot;{query.trim()}&quot; →
                      </button>
                    </div>
                  ) : matches.map((c, i) => (
                    <div key={c.id} onClick={() => linkExisting(c.id)} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                      cursor: "pointer", borderBottom: i < matches.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-light)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "")}>
                      <div style={{ flex: 1 }}>
                        <div className="case-no">{c.case_no}</div>
                        {c.case_title && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>{c.case_title.slice(0, 55)}</div>}
                      </div>
                      {c.client_id
                        ? <span style={{ fontSize: 10, color: "#92400e", background: "#fef3c7", padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>Linked</span>
                        : <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>Link →</span>}
                    </div>
                  ))}
                </div>
              )}
              {query.trim().length <= 1 && <div style={{ padding: "16px 0", color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>Type 2+ characters to search</div>}
            </>
          ) : (
            <>
              {lookupResult && (
                <div style={{ marginBottom: 16, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", background: courtBadgeColor[lookupResult.lookup_info.court_code] ?? "#f1f5f9", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: courtTextColor[lookupResult.lookup_info.court_code] ?? "#475569" }}>
                          {lookupResult.lookup_info.court}
                        </span>
                        <div className="case-no" style={{ marginTop: 4, fontSize: 14 }}>{lookupResult.case.case_no}</div>
                      </div>
                      <span className={`badge badge-${lookupResult.case.status === "Pending" ? "pending" : "decided"}`}>
                        <span className="badge-dot"/>{lookupResult.case.status}
                      </span>
                    </div>
                    {lookupResult.case.case_title && lookupResult.case.case_title !== lookupResult.case.case_no && (
                      <div style={{ fontSize: 12, marginTop: 6, color: courtTextColor[lookupResult.lookup_info.court_code] ?? "#475569", opacity: 0.8 }}>
                        {lookupResult.case.case_title}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: "10px 16px" }}>
                    {lookupResult.case.parties.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        {lookupResult.case.parties.map(p => (
                          <div key={p.id} className="party-chip" style={{ marginBottom: 3 }}>
                            <span className={p.role === "petitioner" ? "chip-pet" : "chip-resp"}>
                              {p.role === "petitioner" ? "PET" : "RESP"}
                            </span>
                            {p.name}
                          </div>
                        ))}
                      </div>
                    )}
                    {lookupResult.case.next_hearing_date && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
                        {I.calendar} Next hearing: {fmt(lookupResult.case.next_hearing_date)}
                      </div>
                    )}
                    <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--bg)", borderRadius: 7, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {lookupResult.lookup_info.fetch_note}
                    </div>
                  </div>
                </div>
              )}
              {!lookupResult && (
                <>
                  <div style={{ background: "var(--accent-light)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "var(--accent)", lineHeight: 1.5 }}>
                    {I.search} Enter the case number. The system will:<br/>
                    • Fetch data from the selected court<br/>
                    • Extract party names, status, and next hearing date<br/>
                    • Save and link the case to <strong>{clientName}</strong>
                  </div>
                  <div className="form-grid" style={{ marginBottom: 6 }}>
                    <div className="form-group">
                      <label className="form-label">Court *</label>
                      <select className="form-select" value={court} onChange={e => setCourt(e.target.value)}>
                        <optgroup label="Supreme Court">
                          <option value="supreme_court">Supreme Court of India</option>
                        </optgroup>
                        <optgroup label="High Courts">
                          <option value="delhi_hc">Delhi High Court</option>
                          <option value="bombay_hc">Bombay High Court</option>
                          <option value="madras_hc">Madras High Court</option>
                          <option value="calcutta_hc">Calcutta High Court</option>
                          <option value="allahabad_hc">Allahabad High Court</option>
                          <option value="punjab_hc">Punjab & Haryana High Court</option>
                          <option value="rajasthan_hc">Rajasthan High Court</option>
                          <option value="gujrat_hc">Gujarat High Court</option>
                          <option value="karnataka_hc">Karnataka High Court</option>
                          <option value="kerala_hc">Kerala High Court</option>
                          <option value="telangana_hc">Telangana High Court</option>
                          <option value="andhra_hc">Andhra Pradesh High Court</option>
                          <option value="chhattisgarh_hc">Chhattisgarh High Court</option>
                          <option value="jharkhand_hc">Jharkhand High Court</option>
                          <option value="himachal_hc">Himachal Pradesh High Court</option>
                          <option value="uttarakhand_hc">Uttarakhand High Court</option>
                          <option value="madhya_pradesh_hc">Madhya Pradesh High Court</option>
                          <option value="odisha_hc">Odisha High Court</option>
                        </optgroup>
                        <optgroup label="District Courts">
                          <option value="district">District Courts (CNR-based)</option>
                        </optgroup>
                      </select>
                      <span className="form-hint">Select the court where case is filed</span>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Case Number *</label>
                      <input className="form-input" autoFocus
                        placeholder="e.g. CRL.M.C. 2415/2023 or W.P.(C)-13107/2026"
                        value={query} onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && doLookup()} />
                      <span className="form-hint">Exactly as it appears on the court website</span>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {mode === "add-new" && !lookupResult && (
            <button className="btn btn-primary" onClick={doLookup} disabled={looking || !query.trim() || !court}>


              {looking ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>
                  Fetching from court…
                </span>
              ) : "Fetch & Add Case"}
            </button>
          )}
          {mode === "add-new" && lookupResult && (
            <button className="btn btn-primary" onClick={onDone}>✓ Done — Case Added & Linked</button>
          )}
          {mode === "search" && exactMatch && !exactMatch.client_id && (
            <button className="btn btn-primary" onClick={() => linkExisting(exactMatch.id)} disabled={saving}>
              {saving ? "Linking…" : "Link Case"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: Dashboard
// ═══════════════════════════════════════════════════════════════════════════════
interface UpcomingReminder {
  case_no: string; client_name: string | null; next_hearing_date: string; client_email: string | null;
}
interface NotifStatus { total: number; email_configured: boolean; upcoming: UpcomingReminder[]; }

function DashboardPage({ clients, allCases, invoices, onSelect, onNav, toast }: {
  clients: Client[]; allCases: CaseRow[]; invoices: Invoice[];
  onSelect: (id: string) => void; onNav: (p: Page) => void;
  toast: (m: string, t?: "success" | "error") => void;
}) {
  const [notifStatus, setNotifStatus] = useState<NotifStatus | null>(null);
  const [sendingReminders, setSendingReminders] = useState(false);

  useEffect(() => {
    api("/notifications/upcoming")
      .then((r: NotifStatus) => setNotifStatus(r))
      .catch(() => {});
  }, []);

  const todayHearings = allCases.filter(c => isToday(c.next_hearing_date));
  const weekHearings = allCases.filter(c => isThisWeek(c.next_hearing_date))
    .sort((a, b) => new Date(a.next_hearing_date!).getTime() - new Date(b.next_hearing_date!).getTime());
  const recentCases = [...allCases].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5);
  const unpaidInvoices = invoices.filter(i => i.status === "sent" || i.status === "overdue").length;

  const sendReminders = async () => {
    setSendingReminders(true);
    try {
      const r = await api("/notifications/send-reminders", { method: "POST" }) as { ok: boolean; message: string };
      toast(r.message, r.ok ? "success" : "error");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSendingReminders(false); }
  };

  return (
    <>
      {/* Notification banner */}
      {notifStatus && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
          padding: "10px 16px", borderRadius: 8, marginBottom: 18,
          background: notifStatus.email_configured ? "#f0fdf4" : "#fff7ed",
          border: `1px solid ${notifStatus.email_configured ? "#bbf7d0" : "#fed7aa"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            {I.bell}
            <span style={{ color: notifStatus.email_configured ? "#166534" : "#92400e", fontWeight: 500 }}>
              {notifStatus.email_configured
                ? `Email notifications active — ${notifStatus.total} upcoming hearing${notifStatus.total !== 1 ? "s" : ""} will be reminded`
                : "Email notifications not configured — add SMTP settings to send hearing reminders"}
            </span>
          </div>
          {notifStatus.email_configured && notifStatus.total > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={sendReminders} disabled={sendingReminders}>
              {I.send} {sendingReminders ? "Sending…" : "Send Reminders Now"}
            </button>
          )}
          {!notifStatus.email_configured && (
            <button className="btn btn-secondary btn-sm" onClick={() => onNav("settings")}>
              Configure →
            </button>
          )}
        </div>
      )}

      {/* Quick stats */}
      <div className="stats">
        {[
          { label: "Total Cases", value: allCases.length, sub: "in system", color: "var(--accent-light)", icon: I.cases },
          { label: "Upcoming Hearings", value: weekHearings.length, sub: "this week", color: "#fef9c3", icon: I.calendar },
          { label: "Active Clients", value: clients.length, sub: "registered", color: "#e0e7ff", icon: I.clients },
          { label: "Unpaid Invoices", value: unpaidInvoices, sub: "awaiting payment", color: unpaidInvoices > 0 ? "#fee2e2" : "#dcfce7", icon: I.billing },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-icon" style={{ background: s.color }}>{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: typeof s.value === "string" ? 18 : 26 }}>{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Quick actions strip */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => onNav("cases")}>
          {I.plus} Add New Case
        </button>
        <button className="btn btn-secondary" onClick={() => onNav("clients")}>
          {I.plus} Add Client
        </button>
        <button className="btn btn-secondary" onClick={() => onNav("billing")}>
          {I.ai} Generate Invoice
        </button>
        <button className="btn btn-secondary" onClick={sendReminders} disabled={sendingReminders}>
          {I.send} {sendingReminders ? "Sending…" : "Send Reminders"}
        </button>
      </div>

      {/* Today's hearings */}
      {todayHearings.length > 0 && (
        <div className="panel" style={{ marginBottom: 16, border: "2px solid #fca5a5" }}>
          <div className="panel-header" style={{ background: "#fef2f2" }}>
            <span className="panel-title" style={{ color: "#b91c1c" }}>📅 Today&apos;s Hearings — {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</span>
            <span className="badge" style={{ background: "#fee2e2", color: "#b91c1c" }}>{todayHearings.length} hearing{todayHearings.length !== 1 ? "s" : ""}</span>
          </div>
          {todayHearings.map(c => {
            const [pet] = splitTitle(c.case_title);
            return (
              <div key={c.id} onClick={() => onSelect(c.id)}
                style={{ display: "flex", gap: 14, padding: "12px 18px", borderBottom: "1px solid var(--border)", cursor: "pointer", alignItems: "center" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#fff5f5")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}>
                <div style={{ flex: 1 }}>
                  <div className="case-no" style={{ marginBottom: 2 }}>{c.case_no}</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{pet}</div>
                  {c.client_name && <div style={{ fontSize: 11, color: "var(--accent)" }}>{c.client_name}</div>}
                </div>
                <span className="court-tag">{c.court?.replace("Delhi High Court", "Delhi HC") ?? "—"}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* This week's hearings + Recent activity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* This week's hearings */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">This Week&apos;s Hearings</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("hearings")}>View all {I.arrow}</button>
          </div>
          {weekHearings.length === 0 ? (
            <div className="state-box" style={{ padding: 30 }}>{I.calendar}<p>No hearings this week</p></div>
          ) : (
            <div>
              {weekHearings.slice(0, 6).map(c => {
                const [pet] = splitTitle(c.case_title);
                const d = new Date(c.next_hearing_date!);
                const daysLeft = Math.ceil((d.getTime() - Date.now()) / 86400000);
                return (
                  <div key={c.id} onClick={() => onSelect(c.id)}
                    style={{ display: "flex", gap: 12, padding: "11px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f8f9fc")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}>
                    <div style={{ minWidth: 44, textAlign: "center", background: daysLeft === 0 ? "#fee2e2" : "var(--accent-light)", borderRadius: 8, padding: "6px 4px", flexShrink: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: daysLeft === 0 ? "#b91c1c" : "var(--accent)", lineHeight: 1 }}>
                        {d.toLocaleDateString("en-IN", { day: "2-digit" })}
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 600, color: daysLeft === 0 ? "#b91c1c" : "var(--accent)", textTransform: "uppercase" }}>
                        {d.toLocaleDateString("en-IN", { month: "short" })}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="case-no" style={{ marginBottom: 2 }}>{c.case_no}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pet}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                        {c.client_name && <span style={{ fontSize: 10, color: "var(--accent)" }}>{c.client_name}</span>}
                        <span className="court-tag" style={{ fontSize: 9 }}>{c.court?.replace("Delhi High Court", "Delhi HC") ?? "—"}</span>
                      </div>
                    </div>
                    {daysLeft === 0 && <span className="badge" style={{ background: "#fee2e2", color: "#b91c1c", alignSelf: "center", flexShrink: 0 }}>Today</span>}
                    {daysLeft === 1 && <span className="badge badge-pending" style={{ alignSelf: "center", flexShrink: 0 }}>Tomorrow</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Recent Activity</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("cases")}>All cases {I.arrow}</button>
          </div>
          {recentCases.length === 0 ? (
            <div className="state-box" style={{ padding: 30 }}>{I.file}<p>No cases yet</p></div>
          ) : (
            <div>
              {recentCases.map(c => {
                const [pet] = splitTitle(c.case_title);
                return (
                  <div key={c.id} onClick={() => onSelect(c.id)}
                    style={{ display: "flex", gap: 12, padding: "11px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer", alignItems: "center" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f8f9fc")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="case-no" style={{ marginBottom: 2, fontSize: 11 }}>{c.case_no}</div>
                      <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pet}</div>
                      {c.client_name && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.client_name}</div>}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <span className={`badge badge-${c.status === "Pending" ? "pending" : "decided"}`} style={{ fontSize: 10 }}>
                        <span className="badge-dot"/>{c.status}
                      </span>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>{fmt(c.updated_at, true)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: Clients
// ═══════════════════════════════════════════════════════════════════════════════
function ClientsPage({ clients, allCases, onRefresh, onSelect, toast }: {
  clients: Client[]; allCases: CaseRow[]; onRefresh: () => void;
  onSelect: (id: string) => void; toast: (m: string, t?: "success" | "error") => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [linkModal, setLinkModal] = useState<string | null>(null);

  return (
    <>
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Clients ({clients.length})</span>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>{I.plus} Add Client</button>
        </div>
        {clients.length === 0 ? (
          <div className="state-box">{I.file}<strong>No clients yet</strong><p>Add your first client to start tracking their cases</p></div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Name</th><th>Company</th><th>Contact</th><th>Cases</th><th>Outstanding</th><th></th></tr></thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id} style={{ cursor: "default" }}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="avatar" style={{ width: 30, height: 30, fontSize: 11, flexShrink: 0 }}>{c.name[0]}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                          {c.email && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{c.company ?? "—"}</td>
                    <td style={{ fontSize: 12 }}>{c.phone ?? "—"}</td>
                    <td><span className="badge badge-upcoming">{c.case_count} case{c.case_count !== 1 ? "s" : ""}</span></td>
                    <td style={{ fontWeight: 600 }}>
                      {parseFloat(c.outstanding) > 0
                        ? <span style={{ color: "#b91c1c" }}>{rupees(parseFloat(c.outstanding))}</span>
                        : <span style={{ color: "#166534" }}>Clear</span>}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => setLinkModal(c.id)}>Link Case</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {clients.map(c => {
        const clientCases = allCases.filter(ca => ca.client_id === c.id);
        if (!clientCases.length) return null;
        return (
          <div className="panel" key={c.id}>
            <div className="panel-header">
              <span className="panel-title">{c.name} — Cases</span>
              <span className="badge badge-upcoming">{clientCases.length}</span>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Case No.</th><th>Parties</th><th>Status</th><th>Next Hearing</th></tr></thead>
                <tbody>
                  {clientCases.map(ca => {
                    const [pet, resp] = splitTitle(ca.case_title);
                    return (
                      <tr key={ca.id} onClick={() => onSelect(ca.id)}>
                        <td><div className="case-no">{ca.case_no}</div><div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{ca.court}</div></td>
                        <td><div style={{ fontSize: 13, fontWeight: 500 }}>{pet}</div>{resp && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>v. {resp}</div>}</td>
                        <td><span className={`badge badge-${ca.status === "Pending" ? "pending" : "decided"}`}><span className="badge-dot"/>{ca.status}</span></td>
                        <td>{isUpcoming(ca.next_hearing_date)
                          ? <span className="badge badge-upcoming">{I.calendar} {fmt(ca.next_hearing_date)}</span>
                          : <span style={{ fontSize: 12 }}>{fmt(ca.next_hearing_date)}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {showAdd && (
        <AddClientModal
          onClose={() => setShowAdd(false)}
          onDone={c => { setShowAdd(false); onRefresh(); toast(`Client "${c.name}" added — email will be used for hearing reminders`); }}
        />
      )}
      {linkModal && (
        <LinkCaseModal
          clientId={linkModal}
          clientName={clients.find(c => c.id === linkModal)?.name ?? ""}
          allCases={allCases}
          onClose={() => setLinkModal(null)}
          onDone={() => { setLinkModal(null); onRefresh(); toast("Case linked successfully"); }}
          toast={toast}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: Cases
// ═══════════════════════════════════════════════════════════════════════════════
function CasesPage({ allCases, clients, onSelect, onRefresh, toast }: {
  allCases: CaseRow[]; clients: Client[]; onSelect: (id: string) => void;
  onRefresh: () => void; toast: (m: string, t?: "success" | "error") => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CaseRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState<"all" | "upcoming" | "no-client">("all");

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults(null); return; }
    setSearching(true);
    try {
      const r = await api(`/cases?query=${encodeURIComponent(q)}&limit=100`) as { cases: CaseRow[] };
      setResults(r.cases);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSearching(false); }
  }, [toast]);

  const display = results ?? allCases.filter(c => {
    if (tab === "upcoming") return isUpcoming(c.next_hearing_date);
    if (tab === "no-client") return !c.client_id;
    return true;
  });

  const tabCounts = {
    all: allCases.length,
    upcoming: allCases.filter(c => isUpcoming(c.next_hearing_date)).length,
    "no-client": allCases.filter(c => !c.client_id).length,
  };

  return (
    <>
      <div style={{ background: "#f8f9fc", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--accent)" }}>🔍 Look Up Case in Any Court</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Case Number</label>
            <input className="form-input" placeholder="e.g., W.P.(C)-5972/2022" value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search(query)} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Select Court</label>
            <select className="form-select" onChange={e => {
              if (e.target.value) {
                setQuery(e.target.value);
                setTimeout(() => search(e.target.value), 100);
              }
            }}>
              <option value="">—  Choose a court  —</option>
              <optgroup label="High Courts (21)">
                {["Delhi High Court", "Bombay High Court", "Madras High Court", "Calcutta High Court", "Chennai High Court", "Punjab High Court", "Gujarat High Court", "Rajasthan High Court", "Kerala High Court", "Maharashtra High Court", "Allahabad High Court", "Jharkhand High Court", "Orissa High Court", "Telangana High Court", "Guwahati High Court", "Uttarakhand High Court", "Jammu & Kashmir High Court", "Himachal Pradesh High Court", "Chhattisgarh High Court", "Bihar High Court", "Madhya Pradesh High Court"].map(c => <option key={c} value={c}>{c}</option>)}
              </optgroup>
              <optgroup label="District Courts">
                <option value="District Court (eCourts)">District Court (eCourts - 743+)</option>
              </optgroup>
              <optgroup label="Tribunals (7)">
                {["ITAT", "NCLT", "NCLAT", "NCDRC", "DRT", "CAT", "NGT"].map(c => <option key={c} value={c}>{c}</option>)}
              </optgroup>
            </select>
          </div>
          <button className="btn btn-primary" onClick={() => search(query)} disabled={searching} style={{ whiteSpace: "nowrap" }}>
            {I.search} {searching ? "Searching…" : "Search"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>✓ All 29 courts supported · Case lookup routing automatic</div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Cases</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div className="search-row">
              <div className="search-box">
                {I.search}
                <input className="search-input" placeholder="Search case no. or party name…" value={query}
                  onChange={e => { setQuery(e.target.value); if (!e.target.value) setResults(null); }}
                  onKeyDown={e => e.key === "Enter" && search(query)} />
              </div>
              <button className="btn btn-primary" onClick={() => search(query)} disabled={searching} style={{ whiteSpace: "nowrap" }}>
                {searching ? "…" : "Search"}
              </button>
            </div>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>{I.plus} Add Case</button>
          </div>
        </div>

        {!results && (
          <div className="tabs">
            {(["all", "upcoming", "no-client"] as const).map(t => (
              <button key={t} className={`tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
                {t === "all" ? "All" : t === "upcoming" ? "Upcoming" : "Unlinked"}
                <span className="tab-count">{tabCounts[t]}</span>
              </button>
            ))}
          </div>
        )}

      {results && <div className="result-meta">{results.length} result{results.length !== 1 ? "s" : ""} for &quot;{query}&quot;</div>}

      {display.length === 0 ? (
        <div className="state-box">{I.file}<strong>No cases</strong><p>Add cases or adjust your search</p></div>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Case No.</th><th>Parties</th><th>Client</th><th>Status</th><th>Next Hearing</th><th>Court</th></tr></thead>
            <tbody>
              {display.map(c => {
                const [pet, resp] = splitTitle(c.case_title);
                return (
                  <tr key={c.id} onClick={() => onSelect(c.id)}>
                    <td><div className="case-no">{c.case_no}</div>{c.case_year && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{c.case_year}</div>}</td>
                    <td><div style={{ fontSize: 13, fontWeight: 500 }}>{pet}</div>{resp && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>v. {resp}</div>}</td>
                    <td style={{ fontSize: 12 }}>{c.client_name ? <span style={{ color: "var(--accent)", fontWeight: 500 }}>{c.client_name}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                    <td><span className={`badge badge-${c.status === "Pending" ? "pending" : "decided"}`}><span className="badge-dot"/>{c.status}</span></td>
                    <td>{isUpcoming(c.next_hearing_date) ? <span className="badge badge-upcoming">{I.calendar} {fmt(c.next_hearing_date)}</span> : <span style={{ fontSize: 12 }}>{fmt(c.next_hearing_date)}</span>}</td>
                    <td><span className="court-tag">{c.court?.replace("Delhi High Court", "Delhi HC") ?? "—"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && <AddCaseModal clients={clients} onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); onRefresh(); toast("Case added — click Fetch Live to sync from court"); }} />}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: Hearings
// ═══════════════════════════════════════════════════════════════════════════════
function HearingsPage({ allCases, onSelect }: { allCases: CaseRow[]; onSelect: (id: string) => void }) {
  const upcoming = [...allCases].filter(c => isUpcoming(c.next_hearing_date))
    .sort((a, b) => new Date(a.next_hearing_date!).getTime() - new Date(b.next_hearing_date!).getTime());
  const past = [...allCases].filter(c => !isUpcoming(c.next_hearing_date) && c.next_hearing_date)
    .sort((a, b) => new Date(b.next_hearing_date!).getTime() - new Date(a.next_hearing_date!).getTime());

  const HCard = ({ c }: { c: CaseRow }) => {
    const [pet, resp] = splitTitle(c.case_title);
    const up = isUpcoming(c.next_hearing_date);
    const days = c.next_hearing_date ? Math.ceil((new Date(c.next_hearing_date).getTime() - Date.now()) / 86400000) : 999;
    return (
      <div onClick={() => onSelect(c.id)} style={{ display: "flex", gap: 14, padding: "14px 18px", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
        onMouseEnter={e => (e.currentTarget.style.background = "#f8f9fc")}
        onMouseLeave={e => (e.currentTarget.style.background = "")}>
        <div style={{ minWidth: 48, textAlign: "center", background: up ? "var(--accent-light)" : "var(--bg)", borderRadius: 8, padding: "8px 6px", flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: up ? "var(--accent)" : "var(--text-secondary)", lineHeight: 1 }}>
            {c.next_hearing_date ? new Date(c.next_hearing_date).toLocaleDateString("en-IN", { day: "2-digit" }) : "—"}
          </div>
          <div style={{ fontSize: 9, fontWeight: 600, color: up ? "var(--accent)" : "var(--text-muted)", textTransform: "uppercase" }}>
            {c.next_hearing_date ? new Date(c.next_hearing_date).toLocaleDateString("en-IN", { month: "short" }) : ""}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
            <span className="case-no" style={{ fontSize: 12 }}>{c.case_no}</span>
            {up && days <= 7 && <span className="badge" style={{ background: "#fef3c7", color: "#b45309", fontSize: 10 }}>{days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`}</span>}
            {c.client_name && <span style={{ fontSize: 11, color: "var(--accent)" }}>{c.client_name}</span>}
          </div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{pet}</div>
          {resp && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>v. {resp}</div>}
        </div>
        <span className={`badge badge-${c.status === "Pending" ? "pending" : "decided"}`} style={{ alignSelf: "center", flexShrink: 0 }}>
          <span className="badge-dot"/>{c.status}
        </span>
      </div>
    );
  };

  return (
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        {[
          { l: "Upcoming", v: upcoming.length, bg: "var(--accent-light)", c: "var(--accent)" },
          { l: "This Week", v: upcoming.filter(c => { const d = Math.ceil((new Date(c.next_hearing_date!).getTime() - Date.now()) / 86400000); return d >= 0 && d <= 7; }).length, bg: "#fef9c3", c: "#854d0e" },
          { l: "Past", v: past.length, bg: "#f1f5f9", c: "#475569" },
        ].map(s => (
          <div key={s.l} style={{ background: s.bg, borderRadius: 10, padding: "12px 18px", minWidth: 110 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: s.c, textTransform: "uppercase" }}>{s.l}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.c, lineHeight: 1, marginTop: 3 }}>{s.v}</div>
          </div>
        ))}
      </div>
      {upcoming.length > 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header"><span className="panel-title">Upcoming Hearings</span></div>
          {upcoming.map(c => <HCard key={c.id} c={c} />)}
        </div>
      )}
      {past.length > 0 && (
        <div className="panel">
          <div className="panel-header"><span className="panel-title">Past Hearings</span></div>
          {past.slice(0, 20).map(c => <HCard key={c.id} c={c} />)}
        </div>
      )}
      {allCases.length === 0 && <div className="panel"><div className="state-box">{I.file}<strong>No hearings</strong><p>Add cases to track hearings</p></div></div>}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: Billing & Invoices
// ═══════════════════════════════════════════════════════════════════════════════
function BillingPage({ clients, allCases, toast }: {
  clients: Client[]; allCases: CaseRow[];
  toast: (m: string, t?: "success" | "error") => void;
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInv, setSelectedInv] = useState<Invoice | null>(null);
  const [genModal, setGenModal] = useState(false);
  const [genForm, setGenForm] = useState({ client_id: "", case_id: "", tax_pct: "18", notes: "" });
  const [generating, setGenerating] = useState(false);

  const loadInvoices = useCallback(() =>
    api("/billing/invoices").then((r: Invoice[]) => setInvoices(r)).catch(() => {}), []);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const filteredCases = allCases.filter(c => !genForm.client_id || c.client_id === genForm.client_id);

  const generate = async () => {
    if (!genForm.client_id || !genForm.case_id) { toast("Select client and case", "error"); return; }
    setGenerating(true);
    try {
      const inv = await api("/billing/invoices/generate", { method: "POST", body: JSON.stringify(genForm) }) as Invoice;
      toast(`Invoice ${inv.invoice_number} generated — total ${rupees(inv.total)}`);
      setGenModal(false);
      loadInvoices();
      setSelectedInv(inv);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setGenerating(false); }
  };

  const handleStatusChange = (id: string, status: string) => {
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status } : inv));
    setSelectedInv(prev => prev && prev.id === id ? { ...prev, status } : prev);
    toast(`Invoice marked as ${status}`);
  };

  const statusColor: Record<string, string> = {
    draft: "badge-draft", sent: "badge-sent", paid: "badge-paid", overdue: "badge-overdue", cancelled: "badge-cancelled"
  };

  return (
    <>
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Invoices ({invoices.length})</span>
          <button className="btn btn-primary" onClick={() => setGenModal(true)}>{I.ai} Generate AI Invoice</button>
        </div>
        {invoices.length === 0 ? (
          <div className="state-box">{I.file}<strong>No invoices yet</strong><p>Click &quot;Generate AI Invoice&quot; to auto-create one from hearing history</p></div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Invoice #</th><th>Client</th><th>Case</th><th>Amount</th><th>Due Date</th><th>Status</th></tr></thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} onClick={() => setSelectedInv(inv)}>
                    <td><div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>{inv.invoice_number}</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>{fmt(inv.issue_date)}</div></td>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>{inv.client_name}</td>
                    <td><span className="case-no" style={{ fontSize: 11 }}>{inv.case_no ?? "—"}</span></td>
                    <td><div style={{ fontWeight: 700, fontSize: 14 }}>{rupees(inv.total)}</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>incl. GST</div></td>
                    <td style={{ fontSize: 12 }}>{fmt(inv.due_date)}</td>
                    <td><span className={`badge ${statusColor[inv.status] ?? "badge-draft"}`}>{inv.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {genModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setGenModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{I.ai} AI Invoice Generator</span>
              <button className="close-btn" onClick={() => setGenModal(false)}>{I.x}</button>
            </div>
            <div className="modal-body">
              <div style={{ background: "linear-gradient(135deg,#eff6ff,#f0fdf4)", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#1e40af" }}>
                {I.ai} Automatically creates an invoice from your hearing history and billing entries. Also predicts the next hearing date from past patterns.
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Client *</label>
                  <select className="form-select" value={genForm.client_id}
                    onChange={e => setGenForm(f => ({ ...f, client_id: e.target.value, case_id: "" }))}>
                    <option value="">— Select client —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Case *</label>
                  <select className="form-select" value={genForm.case_id}
                    onChange={e => setGenForm(f => ({ ...f, case_id: e.target.value }))}>
                    <option value="">— Select case —</option>
                    {filteredCases.map(c => <option key={c.id} value={c.id}>{c.case_no}{c.case_title ? ` — ${c.case_title.slice(0, 40)}` : ""}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">GST %</label>
                  <input className="form-input" type="number" value={genForm.tax_pct}
                    onChange={e => setGenForm(f => ({ ...f, tax_pct: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes (optional)</label>
                  <input className="form-input" placeholder="Any notes to include…" value={genForm.notes}
                    onChange={e => setGenForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setGenModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={generate} disabled={generating}>{generating ? "Generating…" : "Generate Invoice"}</button>
            </div>
          </div>
        </div>
      )}

      {selectedInv && (
        <InvoiceViewer
          inv={selectedInv}
          onClose={() => setSelectedInv(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: Settings
// ═══════════════════════════════════════════════════════════════════════════════
function SettingsPage({ toast }: { toast: (m: string, t?: "success" | "error") => void }) {
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{ status: string; email_configured?: boolean } | null>(null);
  const [upcomingReminders, setUpcomingReminders] = useState<NotifStatus | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    api("/health")
      .then((r: { status: string; email_configured?: boolean }) => { setHealthStatus(r); if (r.email_configured) setNotifEnabled(true); })
      .catch(() => {});
  }, []);

  const sendTestEmail = async () => {
    if (!testEmail.trim()) { toast("Enter an email address", "error"); return; }
    setSendingTest(true);
    try {
      const r = await api("/notifications/test", { method: "POST", body: JSON.stringify({ email: testEmail }) }) as { ok: boolean; message: string };
      toast(r.message, r.ok ? "success" : "error");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSendingTest(false); }
  };

  const previewReminders = async () => {
    setLoadingPreview(true);
    try {
      const r = await api("/notifications/upcoming") as NotifStatus;
      setUpcomingReminders(r);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setLoadingPreview(false); }
  };

  const sendRemindersNow = async () => {
    setSendingReminders(true);
    try {
      const r = await api("/notifications/send-reminders", { method: "POST" }) as { ok: boolean; message: string };
      toast(r.message, r.ok ? "success" : "error");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSendingReminders(false); }
  };

  const F = ({ l, v, mono = false }: { l: string; v: string; mono?: boolean }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{l}</span>
      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: mono ? "monospace" : "inherit" }}>{v}</span>
    </div>
  );

  const Toggle = ({ l, d, on, onToggle }: { l: string; d: string; on: boolean; onToggle?: () => void }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <div><div style={{ fontSize: 13, fontWeight: 600 }}>{l}</div><div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{d}</div></div>
      <div onClick={onToggle} style={{ width: 40, height: 22, borderRadius: 11, background: on ? "var(--accent)" : "var(--border)", cursor: onToggle ? "pointer" : "default", position: "relative" }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: on ? 20 : 2, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 620 }}>
      {/* Email Notifications section */}
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-header">
          <span className="panel-title">{I.mail} Email Notifications</span>
          <span className={`badge ${healthStatus?.email_configured ? "badge-paid" : "badge-overdue"}`}>
            {healthStatus?.email_configured ? "Configured" : "Not configured"}
          </span>
        </div>
        <div className="panel-body">
          {/* Status */}
          <div style={{ background: healthStatus?.email_configured ? "#f0fdf4" : "#fff7ed", border: `1px solid ${healthStatus?.email_configured ? "#bbf7d0" : "#fed7aa"}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: healthStatus?.email_configured ? "#166534" : "#92400e" }}>
              {healthStatus?.email_configured ? "Email service active" : "Email not configured"}
            </div>
            {!healthStatus?.email_configured && (
              <div style={{ fontSize: 12, color: "#92400e", marginTop: 6, lineHeight: 1.6 }}>
                Add these keys to <code style={{ background: "#fef3c7", padding: "1px 5px", borderRadius: 3 }}>backend/.env</code>:
                <pre style={{ marginTop: 8, background: "#1e293b", color: "#94a3b8", padding: "10px 14px", borderRadius: 7, fontSize: 11, lineHeight: 1.7, overflowX: "auto" }}>
{`EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=your@gmail.com`}
                </pre>
                <div style={{ fontSize: 11, marginTop: 6, color: "#92400e" }}>For Gmail, use an App Password (not your account password). Enable 2FA first, then create one at myaccount.google.com/apppasswords</div>
              </div>
            )}
          </div>

          <Toggle
            l="Hearing reminders"
            d="Send emails 2 days before each upcoming hearing"
            on={notifEnabled}
            onToggle={() => setNotifEnabled(e => !e)}
          />

          {/* Test email */}
          <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Send Test Email</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="form-input"
                type="email"
                placeholder="Enter your email to test…"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn btn-secondary" onClick={sendTestEmail} disabled={sendingTest || !testEmail.trim()}>
                {I.send} {sendingTest ? "Sending…" : "Send Test"}
              </button>
            </div>
          </div>

          {/* Preview + Send reminders */}
          <div style={{ display: "flex", gap: 8, paddingTop: 14, flexWrap: "wrap" }}>
            <button className="btn btn-secondary" onClick={previewReminders} disabled={loadingPreview}>
              {I.bell} {loadingPreview ? "Loading…" : "Preview Upcoming Reminders"}
            </button>
            <button className="btn btn-primary" onClick={sendRemindersNow} disabled={sendingReminders}>
              {I.send} {sendingReminders ? "Sending…" : "Send Reminders Now"}
            </button>
          </div>

          {/* Preview results */}
          {upcomingReminders && (
            <div style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", background: "var(--bg)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Upcoming reminders</span>
                <span className="badge badge-upcoming">{upcomingReminders.total} case{upcomingReminders.total !== 1 ? "s" : ""}</span>
              </div>
              {upcomingReminders.upcoming.length === 0 ? (
                <div style={{ padding: "14px 16px", fontSize: 13, color: "var(--text-muted)" }}>No upcoming hearings in the next 7 days</div>
              ) : upcomingReminders.upcoming.map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", borderBottom: i < upcomingReminders.upcoming.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div>
                    <div className="case-no" style={{ fontSize: 11 }}>{r.case_no}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.client_name ?? "No client"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>{fmt(r.next_hearing_date)}</div>
                    {r.client_email
                      ? <div style={{ fontSize: 10, color: "#166534" }}>✓ {r.client_email}</div>
                      : <div style={{ fontSize: 10, color: "#b91c1c" }}>No email on file</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Existing settings panels */}
      {[
        { title: "Data Source", rows: [["Court", "Delhi High Court"], ["Listing URL", "delhihighcourt.nic.in/web/index.php/cause-lists/cause-list"], ["PDF Pattern", "ADVANCE CAUSE LIST OF CASES FOR …"], ["Live Fetch", "Available per-case via Fetch Live button"]] },
        { title: "Ingestion Schedule", rows: [["Cron", "30 0 * * * (06:00 IST)"], ["Request Delay", "3 seconds between requests"], ["Download", "Node https stream (no undici limit)"], ["Parser", "pdf-parse v2 · PDFParse class"], ["Timeout", "60 seconds"]] },
        { title: "Database", rows: [["Engine", "PostgreSQL 16 (Docker)"], ["Port", "5433"], ["Tables", "clients · cases · parties · hearings · billing_entries · invoices"]] },
        { title: "Stack", rows: [["Backend", "Node.js 22 · Express 5 · TypeScript"], ["Frontend", "Next.js 15 · React 18"], ["Queue", "node-cron (BullMQ planned)"]] },
      ].map(section => (
        <div className="panel" key={section.title} style={{ marginBottom: 14 }}>
          <div className="panel-header"><span className="panel-title">{section.title}</span></div>
          <div className="panel-body">
            {section.rows.map(([l, v]) => <F key={l} l={l} v={v} mono={l.toLowerCase().includes("url") || l.toLowerCase().includes("port") || l.toLowerCase().includes("cron")} />)}
          </div>
        </div>
      ))}

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-header"><span className="panel-title">System Notifications</span></div>
        <div className="panel-body">
          <Toggle l="Daily ingestion log" d="Console output after each run" on={true} />
          <Toggle l="CAPTCHA detection" d="Pause adapter when blocked" on={true} />
          <Toggle l="Parse failure alerts" d="Warn when 0 records parsed" on={true} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [clients, setClients] = useState<Client[]>([]);
  const [allCases, setAllCases] = useState<CaseRow[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const { toast, show: showToast } = useToast();

  const loadAll = useCallback(async () => {
    const [cl, ca, inv] = await Promise.all([
      api("/clients").catch(() => []),
      api("/cases?query=&limit=200").then((r: { cases: CaseRow[] }) => r.cases).catch(() => []),
      api("/billing/invoices").catch(() => []),
    ]);
    setClients(cl as Client[]);
    setAllCases(ca as CaseRow[]);
    setInvoices(inv as Invoice[]);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const upcoming = allCases.filter(c => isUpcoming(c.next_hearing_date)).length;
  const invoiceCount = invoices.length;

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <DashboardPage clients={clients} allCases={allCases} invoices={invoices} onSelect={setSelectedCase} onNav={setPage} toast={showToast} />;
      case "clients":   return <ClientsPage clients={clients} allCases={allCases} onRefresh={loadAll} onSelect={setSelectedCase} toast={showToast} />;
      case "cases":     return <CasesPage allCases={allCases} clients={clients} onSelect={setSelectedCase} onRefresh={loadAll} toast={showToast} />;
      case "hearings":  return <HearingsPage allCases={allCases} onSelect={setSelectedCase} />;
      case "billing":   return <BillingPage clients={clients} allCases={allCases} toast={showToast} />;
      case "settings":  return <SettingsPage toast={showToast} />;
    }
  };

  const PAGE_TITLES: Record<Page, string> = {
    dashboard: "Dashboard", clients: "Clients", cases: "Case Tracker",
    hearings: "Hearings Calendar", billing: "Billing & Invoices", settings: "Settings",
  };

  return (
    <>
      <Sidebar page={page} setPage={setPage} counts={{ clients: clients.length, cases: allCases.length, hearings: upcoming, invoices: invoiceCount }} />
      <div className="main">
        <header className="topbar">
          <div className="topbar-title">{PAGE_TITLES[page]}</div>
          <div className="topbar-right">
            <span className="badge-pill">Delhi HC · Live</span>
            <button className="btn btn-primary btn-sm" onClick={() => setPage("billing")}>{I.billing} Invoice</button>
          </div>
        </header>
        <div className="content">{renderPage()}</div>
      </div>

      {selectedCase && <CaseDrawer id={selectedCase} onClose={() => setSelectedCase(null)} toast={showToast} />}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </>
  );
}
