"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { timeAgo } from "@/lib/time-ago";
import { Icon } from "@/app/components/icons";
import Avatar from "@/app/components/Avatar";
import Pager from "@/app/components/Pager";
import { SkeletonList } from "@/app/components/Skeleton";
import { CATEGORIES, type CategoryId } from "@/lib/badges";
import "./leaderboard.css";

type Scope = "global" | "school" | "department";
type Period = "all" | "semester";
type Category = "overall" | Lowercase<CategoryId>;

// Overall first, then the five badge categories (same names as the badges).
const CATEGORY_TABS: { id: Category; label: string }[] = [
  { id: "overall", label: "Overall" },
  ...(Object.keys(CATEGORIES) as CategoryId[]).map((c) => ({ id: c.toLowerCase() as Category, label: CATEGORIES[c].name })),
];

interface Entry {
  rank: number;
  scribeId: string;
  name: string;
  avatarUrl: string | null;
  university: string;
  department: string | null;
  score: number;
  isMe: boolean;
  canOpenProfile: boolean;
}

interface Me {
  finalScore: number;
  ranks: { department: number | null; school: number | null; global: number | null };
  // Place in the overall ranking and in each category, for the scope and period shown.
  categoryRanks: Record<Category, number | null>;
  points: { rating: number; purchases: number; reads: number; followers: number; growth: number };
  rankChange: number | null;
  scoreChange: number | null;
  moved: { metric: string; delta: number }[];
}

interface Pagination {
  page: number;
  pageSize: number;
  totalPages: number;
  totalMatching: number;
}

interface LeaderboardData {
  scope: Scope;
  period: Period;
  category: Category;
  showGlobal: boolean;
  hasDepartment: boolean;
  semester: { label: string } | null;
  viewerIsScribe: boolean;
  updatedAt: string | null;
  entries: Entry[];
  me: Me | null;
  pagination: Pagination;
}

const SCOPE_LABEL: Record<Scope, string> = { global: "Global", school: "My school", department: "My department" };
const POINT_ROWS: { key: keyof Me["points"]; label: string; category: Category }[] = [
  { key: "rating", label: "Rating", category: "rating" },
  { key: "purchases", label: "Purchases", category: "seller" },
  { key: "reads", label: "Notes read", category: "read" },
  { key: "followers", label: "Followers", category: "followed" },
  { key: "growth", label: "Growth", category: "growth" },
];

const fmt = (n: number) => n.toFixed(2);
const signed = (n: number) => `${n > 0 ? "+" : ""}${fmt(n)}`;

export default function LeaderboardPage() {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("school");
  const [period, setPeriod] = useState<Period>("all");
  const [category, setCategory] = useState<Category>("overall");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }
    setIsAdmin(user.role === "ADMIN");
  }, [router]);

  // Admins only: rebuild the rankings now instead of waiting for the daily refresh.
  async function refreshRankings() {
    setRefreshing(true);
    setRefreshMessage("");
    try {
      await apiFetch("/api/admin/leaderboard/refresh", { method: "POST" });
      setReloadTick((t) => t + 1);
      setRefreshMessage("Rankings refreshed.");
    } catch (err) {
      setRefreshMessage(friendlyErrorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiFetch<LeaderboardData>(`/api/leaderboard?scope=${scope}&period=${period}&category=${category}&page=${page}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // The server may fall back to another scope / clamp the page.
        if (d.scope !== scope) setScope(d.scope);
        if (d.pagination.page !== page) setPage(d.pagination.page);
        setPageInput(String(d.pagination.page));
      })
      .catch((err) => !cancelled && setError(friendlyErrorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [scope, period, category, page, reloadTick]);

  function pick(next: { scope?: Scope; period?: Period; category?: Category }) {
    if (next.scope) setScope(next.scope);
    if (next.period) setPeriod(next.period);
    if (next.category) setCategory(next.category);
    setPage(1);
  }

  function goToPage(n: number) {
    const total = data?.pagination.totalPages ?? 1;
    const target = Math.min(Math.max(1, Math.floor(n) || 1), total);
    setPageInput(String(target));
    if (target !== page) setPage(target);
  }

  const pagination = data?.pagination;
  const pager = (position: "top" | "bottom") =>
    pagination && (
      <Pager
        position={position}
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalMatching={pagination.totalMatching}
        noun="scribe"
        pageInput={pageInput}
        setPageInput={setPageInput}
        goToPage={goToPage}
        disabled={loading}
      />
    );

  const myRank = data?.me ? data.me.categoryRanks[data.category] : null;
  const categoryName = CATEGORY_TABS.find((c) => c.id === data?.category)?.label ?? "Overall";
  const showPager = !!pagination && pagination.totalMatching > 0;

  return (
    <div className="page-wrap student-page">
      <div className="app-container student-app-container">
        <section className="page-view is-active">
          <div className="page-header">
            <div className="page-header-left">
              <span className="eyebrow">Scribes</span>
              <h1>
                Scribe <span className="serif">leaderboard</span>
              </h1>
              <p>
                Ranked on sustained quality and sales across many notes, not one lucky hit. <Link href="/badges">See the badges you can earn</Link>
              </p>
            </div>
          </div>

          {data && (
            <div className="lb-controls">
              <div className="tabs" role="tablist" aria-label="Section">
                {(["global", "school", "department"] as Scope[])
                  .filter((s) => (s === "global" ? data.showGlobal : s === "department" ? data.hasDepartment : true))
                  .map((s) => (
                    <button key={s} role="tab" aria-selected={scope === s} className={`tab${scope === s ? " is-active" : ""}`} onClick={() => pick({ scope: s })}>
                      {SCOPE_LABEL[s]}
                    </button>
                  ))}
              </div>
              <div className="tabs" role="tablist" aria-label="Time frame">
                <button role="tab" aria-selected={period === "all"} className={`tab${period === "all" ? " is-active" : ""}`} onClick={() => pick({ period: "all" })}>
                  All-time
                </button>
                <button role="tab" aria-selected={period === "semester"} className={`tab${period === "semester" ? " is-active" : ""}`} onClick={() => pick({ period: "semester" })}>
                  This semester{data.semester ? ` · ${data.semester.label}` : ""}
                </button>
              </div>
            </div>
          )}

          {data && (
            <div className="lb-categories" role="tablist" aria-label="Ranking by">
              {CATEGORY_TABS.map((c) => (
                <button key={c.id} role="tab" aria-selected={category === c.id} className={`btn btn-sm ${category === c.id ? "btn-primary" : "btn-ghost"}`} onClick={() => pick({ category: c.id })}>
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {error && <div className="auth-error mb-24">{error}</div>}

          {data?.me && (
            <div className="panel lb-me mb-24">
              <div className="lb-me-top">
                <div>
                  <div className="lb-me-label">
                    Your rank · {SCOPE_LABEL[data.scope].toLowerCase()} · {categoryName.toLowerCase()}
                  </div>
                  <div className="lb-me-rank">{myRank != null ? `#${myRank}` : "—"}</div>
                </div>
                <div className="lb-me-score">
                  <div className="lb-me-label">{data.category === "overall" ? "Score" : "Points"}</div>
                  <div className="lb-me-rank">{fmt(data.category === "overall" ? data.me.finalScore : data.me.points[POINT_ROWS.find((r) => r.category === data.category)!.key])}</div>
                </div>
              </div>
              {data.category !== "overall" && myRank == null && (
                <p className="panel-desc" style={{ margin: "12px 0 0" }}>
                  You have no points in {categoryName} yet, so you are not ranked here.
                </p>
              )}
              {data.category === "overall" && data.me.rankChange != null && (
                <p className="panel-desc lb-change" style={{ margin: "12px 0 0" }}>
                  {data.me.rankChange > 0 ? `Up ${data.me.rankChange} place${data.me.rankChange === 1 ? "" : "s"}` : data.me.rankChange < 0 ? `Down ${-data.me.rankChange} place${data.me.rankChange === -1 ? "" : "s"}` : "Same place as last update"}
                  {data.me.moved.length > 0 && <> — {data.me.moved.map((m) => `${m.metric} ${signed(m.delta)}`).join(", ")}</>}
                </p>
              )}
              <div className="lb-breakdown">
                {POINT_ROWS.map((r) => {
                  const place = data.me!.categoryRanks[r.category];
                  return (
                    <button key={r.key} type="button" className={`lb-breakdown-item${data.category === r.category ? " is-active" : ""}`} onClick={() => pick({ category: r.category })} title={`Show the ${CATEGORY_TABS.find((c) => c.id === r.category)?.label} ranking`}>
                      <span>{r.label}</span>
                      <strong>{fmt(data.me!.points[r.key])}</strong>
                      <span className="lb-breakdown-rank">{place != null ? `#${place}` : "Not ranked"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {data && !data.me && data.viewerIsScribe && !loading && (
            <div className="notice mb-24">You are not ranked here yet. Scribes appear once they have at least one live note.</div>
          )}

          {loading && !data ? (
            <SkeletonList rows={6} />
          ) : (
            data && (
              <div className="panel" style={{ opacity: loading ? 0.6 : 1 }}>
                <div className="lb-updated-row">
                  <p className="panel-desc" style={{ margin: 0 }}>
                    {data.updatedAt ? `Updated ${timeAgo(data.updatedAt)}. ` : ""}Rankings refresh daily, and shortly after a scribe's note goes live.
                  </p>
                  {isAdmin && (
                    <button className="btn btn-ghost btn-sm" onClick={refreshRankings} disabled={refreshing}>
                      {refreshing ? "Refreshing…" : "Refresh rankings now"}
                    </button>
                  )}
                </div>
                {refreshMessage && <div className="notice">{refreshMessage}</div>}
                {showPager && pager("top")}

                {data.entries.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">{Icon.trophy()}</div>
                    <div className="empty-title">{data.period === "semester" && !data.semester ? "No semester yet" : data.category !== "overall" ? `Nobody has ${categoryName} points yet` : "No ranked scribes yet"}</div>
                    <div className="empty-desc">
                      {data.period === "semester" && !data.semester
                        ? "Your school has not started a semester, so there is no semester ranking."
                        : "Scribes show up here once they have a live note."}
                    </div>
                  </div>
                ) : (
                  <ol className="lb-list">
                    {data.entries.map((e) => {
                      const inner = (
                        <>
                          <span className={`lb-rank${e.rank <= 3 ? ` lb-rank-${e.rank}` : ""}`}>{e.rank}</span>
                          <Avatar name={e.name} imageUrl={e.avatarUrl} size="sm" enlargeOnTap={false} />
                          <span className="lb-who">
                            <span className="lb-name">
                              {e.name}
                              {e.isMe && <span className="chip lb-you">You</span>}
                            </span>
                            <span className="lb-meta">{[data.scope === "global" ? e.university : null, e.department].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span className="lb-score">{fmt(e.score)}</span>
                          {e.canOpenProfile && (
                            <span className="lb-view" aria-hidden="true">
                              <span className="lb-view-text">View profile</span> ›
                            </span>
                          )}
                        </>
                      );
                      return (
                        <li key={e.scribeId} className={`lb-row${e.isMe ? " is-me" : ""}`}>
                          {e.canOpenProfile ? (
                            <Link href={`/scribe/${e.scribeId}`} className="lb-row-link">
                              {inner}
                            </Link>
                          ) : (
                            <div className="lb-row-link">{inner}</div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}

                {showPager && pager("bottom")}
              </div>
            )
          )}
        </section>
      </div>
    </div>
  );
}
