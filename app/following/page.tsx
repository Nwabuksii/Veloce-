"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { Icon } from "@/app/components/icons";
import Avatar from "@/app/components/Avatar";

interface ScribeSummary {
  id: string;
  fullName: string;
  trustLevel: string;
  trustLabel: string;
  isFollowing?: boolean;
  avatarUrl?: string | null;
}

function toneFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `a${(Math.abs(hash) % 5) + 1}`;
}
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
function trustClass(level: string): string {
  const map: Record<string, string> = { ELITE: "elite", TRUSTED: "trusted", RISING: "trusted", NEW: "new" };
  return map[level] || "new";
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
    apiFetch<{ scribes: ScribeSummary[] }>("/api/student/following")
      .then((data) => setFollowing(data.scribes || []))
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      apiFetch<{ scribes: ScribeSummary[] }>(`/api/scribes/search?q=${encodeURIComponent(query.trim())}`)
        .then((data) => setResults(data.scribes || []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);

    return () => clearTimeout(handle);
  }, [query]);

  async function handleToggleFollow(scribeId: string, currentlyFollowing: boolean) {
    setToggling(scribeId);
    try {
      await apiFetch(`/api/scribe/${scribeId}/follow`, { method: "POST" });
      setResults((prev) => prev.map((s) => (s.id === scribeId ? { ...s, isFollowing: !currentlyFollowing } : s)));
      loadFollowing();
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setToggling(null);
    }
  }

  function card(s: ScribeSummary, action: "follow" | "open") {
    const tone = toneFor(s.fullName);
    return (
      <div className="scribe-card" key={s.id}>
        <button className="scribe-avatar scribe-name-button" onClick={() => router.push(`/scribe/${s.id}`)} aria-label={`Open ${s.fullName}`}>
          <Avatar name={s.fullName} imageUrl={s.avatarUrl} size="md" enlargeOnTap={false} />
        </button>
        <div className="scribe-info">
          <div className="scribe-name-row">
            <button className="scribe-name scribe-name-button" onClick={() => router.push(`/scribe/${s.id}`)}>
              {s.fullName}
            </button>
            <span className={`trust ${trustClass(s.trustLevel)}`}>{s.trustLabel}</span>
          </div>
          <div className="scribe-stats">
            <span>{action === "follow" && s.isFollowing ? "Already following" : action === "open" ? "Following" : "Scribe profile"}</span>
          </div>
        </div>

        {action === "follow" ? (
          <button
            className={`btn btn-sm ${s.isFollowing ? "btn-ghost" : "btn-primary"}`}
            onClick={() => handleToggleFollow(s.id, Boolean(s.isFollowing))}
            disabled={toggling === s.id}
          >
            {s.isFollowing ? "Following" : "Follow"}
          </button>
        ) : (
          <button className="btn btn-sm btn-ghost" onClick={() => router.push(`/scribe/${s.id}`)}>
            View profile {Icon.arrow()}
          </button>
        )}
      </div>
    );
  }

  const followCount = following.length;

  return (
    <div className="page-wrap student-page">
      <div className="app-container student-app-container">
        <section className="page-view is-active">
          <div className="page-header">
            <div className="page-header-left">
              <span className="eyebrow">Your Network</span>
              <h1>
                Scribes you <span className="serif">follow</span>
              </h1>
              <p>Get notified the moment they publish. Follow the people whose notes actually helped you.</p>
            </div>
            <div className="page-header-right">
              <div className="stat-strip">
                <div className="stat">
                  <div className="stat-num">{followCount}</div>
                  <div className="stat-label">Following</div>
                </div>
                <div className="stat">
                  <div className="stat-num">{results.length || "—"}</div>
                  <div className="stat-label">Search results</div>
                </div>
              </div>
              <div className="header-actions">
                <button className="btn btn-ghost" onClick={() => router.push("/purchases")}>
                  {Icon.back()} My Purchases
                </button>
              </div>
            </div>
          </div>

          <div className="follow-search-bar">
            <div className="search-field">
              {Icon.search()}
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search scribes by name…" aria-label="Search scribes" />
            </div>
          </div>

          {query.trim().length >= 2 && (
            <section className="follow-panel">
              <div className="follow-panel-heading">
                <h2 className="panel-title">{Icon.search()} Find scribes</h2>
              </div>
              {searching && <SkeletonList rows={2} />}
              {!searching && results.length === 0 && <div className="empty-state" style={{ padding: "36px 20px" }}><div className="empty-icon">{Icon.search()}</div><h3 className="empty-title">No scribes found</h3><p className="empty-desc">Try a different name.</p></div>}
              {!searching && results.length > 0 && <div className="scribe-list">{results.map((s) => card(s, "follow"))}</div>}
            </section>
          )}

          <section className="follow-panel">
            <div className="follow-panel-heading">
              <h2 className="panel-title">{Icon.user()} Scribes you follow</h2>
              <span className="badge">{followCount}</span>
            </div>

            {loading && <SkeletonList rows={3} />}
            {error && <div className="auth-error">{error}</div>}
            {!loading && !error && following.length === 0 && (
              <div className="empty-state" style={{ padding: "40px 20px" }}>
                <div className="empty-icon">{Icon.user()}</div>
                <h3 className="empty-title">Not following anyone yet</h3>
                <p className="empty-desc">Search above to find scribes and follow the ones whose notes you want to keep up with.</p>
              </div>
            )}
            {!loading && !error && following.length > 0 && <div className="scribe-list">{following.map((s) => card(s, "open"))}</div>}
          </section>
        </section>
      </div>
    </div>
  );
}
