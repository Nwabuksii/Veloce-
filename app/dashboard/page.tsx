"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getStoredUser, StoredUser } from "@/lib/client-session";
import { Icon } from "@/app/components/icons";
import { friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { SkeletonList } from "@/app/components/Skeleton";
import CouponConfirmDialog from "@/app/components/CouponConfirmDialog";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { CAMPUS } from "@/lib/campus";
import { LEVELS, matchesLevelFilter, inferLevelFromCourseCode } from "@/lib/academic";

interface BlockView {
  id: string;
  title: string;
  price: number;
  discountedPrice: number | null;
  courseName: string;
  courseCode: string;
  universityName: string;
  unlocked: boolean;
  topics: string[];
  scribeId: string | null;
  scribeName: string | null;
  scribeLevel: string | null;
  purchaseCount: number;
  featuredNoteId: string | null;
  liveNoteCount: number;
  ratingAvg: number | null;
  ratingCount: number;
}

interface NoteOption {
  noteId: string;
  scribeId: string;
  scribeName: string;
  trustLevel: "NEW" | "RISING" | "TRUSTED" | "ELITE";
  trustLabel: string;
  noteAvgRating: number | null;
  noteRatingCount: number;
  owned: boolean;
}

type SortKey = "rating" | "versions" | "price";

const MAX_PROGRAM_TABS = 6;

// Course codes are the only grouping data every course reliably has (scribes
// name their own courses, all under one department), so the "program" tabs
// and the level filter are read straight off the code: "COS 201" → COS, 200L.
function programOf(code: string): string {
  return (code.match(/^[A-Za-z]+/)?.[0] ?? code).toUpperCase();
}

function levelOf(code: string): string | null {
  return inferLevelFromCourseCode(code);
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// One of the template's five book-spine tones, chosen stably from the name.
function scribeTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `a${(Math.abs(hash) % 5) + 1}`;
}

function CatalogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(search);

  const [user, setUser] = useState<StoredUser | null>(null);
  const [blocks, setBlocks] = useState<BlockView[]>([]);
  const [program, setProgram] = useState("");
  const [level, setLevel] = useState("");
  const [sort, setSort] = useState<SortKey>("rating");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pickerBlock, setPickerBlock] = useState<BlockView | null>(null);
  const [pickerNotes, setPickerNotes] = useState<NoteOption[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTrustFilter, setPickerTrustFilter] = useState("");
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [pendingCouponBuy, setPendingCouponBuy] = useState<{ block: BlockView; noteId?: string } | null>(null);
  const [selfBuy, setSelfBuy] = useState<{ block: BlockView; noteId?: string } | null>(null);
  const [couponConfirming, setCouponConfirming] = useState(false);

  // Typing in the search field updates the URL (?q=) after a short pause;
  // the fetch below reacts to that, so links to a search still work.
  useEffect(() => {
    const t = setTimeout(() => {
      const term = searchInput.trim();
      if (term !== search.trim()) router.replace(term ? `/dashboard?q=${encodeURIComponent(term)}` : "/dashboard");
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search, router]);

  // The search term lives in the URL (?q=), so this page just reacts to it.
  useEffect(() => {
    const storedUser = getStoredUser();
    if (!storedUser) {
      router.push("/login");
      return;
    }
    setUser(storedUser);

    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());

    fetch(`/api/blocks?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load blocks");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setBlocks(data.blocks);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [search, router]);

  useEffect(() => {
    fetch("/api/account")
      .then((res) => res.json())
      .then((data) => setCreditBalance(data.user?.creditBalance ?? 0))
      .catch(() => setCreditBalance(0));
  }, []);

  // Most common course prefixes first, capped so the tab row stays a row.
  const programs = useMemo(() => {
    const counts = new Map<string, number>();
    blocks.forEach((b) => {
      const p = programOf(b.courseCode);
      counts.set(p, (counts.get(p) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_PROGRAM_TABS)
      .map(([p]) => p);
  }, [blocks]);

  // A new search can drop the selected program out of the results.
  useEffect(() => {
    if (program && !programs.includes(program)) setProgram("");
  }, [programs, program]);

  const visible = useMemo(() => {
    const list = blocks.filter((b) => {
      const byProgram = !program || programOf(b.courseCode) === program;
      const byLevel = matchesLevelFilter({ level: (b as BlockView & { level?: string | null }).level, courseCode: b.courseCode }, level);
      return byProgram && byLevel;
    });
    if (sort === "rating") {
      list.sort((a, b) => (b.ratingAvg ?? -1) - (a.ratingAvg ?? -1) || b.ratingCount - a.ratingCount);
    } else if (sort === "versions") {
      list.sort((a, b) => b.liveNoteCount - a.liveNoteCount);
    } else {
      list.sort((a, b) => (a.discountedPrice ?? a.price) - (b.discountedPrice ?? b.price));
    }
    return list;
  }, [blocks, program, level, sort]);

  async function handlePurchaseClick(block: BlockView, noteId?: string, confirmSelfPurchase = false) {
    try {
      const res = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId: block.id, noteId, confirmSelfPurchase }),
      });
      const data = await res.json();

      if (!res.ok) {
        // The server asks for a second "yes" when a scribe buys their own note.
        if (data.needsSelfPurchaseConfirm) {
          setSelfBuy({ block, noteId });
          return;
        }
        toast.error(data.error || "Could not start checkout");
        return;
      }

      if (data.freeViaCoupon) {
        toast.success("Credit used — no charge!");
        router.push(`/payment/complete?purchase=${data.purchaseId}`);
        return;
      }

      window.location.href = data.authorizationUrl; // off to real Paystack checkout
    } catch {
      toast.error("Something went wrong starting checkout. Try again.");
    }
  }

  // A coupon purchase skips Paystack entirely, so there's no external
  // checkout page to give someone a natural "wait, cancel that" moment —
  // this dialog is that moment. Real (non-coupon) purchases go straight
  // through, since Paystack's own page already provides that pause.
  function handleBuyClick(block: BlockView, noteId?: string) {
    if (creditBalance != null && creditBalance > 0) {
      setPendingCouponBuy({ block, noteId });
      return;
    }
    handlePurchaseClick(block, noteId);
  }

  async function confirmCouponBuy() {
    if (!pendingCouponBuy) return;
    setCouponConfirming(true);
    await handlePurchaseClick(pendingCouponBuy.block, pendingCouponBuy.noteId);
    setCouponConfirming(false);
    setPendingCouponBuy(null);
  }

  async function openVersionPicker(block: BlockView) {
    setPickerBlock(block);
    setPickerSearch("");
    setPickerTrustFilter("");
    setPickerLoading(true);
    try {
      const res = await fetch(`/api/blocks/${block.id}/notes`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load versions");
      setPickerNotes(data.notes || []);
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
      setPickerBlock(null);
    } finally {
      setPickerLoading(false);
    }
  }

  const hasCredit = creditBalance != null && creditBalance > 0;
  const totalLiveNotes = blocks.reduce((sum, b) => sum + b.liveNoteCount, 0);
  const totalScribes = new Set(blocks.map((b) => b.scribeId).filter(Boolean)).size;

  return (
    <div className="page-wrap student-page student-dashboard-page">
      <div className="page-header">
        <div className="page-header-left">
          <span className="eyebrow">{CAMPUS.name} · Catalogue</span>
          <h1>
            Browse <span className="serif">Notes</span>
          </h1>
          <p>Verified peer lecture notes and study packs, curated per course block. Every note is watermarked to its buyer.</p>
        </div>
        <div className="page-header-right">
          <div className="stat-strip">
            <div className="stat">
              <div className="stat-num">{blocks.length.toLocaleString()}</div>
              <div className="stat-label">Course blocks</div>
            </div>
            <div className="stat">
              <div className="stat-num">{totalLiveNotes.toLocaleString()}</div>
              <div className="stat-label">Live notes</div>
            </div>
            <div className="stat">
              <div className="stat-num">{totalScribes.toLocaleString()}</div>
              <div className="stat-label">Active scribes</div>
            </div>
          </div>
          <div className="header-actions">
            <Link href={user?.role === "STUDENT" ? "/scribe/apply" : "/scribe"} className="btn">
              {user?.role === "STUDENT" ? "Become a Scribe" : "Scribe Studio"}
              <span style={{ display: "inline-flex", width: 14, height: 14 }}>{Icon.arrow()}</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <form className="search-field" role="search" onSubmit={(e) => e.preventDefault()}>
          {Icon.search()}
          <input
            type="search"
            name="q"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by course code, title, or department…"
            aria-label="Search notes"
          />
        </form>

        <div className="tabs">
          <button className={`tab${program === "" ? " is-active" : ""}`} onClick={() => setProgram("")}>
            All Courses
          </button>
          {programs.map((p) => (
            <button key={p} className={`tab${program === p ? " is-active" : ""}`} onClick={() => setProgram(p)}>
              {p}
            </button>
          ))}
        </div>

        <div className="filter-selects">
          <select className="select-plain" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Filter by level">
            <option value="">All Levels</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select className="select-plain" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort notes">
            <option value="rating">Top Rated</option>
            <option value="versions">Most Versions</option>
            <option value="price">Lowest Price</option>
          </select>
        </div>
      </div>

      <div className="result-meta">
        <div>
          Showing <strong>{visible.length}</strong> of <strong>{blocks.length}</strong> course blocks
        </div>
      </div>

      {loading && <SkeletonList rows={3} />}
      {error && <div className="auth-error">{error}</div>}

      <div className="catalog-grid">
        {!loading && !error && visible.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">{Icon.search()}</div>
            <h3 className="empty-title">{search || program || level ? "No notes found" : "No notes published yet"}</h3>
            <p className="empty-desc">
              {search || program || level
                ? "Try a different search term or clear your filters."
                : "Check back soon — new notes are added all the time."}
            </p>
          </div>
        )}

        {visible.map((block) => {
          const effectivePrice = block.discountedPrice ?? block.price;
          const hasDiscount = block.discountedPrice != null && block.discountedPrice < block.price;
          const blockLevel = levelOf(block.courseCode);
          const topicsShown = block.topics.slice(0, 3);
          const topicsExtra = block.topics.length - topicsShown.length;
          const openBlock = () =>
            router.push(block.featuredNoteId ? `/blocks/${block.id}?note=${block.featuredNoteId}` : `/blocks/${block.id}`);

          return (
            <article
              key={block.id}
              className="course-card"
              tabIndex={0}
              onClick={openBlock}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.target === e.currentTarget) openBlock();
              }}
            >
              {hasDiscount && <span className="ribbon">Requested</span>}

              <div className="card-head">
                <span className="course-code">
                  {block.courseCode}
                  {blockLevel && (
                    <>
                      <span className="dot" />
                      <span className="level">{blockLevel}</span>
                    </>
                  )}
                </span>
                {block.unlocked ? (
                  <span className="trust good">Unlocked</span>
                ) : (
                  <span className="trust new">
                    {block.liveNoteCount} {block.liveNoteCount === 1 ? "version" : "versions"}
                  </span>
                )}
              </div>

              <h3 className="course-title">{block.title}</h3>
              <p className="course-dept">{block.courseName}</p>

              {block.topics.length > 0 && (
                <div className="topics">
                  {topicsShown.map((t) => (
                    <span key={t} className="topic">
                      {t}
                    </span>
                  ))}
                  {topicsExtra > 0 && <span className="topic more">+{topicsExtra}</span>}
                </div>
              )}

              <div className="scribes-row">
                {block.scribeName ? (
                  <div className="avatar-stack">
                    <span className={`avatar-sm scribe-dot ${scribeTone(block.scribeName)}`}>{initialsOf(block.scribeName)}</span>
                    <button
                      className="scribe-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/scribe/${block.scribeId}`);
                      }}
                    >
                      {block.scribeName}
                      {block.scribeLevel ? ` (${block.scribeLevel})` : ""}
                    </button>
                  </div>
                ) : (
                  <span />
                )}
                <span className="rating">
                  {block.ratingAvg != null ? (
                    <>
                      {Icon.star()} <strong>{block.ratingAvg.toFixed(1)}</strong> · {block.ratingCount}
                    </>
                  ) : (
                    "No ratings yet"
                  )}
                </span>
              </div>

              <div className="card-foot">
                <div className="price">
                  <span className="price-label">{hasDiscount ? "Requested price" : "Price"}</span>
                  <span className={`price-amount${hasDiscount ? " is-good" : ""}`}>
                    <span className="currency">₦</span>
                    {effectivePrice.toLocaleString()}
                  </span>
                  {hasDiscount && <span className="price-was">₦{block.price.toLocaleString()}</span>}
                  {!block.unlocked && hasCredit && (
                    <span className="credit-note">
                      {(creditBalance ?? 0) >= effectivePrice
                        ? "Free with credit"
                        : `−₦${(creditBalance ?? 0).toLocaleString()} credit`}
                    </span>
                  )}
                </div>

                {block.liveNoteCount > 1 ? (
                  <button
                    className="browse-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      openVersionPicker(block);
                    }}
                  >
                    View versions
                    <span style={{ display: "inline-flex", width: 14, height: 14 }}>{Icon.arrow()}</span>
                  </button>
                ) : block.unlocked ? (
                  <button
                    className="browse-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      openBlock();
                    }}
                  >
                    View notes
                    <span style={{ display: "inline-flex", width: 14, height: 14 }}>{Icon.arrow()}</span>
                  </button>
                ) : (
                  <button
                    className="browse-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBuyClick(block);
                    }}
                  >
                    {hasCredit ? "Use credit" : "Unlock notes"}
                    <span style={{ display: "inline-flex", width: 14, height: 14 }}>{Icon.arrow()}</span>
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {pickerBlock && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setPickerBlock(null)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "1rem",
              border: "1px solid var(--border)",
              boxShadow: "var(--menu-shadow)",
              padding: "1.5rem",
              width: "min(480px, 92vw)",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>{pickerBlock.title} — choose a version</h3>
              <button
                className="btn"
                onClick={() => setPickerBlock(null)}
                style={{ padding: "0.3rem 0.7rem" }}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.3rem" }}>
              Multiple scribes have submitted notes for this block. They&apos;re all the same price — you can
              own more than one version if you want a second opinion.
            </p>

            <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.8rem", flexWrap: "wrap" }}>
              <input
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search scribe name..."
                style={{
                  flex: "1 1 180px",
                  padding: "0.5rem 0.8rem",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border)",
                  fontSize: "0.82rem",
                }}
              />
              <select
                value={pickerTrustFilter}
                onChange={(e) => setPickerTrustFilter(e.target.value)}
                style={{
                  padding: "0.5rem 0.8rem",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border)",
                  fontSize: "0.82rem",
                  background: "var(--surface)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="">Any trust level</option>
                <option value="ELITE">Elite Scribe</option>
                <option value="TRUSTED">Trusted Scribe</option>
                <option value="RISING">Rising Scribe</option>
                <option value="NEW">New Scribe</option>
              </select>
            </div>

            {pickerLoading && <div style={{ marginTop: "1rem" }}><SkeletonList rows={2} /></div>}

            {(() => {
              const filtered = pickerNotes.filter((n) => {
                const matchesSearch = n.scribeName.toLowerCase().includes(pickerSearch.trim().toLowerCase());
                const matchesTrust = !pickerTrustFilter || n.trustLevel === pickerTrustFilter;
                return matchesSearch && matchesTrust;
              });

              if (!pickerLoading && filtered.length === 0) {
                return (
                  <p style={{ marginTop: "1rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                    No scribes match that search.
                  </p>
                );
              }

              return (
                <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                  {filtered.map((n) => (
                    <div
                      key={n.noteId}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "0.75rem",
                        padding: "0.8rem 1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.8rem",
                      }}
                    >
                      <div>
                        <button
                          onClick={() => router.push(`/scribe/${n.scribeId}`)}
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 600, color: "var(--text-primary)" }}
                        >
                          {n.scribeName}
                        </button>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                          {n.trustLabel} ·{" "}
                          {n.noteAvgRating != null
                            ? `★ ${n.noteAvgRating.toFixed(1)} (${n.noteRatingCount})`
                            : "No ratings yet"}
                        </div>
                      </div>
                      {n.owned ? (
                        <span style={{ color: "var(--text-success)", fontWeight: 500, fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                          <i className="fas fa-check-circle"></i> owned
                        </span>
                      ) : (
                        <button
                          className="btn btn-primary"
                          onClick={() => {
                            const block = pickerBlock;
                            setPickerBlock(null);
                            if (block) handleBuyClick(block, n.noteId);
                          }}
                        >
                          {creditBalance != null && creditBalance > 0 ? (
                            <><i className="fas fa-ticket"></i> use credit</>
                          ) : (
                            <><i className="fas fa-lock"></i> buy</>
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {selfBuy && (
        <ConfirmDialog
          title="This is your own note"
          confirmLabel="Yes, buy it"
          onConfirm={() => {
            const { block, noteId } = selfBuy;
            setSelfBuy(null);
            handlePurchaseClick(block, noteId, true);
          }}
          onCancel={() => setSelfBuy(null)}
        >
          You&apos;re the scribe of this note. Buying it works like any other sale — you&apos;ll pay the full price and it
          counts as a normal purchase. Continue?
        </ConfirmDialog>
      )}

      {pendingCouponBuy && creditBalance != null && (
        <CouponConfirmDialog
          itemLabel={pendingCouponBuy.block.title}
          price={pendingCouponBuy.block.discountedPrice ?? pendingCouponBuy.block.price}
          creditBalance={creditBalance}
          confirming={couponConfirming}
          onConfirm={confirmCouponBuy}
          onCancel={() => setPendingCouponBuy(null)}
        />
      )}
    </div>
  );
}

// useSearchParams needs a Suspense boundary so the page can still be
// prerendered.
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <CatalogPage />
    </Suspense>
  );
}
