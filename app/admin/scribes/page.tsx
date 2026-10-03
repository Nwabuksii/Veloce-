"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import Avatar from "@/app/components/Avatar";
import Pager from "@/app/components/Pager";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import { displayEmail } from "@/lib/deleted-user";

interface ScribeView {
  id: string;
  fullName: string;
  email: string;
  joinedAt: string;
  level: string | null;
  departmentName: string | null;
  isOnline: boolean;
  uploadCount: number;
  avatarUrl: string | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalPages: number;
  totalMatching: number;
}

interface ScribePage {
  scribes: ScribeView[];
  pagination: Pagination;
  stats: { total: number; online: number };
  filters: { departments: { id: string; name: string }[]; levels: string[] };
}

const SORTS = [
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
  { value: "uploads-desc", label: "Most uploads" },
  { value: "uploads-asc", label: "Fewest uploads" },
  { value: "joined-desc", label: "Newest scribes" },
  { value: "joined-asc", label: "Oldest scribes" },
];

export default function ManageScribesPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [level, setLevel] = useState("all");
  const [online, setOnline] = useState("all");
  const [sort, setSort] = useState("name-asc");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  const [scribes, setScribes] = useState<ScribeView[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, totalPages: 1, totalMatching: 0 });
  const [stats, setStats] = useState({ total: 0, online: 0 });
  const [filters, setFilters] = useState<ScribePage["filters"]>({ departments: [], levels: [] });
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const [actionMessage, setActionMessage] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [demoteReason, setDemoteReason] = useState("");
  const [promotingId, setPromotingId] = useState<string | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }
    if (user.role !== "ADMIN") router.push("/dashboard");
  }, [router]);

  function buildUrl(pageNum: number) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (department !== "all") params.set("department", department);
    if (level !== "all") params.set("level", level);
    if (online !== "all") params.set("online", online);
    if (sort !== "name-asc") params.set("sort", sort);
    params.set("page", String(pageNum));
    return `/api/admin/scribes?${params.toString()}`;
  }

  function applyData(data: ScribePage) {
    setScribes(data.scribes || []);
    setStats(data.stats);
    setFilters(data.filters);
    setPagination(data.pagination);
    // The server clamps out-of-range pages, so sync back to what it returned.
    setPage(data.pagination.page);
    setPageInput(String(data.pagination.page));
  }

  // Any search / filter / sort change goes back to page 1.
  useEffect(() => {
    setPage(1);
    setPageInput("1");
  }, [query, department, level, online, sort]);

  useEffect(() => {
    setSearching(true);
    const handle = setTimeout(() => {
      apiFetch<ScribePage>(buildUrl(page))
        .then((d) => {
          setError("");
          applyData(d);
        })
        .catch((err) => setError(friendlyErrorMessage(err)))
        .finally(() => {
          setSearching(false);
          setLoading(false);
        });
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, department, level, online, sort, page]);

  // Re-fetch the current page after a demote/promote so the list stays accurate.
  function refresh() {
    apiFetch<ScribePage>(buildUrl(page)).then(applyData).catch(() => {});
  }

  function goToPage(n: number) {
    const target = Math.min(Math.max(1, Math.floor(n) || 1), pagination.totalPages);
    setPageInput(String(target));
    if (target !== page) setPage(target);
  }

  async function handleDemote(id: string) {
    setActionMessage("");
    try {
      const data = await apiFetch(`/api/admin/scribes/${id}/demote`, {
        method: "POST",
        body: JSON.stringify({ reason: demoteReason.trim() || undefined }),
      });
      setActionMessage(`${data.user.fullName} has been demoted to Student — takes effect on their next login.`);
      setConfirmingId(null);
      setDemoteReason("");
      refresh();
    } catch (err) {
      setActionMessage(friendlyErrorMessage(err));
    }
  }

  async function handlePromote(id: string, fullName: string) {
    setActionMessage("");
    setPromotingId(id);
    try {
      await apiFetch(`/api/admin/promote/${id}`, { method: "POST" });
      setActionMessage(`${fullName} is now an Admin.`);
      refresh();
    } catch (err) {
      setActionMessage(friendlyErrorMessage(err));
    } finally {
      setPromotingId(null);
    }
  }

  const pager = (position: "top" | "bottom") => (
    <Pager
      position={position}
      page={pagination.page}
      totalPages={pagination.totalPages}
      totalMatching={pagination.totalMatching}
      noun="scribe"
      pageInput={pageInput}
      setPageInput={setPageInput}
      goToPage={goToPage}
      disabled={searching}
    />
  );

  const filtering = query.trim() !== "" || department !== "all" || level !== "all" || online !== "all";

  return (
    <div className="page-wrap">
      <AdminPageHeader
        section="Trust"
        title="Manage"
        serif="scribes"
        subtitle="Trust levels, suspensions and reinstatements. Demoting reverts them to Student on next login and opens an appeal window."
      >
        <button className="btn btn-ghost" onClick={() => router.push("/admin/appeals")}>
          {AIcon.warn()} Appeals
        </button>
        <button className="btn btn-ghost" onClick={() => router.push("/admin/reports")}>
          {AIcon.flag()} Reports
        </button>
        <button className="btn btn-ghost" onClick={() => router.push("/admin")}>
          {AIcon.back()} Admin
        </button>
      </AdminPageHeader>

      <div className="three-col is-compact mb-24">
        {[
          { label: "Active scribes", value: stats.total },
          { label: "Online now", value: stats.online },
          { label: filtering ? "Matching" : "Showing", value: pagination.totalMatching },
        ].map((card) => (
          <div key={card.label} className="stat-tile">
            <div className="label">{card.label}</div>
            <div className="value">{card.value}</div>
          </div>
        ))}
      </div>

      <p className="panel-desc">
        Demoting a scribe reverts them to Student on their next login and lets them submit one reinstatement
        appeal a month. Their existing uploads, sales, and reviews stay visible on their profile, just marked
        as no longer active. Promoting a scribe makes them a full Admin for your university. Deleted accounts
        are not listed here; find them in Manage Users under “Deleted users”.
      </p>

      <div className="search-field mb-16" style={{ maxWidth: 420 }}>
        {AIcon.search()}
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email..." />
      </div>

      <div className="panel-row mb-24" style={{ alignItems: "end", gap: 12, flexWrap: "wrap" }}>
        <div className="form-field" style={{ margin: 0, minWidth: 160 }}>
          <label className="form-label" htmlFor="scribes-department">Course</label>
          <select id="scribes-department" className="select" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="all">All courses</option>
            {filters.departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="form-field" style={{ margin: 0, minWidth: 120 }}>
          <label className="form-label" htmlFor="scribes-level">Level</label>
          <select id="scribes-level" className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="all">All levels</option>
            {filters.levels.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div className="form-field" style={{ margin: 0, minWidth: 140 }}>
          <label className="form-label" htmlFor="scribes-online">Status</label>
          <select id="scribes-online" className="select" value={online} onChange={(e) => setOnline(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>
        <div className="form-field" style={{ margin: 0, minWidth: 160 }}>
          <label className="form-label" htmlFor="scribes-sort">Sort by</label>
          <select id="scribes-sort" className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        {filtering && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setQuery("");
              setDepartment("all");
              setLevel("all");
              setOnline("all");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {loading && <SkeletonList rows={3} />}
      {error && <div className="auth-error">{error}</div>}
      {actionMessage && <div className="notice">{actionMessage}</div>}
      {!loading && !error && scribes.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">{AIcon.user()}</div>
          <h3 className="empty-title">{filtering ? "No scribes found" : "No active scribes"}</h3>
          <p className="empty-desc">{filtering ? "Try a different search or clear the filters." : "There are no active scribes right now."}</p>
        </div>
      )}

      {scribes.length > 0 && pager("top")}

      <div className="stack-10">
        {scribes.map((s) => (
          <div key={s.id} className={`person-card${s.isOnline ? " is-online" : ""}`}>
            <Avatar name={s.fullName} imageUrl={s.avatarUrl} size="sm" />
            <div className="person-info">
              <div className="person-name-row">
                <button className="person-link person-name" onClick={() => router.push(`/scribe/${s.id}`)}>
                  {s.fullName}
                </button>
                <span className={`person-meta${s.isOnline ? " is-on" : ""}`}>
                  <span className={`dot${s.isOnline ? " on" : ""}`}></span>
                  {s.isOnline ? "Online" : "Offline"}
                </span>
              </div>
              <div className="person-sub">{displayEmail(s.email)}</div>
              <div className="person-sub">
                {s.departmentName ?? "Course not set"}
                {s.level ? ` • ${s.level}` : ""} • Joined {formatDateDDMMYYYY(new Date(s.joinedAt))}
              </div>
              <div className="person-stats">
                <span>{AIcon.book()} <strong>{s.uploadCount}</strong> upload{s.uploadCount === 1 ? "" : "s"}</span>
              </div>
            </div>

            {confirmingId === s.id ? (
              <div className="request-extra">
                <textarea
                  className="textarea"
                  value={demoteReason}
                  onChange={(e) => setDemoteReason(e.target.value)}
                  rows={2}
                  placeholder="Reason (optional) — shared with the scribe"
                />
                <div className="form-actions">
                  <span className="person-sub text-danger" style={{ alignSelf: "center" }}>Demote for real?</span>
                  <button className="btn btn-danger" onClick={() => handleDemote(s.id)}>
                    Yes, demote
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setConfirmingId(null);
                      setDemoteReason("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="request-actions">
                <button className="btn btn-ghost" onClick={() => handlePromote(s.id, s.fullName)} disabled={promotingId === s.id}>
                  {AIcon.shield()} {promotingId === s.id ? "Promoting..." : "Promote to Admin"}
                </button>
                <button className="btn btn-danger" onClick={() => setConfirmingId(s.id)}>
                  Demote
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {scribes.length > 0 && pager("bottom")}
    </div>
  );
}
