"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { formatDateDDMMYYYY } from "@/lib/date-format";

interface SecurityEventItem {
  id: string;
  createdAt: string;
  event: string;
  severity: string;
  ip: string | null;
  details: Record<string, string | number | boolean> | null;
  user: { id: string; fullName: string; email: string } | null;
  actor: string | null;
}

interface Filters {
  events: string[];
  severities: string[];
}

const label = (s: string) => s.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const severityClass = (s: string) => (s === "alert" ? "danger" : s === "warn" || s === "warning" ? "warn" : "info");

export default function AdminSecurityPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [items, setItems] = useState<SecurityEventItem[]>([]);
  const [filters, setFilters] = useState<Filters>({ events: [], severities: [] });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }
    if (user.role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    setReady(true);
  }, [router]);

  function buildParams(cursor: string | null) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (eventFilter) params.set("event", eventFilter);
    if (severityFilter) params.set("severity", severityFilter);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (cursor) params.set("cursor", cursor);
    return params.toString();
  }

  // First page — reruns (debounced) whenever a filter changes.
  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    const id = ++requestId.current;
    const handle = setTimeout(() => {
      apiFetch(`/api/admin/security?${buildParams(null)}`)
        .then((data) => {
          if (id !== requestId.current) return;
          setItems(data.events);
          setNextCursor(data.nextCursor);
          if (data.filters) setFilters(data.filters);
          setError("");
        })
        .catch((err) => {
          if (id === requestId.current) setError(friendlyErrorMessage(err));
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, query, eventFilter, severityFilter, from, to]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const id = requestId.current;
    try {
      const data = await apiFetch(`/api/admin/security?${buildParams(nextCursor)}`);
      if (id !== requestId.current) return;
      setItems((prev) => [...prev, ...data.events]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  // Loads the next batch when the bottom of the list scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextCursor) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    }, { rootMargin: "300px" });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCursor, loadingMore]);

  if (!ready) return null;

  const filtered = !!(query || eventFilter || severityFilter || from || to);

  return (
    <div className="page-wrap">
      <AdminPageHeader
        section="Security"
        serif="History"
        subtitle="Failed logins, role changes, bans, payouts, refunds, password resets and two-step changes — newest first. Each month is emailed to the site email and then cleared."
      >
        <button className="btn btn-ghost" onClick={() => router.push("/admin")}>
          {AIcon.back()} Admin
        </button>
      </AdminPageHeader>

      <div className="filter-panel mb-16">
        <div className="form-field">
          <label className="form-label">Person</label>
          <input className="input" type="search" placeholder="Name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-label">Event</label>
          <select className="select" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
            <option value="">All events</option>
            {filters.events.map((ev) => (
              <option key={ev} value={ev}>{label(ev)}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-label">Severity</label>
          <select className="select" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
            <option value="">All severities</option>
            {filters.severities.map((s) => (
              <option key={s} value={s}>{label(s)}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-label">From</label>
          <input className="input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-label">To</label>
          <input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {loading && <SkeletonList rows={4} />}
      {error && <div className="auth-error">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">{AIcon.eye()}</div>
          <h3 className="empty-title">{filtered ? "Nothing matches" : "No security events yet"}</h3>
          <p className="empty-desc">{filtered ? "Try widening the filters." : "Events will appear here as they happen."}</p>
        </div>
      )}

      <div className="stack-10">
        {!loading &&
          items.map((e) => {
            const when = new Date(e.createdAt);
            const detailPairs = e.details ? Object.entries(e.details).filter(([k]) => k !== "byAdminId" && k !== "adminId") : [];
            return (
              <div key={e.id} className="request-item">
                <div className="request-body">
                  <div className="request-code">{`${formatDateDDMMYYYY(when)} · ${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}</div>
                  <div className="request-topic">{label(e.event)}</div>
                  <div className="request-meta">
                    {e.user && (
                      <span>
                        {AIcon.user()} {e.user.fullName}
                        {e.user.email ? ` · ${e.user.email}` : ""}
                      </span>
                    )}
                    {e.actor && <span>By {e.actor}</span>}
                    {e.ip && <span>IP {e.ip}</span>}
                    {detailPairs.map(([k, v]) => (
                      <span key={k}>
                        {label(k)}: {String(v)}
                      </span>
                    ))}
                  </div>
                </div>
                <span className={`status ${severityClass(e.severity)}`}>{label(e.severity)}</span>
              </div>
            );
          })}
      </div>

      {nextCursor && (
        <div ref={sentinelRef} className="panel-desc" style={{ textAlign: "center", marginTop: 16 }}>
          {loadingMore ? "Loading more..." : ""}
        </div>
      )}
    </div>
  );
}
