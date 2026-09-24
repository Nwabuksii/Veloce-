"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import Avatar from "@/app/components/Avatar";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { formatDateDDMMYYYY } from "@/lib/date-format";

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
  noteCount: number;
  purchaseCount: number;
  requestCount: number;
  followingCount: number;
  reportCount: number;
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

  const [banningId, setBanningId] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banDurationDays, setBanDurationDays] = useState(""); // empty = indefinite

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
            return (
              <div
                key={u.id}
                style={{
                  background: "var(--surface)",
                  border: isBanned ? "2px solid var(--text-danger)" : "1px solid var(--border-blue)",
                  borderRadius: "12px",
                  padding: "1rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.6rem" }}>
                  <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
                  <Avatar name={u.fullName} imageUrl={u.avatarUrl} size="sm" />
                  <div>
                    <strong>{u.fullName}</strong>{" "}
                    <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>({u.role})</span>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{u.email}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                      {u.departmentName ? `${u.departmentName}` : "Department not set"}
                      {u.level ? ` • ${u.level}` : " • level pending"}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                      Joined {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                      {u.lastLoginAt ? ` • Last login ${new Date(u.lastLoginAt).toLocaleDateString()}` : " • Never logged in"}
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
      </div>
    </div>
  );
}
