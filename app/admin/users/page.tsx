"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import Avatar from "@/app/components/Avatar";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import { isUserOnline } from "@/lib/online";

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

export default function AdminUsersPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [stats, setStats] = useState<UserStats>({ total: 0, loggedIn: 0, students: 0, scribes: 0, admins: 0 });
  const [searching, setSearching] = useState(false);
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

  useEffect(() => {
    setSearching(true);
    const handle = setTimeout(() => {
      apiFetch(`/api/admin/users/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`)
        .then((data) => {
          setResults(data.users || []);
          setStats(data.stats || { total: 0, loggedIn: 0, students: 0, scribes: 0, admins: 0 });
        })
        .catch(() => {
          setResults([]);
          setStats({ total: 0, loggedIn: 0, students: 0, scribes: 0, admins: 0 });
        })
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  function refreshOne(id: string) {
    apiFetch(`/api/admin/users/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`)
      .then((data) => {
        setResults(data.users || []);
        setStats(data.stats || stats);
      })
      .catch(() => {});
  }

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

  return (
    <div className="page-wrap">
      <div className="app-container">
        <PageHeader title="Manage users" subtitle="Every account on the platform.">
          <button className="btn" onClick={() => router.push("/admin")}>
              <i className="fas fa-arrow-left"></i> Admin
            </button>
        </PageHeader>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginTop: "1rem" }}>
          {[
            { label: "Total users", value: stats.total },
            { label: "Logged in", value: stats.loggedIn },
            { label: "Students", value: stats.students },
            { label: "Scribes", value: stats.scribes },
            { label: "Admins", value: stats.admins },
          ].map((card) => (
            <div key={card.label} style={{ background: "var(--surface)", border: "1px solid var(--border-blue)", borderRadius: "12px", padding: "0.9rem 1rem" }}>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>{card.label}</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.35rem" }}>{card.value}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-blue)",
            borderRadius: "12px",
            padding: "1rem",
            marginTop: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>Start a new level</div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
              Advances every student/scribe at your university one level (100L → 200L, etc.), and graduates anyone
              already at 500L. Only available in May or July, once per window.
              {levelStatus && !levelStatus.inWindow && " It isn't May or July right now."}
              {levelStatus?.inWindow && levelStatus.lockedForThisWindow && " Already used for this window."}
              {levelStatus?.lastLevelAdvanceAt &&
                ` Last run: ${new Date(levelStatus.lastLevelAdvanceAt).toLocaleDateString()}.`}
            </div>
          </div>
          <button
            className="btn btn-primary"
            disabled={!levelStatus?.eligibleNow || levelBusy}
            onClick={handleAdvanceLevel}
          >
            {levelBusy ? "Working…" : "Start new level"}
          </button>
        </div>
        {levelMessage && <p style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>{levelMessage}</p>}

        <p style={{ color: "var(--text-secondary)", marginTop: "1rem", fontSize: "0.9rem" }}>
          Search any student, scribe, or admin at your university to review their academic profile, login history, and activity. Admins cannot be banned or demoted here; those changes must be made directly in the database.
        </p>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email..."
          style={{ width: "100%", maxWidth: 420, padding: "0.7rem", borderRadius: "8px", border: "1px solid var(--border-blue)", marginTop: "1rem" }}
        />
        {searching && <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.5rem" }}>Searching...</p>}
        {actionMessage && <p style={{ color: "var(--text-success)", marginTop: "0.6rem" }}>{actionMessage}</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginTop: "1rem" }}>
          {results.map((u) => {
            const isBanned = Boolean(u.bannedAt);
            const online = isUserOnline(u.lastSeenAt);
            return (
              <div
                key={u.id}
                style={{
                  background: "var(--surface)",
                  border: isBanned ? "2px solid var(--text-danger)" : online ? "1px solid #22c55e" : "1px solid var(--border-blue)",
                  boxShadow: online ? "0 0 0 1px rgba(34,197,94,0.35), 0 0 12px rgba(34,197,94,0.22)" : "none",
                  borderRadius: "12px",
                  padding: "1rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.6rem" }}>
                  <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
                  <Avatar name={u.fullName} imageUrl={u.avatarUrl} size="sm" />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                      <strong>{u.fullName}</strong>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          color: online ? "#16a34a" : "var(--text-secondary)",
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: online ? "#22c55e" : "#94a3b8", boxShadow: online ? "0 0 8px rgba(34,197,94,0.8)" : "none" }}></span>
                        {online ? "Online" : "Offline"}
                      </span>
                      <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>({u.role})</span>
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{u.email}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                      {u.departmentName ? `${u.departmentName}` : "Department not set"}
                      {u.level ? ` • ${u.level}` : " • level pending"}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                      Joined {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                      {u.lastLoginAt ? ` • Last login ${new Date(u.lastLoginAt).toLocaleDateString()}` : " • Never logged in"}
                      {u.lastSeenAt ? ` • Last seen ${new Date(u.lastSeenAt).toLocaleDateString()}` : ""}
                    </div>
                    <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "0.5rem", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                      <span>Library: {u.noteCount}</span>
                      <span>Requests: {u.requestCount}</span>
                      <span>Purchases: {u.purchaseCount}</span>
                      <span>Followers: {u.followingCount}</span>
                      <span>Reports: {u.reportCount}</span>
                    </div>
                    {isBanned && (
                      <div style={{ fontSize: "0.8rem", color: "var(--text-danger)", marginTop: "0.4rem" }}>
                        Banned {u.banExpiresAt ? `until ${new Date(u.banExpiresAt).toLocaleDateString()}` : "until further notice"}
                        {u.banReason && ` — "${u.banReason}"`}
                      </div>
                    )}
                  </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                    <button className="btn" onClick={() => openUserDetails(u.id)}>
                      <i className="fas fa-info-circle"></i> Details
                    </button>
                    {u.role === "ADMIN" ? (
                      <span className="btn" style={{ opacity: 0.7, cursor: "not-allowed" }}>
                        Admin protected
                      </span>
                    ) : isBanned ? (
                      <button className="btn" style={{ background: "var(--text-success)", borderColor: "var(--text-success)", color: "white" }} onClick={() => handleUnban(u.id)} disabled={busyId === u.id}>
                        <i className="fas fa-unlock"></i> Unban
                      </button>
                    ) : banningId === u.id ? null : (
                      <button className="btn" style={{ background: "var(--text-danger)", borderColor: "var(--text-danger)", color: "white" }} onClick={() => setBanningId(u.id)}>
                        <i className="fas fa-ban"></i> Ban
                      </button>
                    )}
                  </div>
                </div>

                {banningId === u.id && (
                  <div style={{ marginTop: "0.8rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    <textarea
                      value={banReason}
                      onChange={(e) => setBanReason(e.target.value)}
                      rows={2}
                      placeholder="Reason (optional) — included in their email"
                      style={{ padding: "0.5rem", borderRadius: "8px", border: "1px solid var(--border-blue)", fontFamily: "inherit", fontSize: "0.85rem" }}
                    />
                    <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Duration in days (leave blank for indefinite / until further notice)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={banDurationDays}
                      onChange={(e) => setBanDurationDays(e.target.value)}
                      placeholder="e.g. 90"
                      style={{ padding: "0.5rem", borderRadius: "8px", border: "1px solid var(--border-blue)", fontSize: "0.85rem" }}
                    />
                    <div style={{ display: "flex", gap: "0.6rem" }}>
                      <button
                        className="btn"
                        style={{ background: "var(--text-danger)", borderColor: "var(--text-danger)", color: "white" }}
                        onClick={() => handleBan(u.id)}
                        disabled={busyId === u.id}
                      >
                        {busyId === u.id ? "Banning..." : "Confirm ban"}
                      </button>
                      <button className="btn" onClick={() => setBanningId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {selectedUser && (
          <div className="admin-user-modal-overlay" onClick={() => setSelectedUser(null)}>
            <div className="admin-user-modal" onClick={(e) => e.stopPropagation()}>
              <div className="admin-user-modal-header">
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0 }}>{selectedUser.fullName}</h3>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>({selectedUser.role})</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.72rem", color: selectedUser.isOnline ? "#16a34a" : "var(--text-secondary)", fontWeight: 700 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: selectedUser.isOnline ? "#22c55e" : "#94a3b8" }}></span>
                    {selectedUser.isOnline ? "Online now" : "Offline"}
                  </span>
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{selectedUser.email}</div>
                <button className="btn admin-user-modal-close" onClick={() => setSelectedUser(null)}>Close</button>
              </div>

              <div className="admin-user-stat-grid">
                {[
                  { label: "Department", value: selectedUser.departmentName || "Not set" },
                  { label: "Level", value: selectedUser.level || "Pending" },
                  { label: "Joined", value: selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleDateString() : "—" },
                  { label: "Last login", value: selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleDateString() : "Never" },
                  { label: "Last seen", value: selectedUser.lastSeenAt ? new Date(selectedUser.lastSeenAt).toLocaleDateString() : "Never" },
                  { label: "Status", value: selectedUser.bannedAt ? "Banned" : "Active" },
                ].map((item) => (
                  <div key={item.label} className="admin-user-stat-card">
                    <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.label}</div>
                    <div style={{ marginTop: "0.35rem", fontWeight: 700 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="admin-user-detail-grid">
                <div style={{ background: "var(--surface-strong)", border: "1px solid var(--border-blue)", borderRadius: "12px", padding: "0.9rem" }}>
                  <h4 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>Purchases</h4>
                  {selectedUser.purchases.length === 0 ? <div style={{ color: "var(--text-secondary)" }}>No purchases yet.</div> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                      {selectedUser.purchases.map((p) => (
                        <div key={p.id} style={{ borderBottom: "1px solid var(--border-blue)", paddingBottom: "0.5rem" }}>
                          <div style={{ fontWeight: 700 }}>{p.title}</div>
                          <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>{p.courseCode} • {p.courseName}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Paid ₦{p.amountPaid.toLocaleString()} • {new Date(p.purchasedAt).toLocaleDateString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ background: "var(--surface-strong)", border: "1px solid var(--border-blue)", borderRadius: "12px", padding: "0.9rem" }}>
                  <h4 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>Requests</h4>
                  {selectedUser.requests.length === 0 ? <div style={{ color: "var(--text-secondary)" }}>No requests yet.</div> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                      {selectedUser.requests.map((r) => (
                        <div key={r.id} style={{ borderBottom: "1px solid var(--border-blue)", paddingBottom: "0.5rem" }}>
                          <div style={{ fontWeight: 700 }}>{r.requestedTitle}</div>
                          <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>{r.status} • {r.voteCount} vote{r.voteCount === 1 ? "" : "s"}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{new Date(r.createdAt).toLocaleDateString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ background: "var(--surface-strong)", border: "1px solid var(--border-blue)", borderRadius: "12px", padding: "0.9rem" }}>
                  <h4 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>Library</h4>
                  {selectedUser.notes.length === 0 ? <div style={{ color: "var(--text-secondary)" }}>No uploaded notes.</div> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                      {selectedUser.notes.map((n) => (
                        <div key={n.id} style={{ borderBottom: "1px solid var(--border-blue)", paddingBottom: "0.5rem" }}>
                          <div style={{ fontWeight: 700 }}>{n.title}</div>
                          <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>{n.courseCode || "General"} • {n.status}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{new Date(n.createdAt).toLocaleDateString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ background: "var(--surface-strong)", border: "1px solid var(--border-blue)", borderRadius: "12px", padding: "0.9rem" }}>
                  <h4 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>Following</h4>
                  {selectedUser.following.length === 0 ? <div style={{ color: "var(--text-secondary)" }}>Not following anyone yet.</div> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {selectedUser.following.map((person) => (
                        <div key={person.id} style={{ fontSize: "0.85rem" }}>{person.fullName} ({person.role})</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {detailsLoading && (
          <div style={{ marginTop: "1rem", color: "var(--text-secondary)" }}>Loading details…</div>
        )}
      </div>
    </div>
  );
}
