"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";

interface ScribeSummary {
  id: string;
  fullName: string;
  trustLevel: string;
  trustLabel: string;
  isFollowing?: boolean;
}

const TRUST_STYLES: Record<string, { bg: string; color: string }> = {
  NEW: { bg: "var(--bg-info)", color: "var(--text-secondary)" },
  RISING: { bg: "var(--bg-warning)", color: "var(--text-warning)" },
  TRUSTED: { bg: "var(--bg-success)", color: "var(--text-success)" },
  ELITE: { bg: "var(--bg-pro)", color: "var(--text-pro)" },
};

function TrustBadge({ level, label }: { level: string; label: string }) {
  const style = TRUST_STYLES[level] || TRUST_STYLES.NEW;
  return (
    <span
      style={{
        background: style.bg,
        color: style.color,
        padding: "0.15rem 0.7rem",
        borderRadius: "30px",
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

export default function FollowingPage() {
  const router = useRouter();
  const [following, setFollowing] = useState<ScribeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScribeSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }
    loadFollowing();
  }, [router]);

  function loadFollowing() {
    setLoading(true);
    apiFetch("/api/student/following")
      .then((data) => setFollowing(data.scribes))
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      apiFetch(`/api/scribes/search?q=${encodeURIComponent(query.trim())}`)
        .then((data) => setResults(data.scribes))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300); // debounce so we're not firing a request on every keystroke

    return () => clearTimeout(handle);
  }, [query]);

  async function handleToggleFollow(scribeId: string, currentlyFollowing: boolean) {
    setToggling(scribeId);
    try {
      await apiFetch(`/api/scribe/${scribeId}/follow`, { method: "POST" });
      setResults((prev) =>
        prev.map((s) => (s.id === scribeId ? { ...s, isFollowing: !currentlyFollowing } : s))
      );
      loadFollowing();
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="page-wrap">
      <div className="app-container" style={{ maxWidth: 560 }}>
        <div className="top-bar">
          <div className="logo" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Logo size={34} />
            <div>
              <h1>
                Veloce <span className="accent">.</span>
              </h1>
              <div className="logo-sub">Following</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn" onClick={() => router.push("/purchases")}>
              <i className="fas fa-arrow-left"></i> Purchases
            </button>
            <ProfileMenu />
          </div>
        </div>

        {/* Search to follow */}
        <h3 style={{ marginTop: "1.5rem", fontSize: "1.05rem" }}>
          <i className="fas fa-search" style={{ color: "var(--text-info)" }}></i> Find scribes to follow
        </h3>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name..."
          style={{ width: "100%", padding: "0.7rem", borderRadius: "0.7rem", border: "1px solid var(--border-blue)", marginTop: "0.6rem" }}
        />

        {searching && <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.5rem" }}>Searching...</p>}

        {results.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.7rem" }}>
            {results.map((s) => (
              <div
                key={s.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-blue)",
                  borderRadius: "0.9rem",
                  padding: "0.8rem 1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <button
                    onClick={() => router.push(`/scribe/${s.id}`)}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 600, color: "var(--text-primary)" }}
                  >
                    {s.fullName}
                  </button>
                  <div style={{ marginTop: "0.3rem" }}>
                    <TrustBadge level={s.trustLevel} label={s.trustLabel} />
                  </div>
                </div>
                <button
                  className={`btn ${s.isFollowing ? "" : "btn-primary"}`}
                  onClick={() => handleToggleFollow(s.id, Boolean(s.isFollowing))}
                  disabled={toggling === s.id}
                >
                  {s.isFollowing ? "Following" : "Follow"}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Currently following */}
        <h3 style={{ marginTop: "1.8rem", fontSize: "1.05rem" }}>
          <i className="fas fa-user-check" style={{ color: "var(--text-info)" }}></i> Scribes you follow
        </h3>

        {loading && <SkeletonList rows={3} />}
        {error && <div className="auth-error" style={{ marginTop: "0.6rem" }}>{error}</div>}
        {!loading && !error && following.length === 0 && (
          <p style={{ color: "var(--text-secondary)", marginTop: "0.6rem" }}>
            You're not following anyone yet — search above to find scribes.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.7rem" }}>
          {following.map((s) => (
            <button
              key={s.id}
              onClick={() => router.push(`/scribe/${s.id}`)}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-blue)",
                borderRadius: "0.9rem",
                padding: "0.8rem 1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{s.fullName}</span>
              <TrustBadge level={s.trustLevel} label={s.trustLabel} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
