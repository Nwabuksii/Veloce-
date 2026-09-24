"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getStoredUser, StoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import { friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { SkeletonList } from "@/app/components/Skeleton";
import CouponConfirmDialog from "@/app/components/CouponConfirmDialog";
import { CAMPUS } from "@/lib/campus";
import { LEVELS } from "@/lib/academic";

interface BlockView {
  id: string;
  title: string;
  price: number;
  discountedPrice: number | null;
  courseName: string;
  courseCode: string;
  unlocked: boolean;
  topics: string[];
  scribeId: string | null;
  scribeName: string | null;
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
  const m = code.match(/(\d)\d{2}/);
  return m ? `${m[1]}00L` : null;
}

function CatalogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.get("q") ?? "";

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
  const [couponConfirming, setCouponConfirming] = useState(false);

  // The search term lives in the URL (?q=) — the header's search box writes
  // it, so this page just reacts to it.
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
    const list = blocks.filter(
      (b) => (!program || programOf(b.courseCode) === program) && (!level || levelOf(b.courseCode) === level)
    );
    if (sort === "rating") {
      list.sort((a, b) => (b.ratingAvg ?? -1) - (a.ratingAvg ?? -1) || b.ratingCount - a.ratingCount);
    } else if (sort === "versions") {
      list.sort((a, b) => b.liveNoteCount - a.liveNoteCount);
    } else {
      list.sort((a, b) => (a.discountedPrice ?? a.price) - (b.discountedPrice ?? b.price));
    }
    return list;
  }, [blocks, program, level, sort]);

  async function handlePurchaseClick(block: BlockView, noteId?: string) {
    try {
      const res = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId: block.id, noteId }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Could not start checkout");
        return;
      }

      if (data.freeViaCoupon) {
        toast.success("Credit used — no charge!");
        router.push(`/notes/${data.noteId}/read`);
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

  return (
    <div className="page-wrap">
      <PageHeader
        title="Browse Notes"
        subtitle={`Verified peer lecture notes and study packs for ${CAMPUS.name} students.`}
      >
        <span className="page-meta">
          {visible.length} course {visible.length === 1 ? "block" : "blocks"}
        </span>
        <span className="page-dot">•</span>
        {user?.role === "STUDENT" ? (
          <Link href="/scribe/apply" className="text-link">
            Become a Scribe <i className="fas fa-arrow-right" style={{ fontSize: "0.7rem" }}></i>
          </Link>
        ) : (
          <Link href="/scribe" className="text-link">
            Scribe Studio <i className="fas fa-arrow-right" style={{ fontSize: "0.7rem" }}></i>
          </Link>
        )}
      </PageHeader>

      <div className="filter-bar">
        <form
          className="search-field"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const term = String(new FormData(e.currentTarget).get("q") ?? "").trim();
            router.replace(term ? `/dashboard?q=${encodeURIComponent(term)}` : "/dashboard");
          }}
        >
          <i className="fas fa-search"></i>
          <input key={search} name="q" defaultValue={search} placeholder="Search notes, codes..." aria-label="Search notes" />
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
          <span className="filter-sep">|</span>
          <select className="select-plain" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort notes">
            <option value="rating">Top Rated</option>
            <option value="versions">Most Versions</option>
            <option value="price">Lowest Price</option>
          </select>
        </div>
      </div>

      {loading && <SkeletonList rows={3} />}
      {error && <div className="auth-error">{error}</div>}

      {!loading && !error && visible.length === 0 && (
        <p className="empty-state">
          {search || program || level ? "No notes match your filters." : "No notes published yet — check back soon."}
        </p>
      )}

      <div className="catalog-grid">
        {visible.map((block) => {
          const effectivePrice = block.discountedPrice ?? block.price;
          const hasDiscount = block.discountedPrice != null && block.discountedPrice < block.price;
          const percentOff = hasDiscount ? Math.round((1 - effectivePrice / block.price) * 100) : 0;

          return (
            <article
              key={block.id}
              className="note-card"
              onClick={() => router.push(`/blocks/${block.id}`)}
            >
              <div>
                <div className="note-card-top">
                  <span className={`seal mono${hasDiscount ? " seal-amber" : ""}`}>{block.courseCode}</span>
                  {block.unlocked ? (
                    <span className="note-card-side is-good">
                      <i className="fas fa-check-circle"></i> Unlocked
                    </span>
                  ) : hasDiscount ? (
                    <span className="note-card-side is-good">{percentOff}% off · requested</span>
                  ) : (
                    <span className="note-card-side">
                      {block.liveNoteCount} {block.liveNoteCount === 1 ? "version" : "versions"}
                    </span>
                  )}
                </div>

                <h2 className="note-card-title">{block.title}</h2>
                <p className="note-card-desc">
                  {block.courseName}
                  {block.topics.length > 0 ? ` · ${block.topics.join(", ")}` : ""}
                </p>

                <div className="note-card-meta">
                  {block.ratingAvg != null ? (
                    <>
                      <i className="fas fa-star star"></i>
                      <strong>{block.ratingAvg.toFixed(1)}</strong>
                      <span className="count">({block.ratingCount})</span>
                    </>
                  ) : (
                    <span className="count">No ratings yet</span>
                  )}
                  {block.scribeName && (
                    <>
                      <span className="dot">•</span>
                      <button
                        className="scribe-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/scribe/${block.scribeId}`);
                        }}
                      >
                        {block.scribeName}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="note-card-foot">
                <div>
                  {hasDiscount ? (
                    <>
                      <span className="price-was">₦{block.price.toLocaleString()}</span>
                      <span className="price-now is-good">₦{effectivePrice.toLocaleString()}</span>
                    </>
                  ) : (
                    <>
                      <span className="price-label">Price</span>
                      <span className="price-now">₦{effectivePrice.toLocaleString()}</span>
                    </>
                  )}
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
                    className="btn btn-primary btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openVersionPicker(block);
                    }}
                  >
                    Compare {block.liveNoteCount} Notes
                  </button>
                ) : block.unlocked ? (
                  <button
                    className="btn btn-dark btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/blocks/${block.id}`);
                    }}
                  >
                    View Notes
                  </button>
                ) : (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBuyClick(block);
                    }}
                  >
                    {hasCredit ? "Use credit" : "Unlock Notes"}
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
