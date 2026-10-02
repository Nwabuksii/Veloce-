"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import Avatar from "@/app/components/Avatar";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import { isUserOnline } from "@/lib/online";
import { displayEmail } from "@/lib/deleted-user";

interface UserResult {
  id: string;
  fullName: string;
  email: string;
  role: string;
  bannedAt: string | null;
  banReason: string | null;
  banExpiresAt: string | null;
  avatarUrl: string | null;
  departmentName: string | null;
  level: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  isOnline: boolean;
  noteCount: number;
  purchaseCount: number;
  requestCount: number;
  followingCount: number;
  reportCount: number;
}

interface UserDetail {
  id: string;
  fullName: string;
  email: string;
  role: string;
  departmentName: string | null;
  level: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  isOnline: boolean;
  bannedAt: string | null;
  banReason: string | null;
  banExpiresAt: string | null;
  noteCount: number;
  purchaseCount: number;
  requestCount: number;
  followingCount: number;
  reportCount: number;
  purchases: Array<{ id: string; title: string; courseCode: string; courseName: string; amountPaid: number; purchasedAt: string; refundedAt: string | null; reviewRating: number | null; noteId: string }>
  requests: Array<{ id: string; requestedTitle: string; createdAt: string; status: string; voteCount: number; blockTitle: string | null }>
  notes: Array<{ id: string; title: string; status: string; createdAt: string; blockTitle: string | null; courseCode: string | null }>
  following: Array<{ id: string; fullName: string; role: string }>
}

interface UserStats {
  total: number;
  loggedIn: number;
  students: number;
  scribes: number;
  admins: number;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalPages: number;
  totalMatching: number;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [onlineFilter, setOnlineFilter] = useState("all");
  const [results, setResults] = useState<UserResult[]>([]);
  const [stats, setStats] = useState<UserStats>({ total: 0, loggedIn: 0, students: 0, scribes: 0, admins: 0 });
  const [searching, setSearching] = useState(false);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, totalPages: 1, totalMatching: 0 });
  const [actionMessage, setActionMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [banningId, setBanningId] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banDurationDays, setBanDurationDays] = useState(""); // empty = indefinite

  const [levelStatus, setLevelStatus] = useState<{
    eligibleNow: boolean;
    inWindow: boolean;
    lockedForThisWindow: boolean;
    lastLevelAdvanceAt: string | null;
  } | null>(null);
  const [levelBusy, setLevelBusy] = useState(false);
  const [levelMessage, setLevelMessage] = useState("");

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
  }, [router]);

  useEffect(() => {
    apiFetch("/api/admin/university/advance-level")
      .then((data) => setLevelStatus(data))
      .catch(() => {});
  }, []);

  async function handleAdvanceLevel() {
    if (
      !confirm(
        "This advances EVERY student and scribe at your university one level, and graduates anyone already at 500L (they keep their notes and earnings, but lose upload access). This can't be undone from here. Continue?"
      )
    ) {
      return;
    }
    setLevelBusy(true);
    setLevelMessage("");
    try {
      const data = await apiFetch("/api/admin/university/advance-level", { method: "POST" });
      setLevelMessage(`Done — advanced ${data.advancedCount}, graduated ${data.graduatedCount}.`);
      const status = await apiFetch("/api/admin/university/advance-level");
      setLevelStatus(status);
    } catch (err) {
      setLevelMessage(friendlyErrorMessage(err));
    } finally {
      setLevelBusy(false);
    }
  }

  function buildSearchUrl(pageNum: number) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (roleFilter !== "all") params.set("role", roleFilter);
    if (onlineFilter !== "all") params.set("online", onlineFilter);
    params.set("page", String(pageNum));
    return `/api/admin/users/search?${params.toString()}`;
  }

  function applyPageData(data: any) {
    setResults(data.users || []);
    if (data.stats) setStats(data.stats);
    if (data.pagination) {
      setPagination(data.pagination);
      // The server clamps out-of-range pages, so sync back to what it returned.
      setPage(data.pagination.page);
      setPageInput(String(data.pagination.page));
    }
  }

  // Any filter/search change goes back to page 1.
  useEffect(() => {
    setPage(1);
    setPageInput("1");
  }, [query, roleFilter, onlineFilter]);

  useEffect(() => {
    setSearching(true);
    const handle = setTimeout(() => {
      apiFetch(buildSearchUrl(page))
        .then(applyPageData)
        .catch(() => {
          setResults([]);
          setStats({ total: 0, loggedIn: 0, students: 0, scribes: 0, admins: 0 });
          setPagination({ page: 1, pageSize: 20, totalPages: 1, totalMatching: 0 });
        })
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, roleFilter, onlineFilter, page]);

  // Re-fetch the current page after a ban/unban so the user stays on the same page.
  function refreshOne(_id: string) {
    apiFetch(buildSearchUrl(page))
      .then(applyPageData)
      .catch(() => {});
  }

  function goToPage(n: number) {
    const target = Math.min(Math.max(1, Math.floor(n) || 1), pagination.totalPages);
    setPageInput(String(target));
    if (target !== page) setPage(target);
  }

  const pager = (position: "top" | "bottom") => (
    <div className="panel-row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap", margin: position === "top" ? "0 0 16px" : "16px 0 0" }}>
      <span className="panel-desc" style={{ margin: 0 }}>
        Page {pagination.page} of {pagination.totalPages} • {pagination.totalMatching} user{pagination.totalMatching === 1 ? "" : "s"}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-ghost" disabled={searching || page <= 1} onClick={() => goToPage(page - 1)}>
          Previous
        </button>
        <input
          className="input"
          type="number"
          min={1}
          max={pagination.totalPages}
          value={pageInput}
          aria-label={`Go to page (${position})`}
          style={{ width: 80 }}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") goToPage(parseInt(pageInput, 10));
          }}
        />
        <button className="btn btn-ghost" disabled={searching} onClick={() => goToPage(parseInt(pageInput, 10))}>
          Go
        </button>
        <button className="btn btn-ghost" disabled={searching || page >= pagination.totalPages} onClick={() => goToPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );

  async function handleBan(id: string) {
    setActionMessage("");
    setBusyId(id);
    try {
      const durationDays = banDurationDays.trim() ? parseInt(banDurationDays.trim(), 10) : undefined;
      await apiFetch(`/api/admin/users/${id}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: banReason.trim() || undefined, durationDays }),
      });
      setActionMessage("User banned — they've been emailed.");
      setBanningId(null);
      setBanReason("");
      setBanDurationDays("");
      refreshOne(id);
    } catch (err) {
      setActionMessage(friendlyErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnban(id: string) {
    setActionMessage("");
    setBusyId(id);
    try {
      await apiFetch(`/api/admin/users/${id}/unban`, { method: "POST" });
      setActionMessage("User unbanned — they've been emailed.");
      refreshOne(id);
    } catch (err) {
      setActionMessage(friendlyErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  // Keep the page behind the details sheet from scrolling while it is open.
  useEffect(() => {
    if (!selectedUser) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selectedUser]);

  async function openUserDetails(id: string) {
    setSelectedUserId(id);
    setDetailsLoading(true);
    try {
      const data = await apiFetch(`/api/admin/users/${id}`);
      setSelectedUser(data.user || null);
    } catch (err) {
      setActionMessage(friendlyErrorMessage(err));
      setSelectedUser(null);
    } finally {
      setDetailsLoading(false);
    }
  }

  const date = (d: string | null, empty = "—") => (d ? new Date(d).toLocaleDateString() : empty);

  return (
    <div className="page-wrap">
      <AdminPageHeader section="People" title="Manage" serif="users" subtitle="Every account on the platform.">
        <button className="btn btn-ghost" onClick={() => router.push("/admin")}>
          {AIcon.back()} Admin
        </button>
      </AdminPageHeader>

      <div className="three-col is-compact mb-24">
        {[
          { label: "Total users", value: stats.total },
          { label: "Logged in", value: stats.loggedIn },
          { label: "Students", value: stats.students },
          { label: "Scribes", value: stats.scribes },
          { label: "Admins", value: stats.admins },
        ].map((card) => (
          <div key={card.label} className="stat-tile">
            <div className="label">{card.label}</div>
            <div className="value">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="panel panel-row mb-24">
        <div>
          <div className="row-title">Start a new level</div>
          <p className="panel-desc">
            Advances every student/scribe at your university one level (100L → 200L, etc.), and graduates anyone already at 500L.
            Only available in May or July, once per window.
            {levelStatus && !levelStatus.inWindow && " It isn't May or July right now."}
            {levelStatus?.inWindow && levelStatus.lockedForThisWindow && " Already used for this window."}
            {levelStatus?.lastLevelAdvanceAt && ` Last run: ${new Date(levelStatus.lastLevelAdvanceAt).toLocaleDateString()}.`}
          </p>
        </div>
        <button className="btn btn-primary" disabled={!levelStatus?.eligibleNow || levelBusy} onClick={handleAdvanceLevel}>
          {levelBusy ? "Working…" : "Start new level"}
        </button>
      </div>
      {levelMessage && <div className="notice">{levelMessage}</div>}

      <p className="panel-desc">
        Search any student, scribe, or admin at your university to review their academic profile, login history, and activity. Admins cannot be banned or demoted here; those changes must be made directly in the database.
      </p>

      <div className="search-field mb-16" style={{ maxWidth: 420 }}>
        {AIcon.search()}
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email..." />
      </div>

      <div className="panel-row mb-24" style={{ alignItems: "end", gap: 12 }}>
        <div className="form-field" style={{ margin: 0, minWidth: 180 }}>
          <label className="form-label" htmlFor="users-role-filter">Role</label>
          <select id="users-role-filter" className="select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All roles</option>
            <option value="STUDENT">Students</option>
            <option value="SCRIBE">Scribes</option>
            <option value="ADMIN">Admins</option>
          </select>
        </div>
        <div className="form-field" style={{ margin: 0, minWidth: 180 }}>
          <label className="form-label" htmlFor="users-online-filter">Online status</label>
          <select id="users-online-filter" className="select" value={onlineFilter} onChange={(e) => setOnlineFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>
      </div>
      {searching && <p className="panel-desc">Searching...</p>}
      {actionMessage && <div className="notice">{actionMessage}</div>}

      {!searching && results.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">{AIcon.search()}</div>
          <h3 className="empty-title">No users found</h3>
          <p className="empty-desc">Try a different name or email.</p>
        </div>
      )}

      {results.length > 0 && pager("top")}

      <div className="stack-10">
        {results.map((u) => {
          const isBanned = Boolean(u.bannedAt);
          const online = isUserOnline(u.lastSeenAt);
          return (
            <div key={u.id} className={`person-card${isBanned ? " is-banned" : online ? " is-online" : ""}`}>
              <Avatar name={u.fullName} imageUrl={u.avatarUrl} size="sm" />
              <div className="person-info">
                <div className="person-name-row">
                  <span className="person-name">{u.fullName}</span>
                  <span className="status">{u.role}</span>
                  {isBanned && <span className="status danger">Banned</span>}
                  <span className={`person-meta${online ? " is-on" : ""}`}>
                    <span className={`dot${online ? " on" : ""}`}></span>
                    {online ? "Online" : "Offline"}
                  </span>
                </div>
                <div className="person-sub">{displayEmail(u.email)}</div>
                <div className="person-sub">
                  {u.departmentName ? u.departmentName : "Department not set"}
                  {u.level ? ` • ${u.level}` : " • level pending"}
                </div>
                <div className="person-sub">
                  Joined {date(u.createdAt)}
                  {u.lastLoginAt ? ` • Last login ${date(u.lastLoginAt)}` : " • Never logged in"}
                  {u.lastSeenAt ? ` • Last seen ${date(u.lastSeenAt)}` : ""}
                </div>
                <div className="person-stats" style={{ marginTop: 8 }}>
                  <span>Library: <strong>{u.noteCount}</strong></span>
                  <span>Requests: <strong>{u.requestCount}</strong></span>
                  <span>Purchases: <strong>{u.purchaseCount}</strong></span>
                  <span>Followers: <strong>{u.followingCount}</strong></span>
                  <span>Reports: <strong>{u.reportCount}</strong></span>
                </div>
                {isBanned && (
                  <div className="person-sub text-danger" style={{ marginTop: 6 }}>
                    Banned {u.banExpiresAt ? `until ${date(u.banExpiresAt)}` : "until further notice"}
                    {u.banReason && ` — "${u.banReason}"`}
                  </div>
                )}
              </div>

              <div className="request-actions">
                <button className="btn btn-ghost" onClick={() => openUserDetails(u.id)}>
                  {AIcon.eye()} Details
                </button>
                {u.role === "ADMIN" ? (
                  <span className="status">Admin protected</span>
                ) : isBanned ? (
                  <button className="btn btn-success" onClick={() => handleUnban(u.id)} disabled={busyId === u.id}>
                    Unban
                  </button>
                ) : banningId === u.id ? null : (
                  <button className="btn btn-danger" onClick={() => setBanningId(u.id)}>
                    Ban
                  </button>
                )}
              </div>

              {banningId === u.id && (
                <div className="request-extra">
                  <textarea
                    className="textarea"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    rows={2}
                    placeholder="Reason (optional) — included in their email"
                  />
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label className="form-label">Duration in days (leave blank for indefinite / until further notice)</label>
                    <input className="input" type="number" min={1} value={banDurationDays} onChange={(e) => setBanDurationDays(e.target.value)} placeholder="e.g. 90" />
                  </div>
                  <div className="form-actions">
                    <button className="btn btn-danger" onClick={() => handleBan(u.id)} disabled={busyId === u.id}>
                      {busyId === u.id ? "Banning..." : "Confirm ban"}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setBanningId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {results.length > 0 && pager("bottom")}

      {selectedUser && (
        <div className="admin-user-modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="admin-user-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-user-modal-header">
              <div className="person-name-row">
                <h3 className="panel-title" style={{ margin: 0 }}>{selectedUser.fullName}</h3>
                <span className="status">{selectedUser.role}</span>
                <span className={`person-meta${selectedUser.isOnline ? " is-on" : ""}`}>
                  <span className={`dot${selectedUser.isOnline ? " on" : ""}`}></span>
                  {selectedUser.isOnline ? "Online now" : "Offline"}
                </span>
              </div>
              <div className="person-sub">{displayEmail(selectedUser.email)}</div>
              <button className="btn btn-ghost admin-user-modal-close" onClick={() => setSelectedUser(null)}>Close</button>
            </div>

            <div className="admin-user-modal-body">
            <div className="admin-user-stat-grid">
              {[
                { label: "Department", value: selectedUser.departmentName || "Not set" },
                { label: "Level", value: selectedUser.level || "Pending" },
                { label: "Joined", value: date(selectedUser.createdAt) },
                { label: "Last login", value: date(selectedUser.lastLoginAt, "Never") },
                { label: "Last seen", value: date(selectedUser.lastSeenAt, "Never") },
                { label: "Status", value: selectedUser.bannedAt ? "Banned" : "Active" },
              ].map((item) => (
                <div key={item.label} className="admin-user-stat-card">
                  <div className="k">{item.label}</div>
                  <div className="v">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="admin-user-detail-grid">
              <div className="detail-card">
                <h4>Purchases</h4>
                {selectedUser.purchases.length === 0 ? <div className="person-sub">No purchases yet.</div> : selectedUser.purchases.map((p) => (
                  <div key={p.id} className="detail-item">
                    <div className="t">{p.title}</div>
                    <div className="s">{p.courseCode} • {p.courseName}</div>
                    <div className="s">Paid ₦{p.amountPaid.toLocaleString()} • {date(p.purchasedAt)}</div>
                  </div>
                ))}
              </div>

              <div className="detail-card">
                <h4>Requests</h4>
                {selectedUser.requests.length === 0 ? <div className="person-sub">No requests yet.</div> : selectedUser.requests.map((r) => (
                  <div key={r.id} className="detail-item">
                    <div className="t">{r.requestedTitle}</div>
                    <div className="s">{r.status} • {r.voteCount} vote{r.voteCount === 1 ? "" : "s"}</div>
                    <div className="s">{date(r.createdAt)}</div>
                  </div>
                ))}
              </div>

              <div className="detail-card">
                <h4>Library</h4>
                {selectedUser.notes.length === 0 ? <div className="person-sub">No uploaded notes.</div> : selectedUser.notes.map((n) => (
                  <div key={n.id} className="detail-item">
                    <div className="t">{n.title}</div>
                    <div className="s">{n.courseCode || "General"} • {n.status}</div>
                    <div className="s">{date(n.createdAt)}</div>
                  </div>
                ))}
              </div>

              <div className="detail-card">
                <h4>Following</h4>
                {selectedUser.following.length === 0 ? <div className="person-sub">Not following anyone yet.</div> : selectedUser.following.map((person) => (
                  <div key={person.id} className="detail-item">
                    <div className="t">{person.fullName}</div>
                    <div className="s">{person.role}</div>
                  </div>
                ))}
              </div>
            </div>
            </div>
          </div>
        </div>
      )}

      {detailsLoading && <p className="panel-desc" style={{ marginTop: 16 }}>Loading details…</p>}
    </div>
  );
}
