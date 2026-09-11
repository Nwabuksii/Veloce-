"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
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
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
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
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      apiFetch(`/api/admin/users/search?q=${encodeURIComponent(query.trim())}`)
        .then((data) => setResults(data.users))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  function refreshOne(id: string) {
    apiFetch(`/api/admin/users/search?q=${encodeURIComponent(query.trim())}`)
      .then((data) => setResults(data.users))
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
        <div className="top-bar">
          <div className="logo" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Logo size={34} />
            <div>
              <h1>
                Veloce <span className="accent">.</span>
              </h1>
              <div className="logo-sub">Manage users</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn" onClick={() => router.push("/admin")}>
              <i className="fas fa-arrow-left"></i> Applications
            </button>
            <ProfileMenu />
          </div>
        </div>

        <p style={{ color: "var(--text-secondary)", marginTop: "1rem", fontSize: "0.9rem" }}>
          Search any student, scribe, or admin at your university to ban or unban their account. Banning never
          touches a scribe's uploads, sales, or earnings — it only blocks them from logging in (and immediately
          cuts off any session they're already using).
        </p>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email..."
          style={{ width: "100%", maxWidth: 420, padding: "0.7rem", borderRadius: "0.7rem", border: "1px solid var(--border-blue)", marginTop: "1rem" }}
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
                  borderRadius: "1rem",
                  padding: "1rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.6rem" }}>
                  <div>
                    <strong>{u.fullName}</strong>{" "}
                    <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>({u.role})</span>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{u.email}</div>
                    {isBanned && (
                      <div style={{ fontSize: "0.8rem", color: "var(--text-danger)", marginTop: "0.4rem" }}>
                        Banned {u.banExpiresAt ? `until ${new Date(u.banExpiresAt).toLocaleDateString()}` : "until further notice"}
                        {u.banReason && ` — "${u.banReason}"`}
                      </div>
                    )}
                  </div>

                  {isBanned ? (
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
                      style={{ padding: "0.5rem", borderRadius: "0.6rem", border: "1px solid var(--border-blue)", fontFamily: "inherit", fontSize: "0.85rem" }}
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
                      style={{ padding: "0.5rem", borderRadius: "0.6rem", border: "1px solid var(--border-blue)", fontSize: "0.85rem" }}
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
