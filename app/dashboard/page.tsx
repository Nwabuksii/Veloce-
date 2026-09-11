"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, StoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { SkeletonList } from "@/app/components/Skeleton";

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

interface CourseOption {
  id: string;
  name: string;
  code: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [blocks, setBlocks] = useState<BlockView[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pickerBlock, setPickerBlock] = useState<BlockView | null>(null);
  const [pickerNotes, setPickerNotes] = useState<NoteOption[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTrustFilter, setPickerTrustFilter] = useState("");

  async function loadBlocks() {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (courseFilter) params.set("courseId", courseFilter);

    setLoading(true);
    try {
      const res = await fetch(`/api/blocks?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load blocks");
      setBlocks(data.blocks);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const storedUser = getStoredUser();

    if (!storedUser) {
      router.push("/login");
      return;
    }
    setUser(storedUser);

    fetch("/api/scribe/courses")
      .then((res) => res.json())
      .then((data) => setCourses(data.courses || []))
      .catch(() => setCourses([]));

    loadBlocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Debounce re-fetching while the person is typing a search query; filter
  // changes (the course dropdown) can fire immediately since there's no typing.
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => loadBlocks(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, courseFilter]);

  
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

      window.location.href = data.authorizationUrl; // off to real Paystack checkout
    } catch {
      toast.error("Something went wrong starting checkout. Try again.");
    }
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
              <div className="logo-sub">Babcock · pilot</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
            {user?.role === "STUDENT" && (
              <button className="btn" onClick={() => router.push("/scribe/apply")}>
                <i className="fas fa-pen-fancy"></i> Apply to become a Scribe
              </button>
            )}
            <ProfileMenu />
          </div>
        </div>

        <div style={{ marginTop: "1.5rem" }}>
          <h2>
            <i className="fas fa-layer-group" style={{ color: "var(--text-info)" }}></i> Course blocks
          </h2>

          <div style={{ display: "flex", gap: "0.8rem", margin: "1rem 0", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 260px" }}>
              <i
                className="fas fa-search"
                style={{ position: "absolute", left: "0.9rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
              ></i>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search blocks, topics, or course..."
                style={{
                  width: "100%",
                  padding: "0.55rem 0.9rem 0.55rem 2.2rem",
                  borderRadius: "40px",
                  border: "1px solid var(--border-blue)",
                  fontSize: "0.85rem",
                }}
              />
            </div>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              style={{
                padding: "0.55rem 1rem",
                borderRadius: "40px",
                border: "1px solid var(--border-blue)",
                fontSize: "0.85rem",
                background: "var(--surface)",
                color: "var(--text-primary)",
              }}
            >
              <option value="">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>

          {loading && <SkeletonList rows={3} />}
          {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}

          {!loading && !error && blocks.length === 0 && (
            <p style={{ marginTop: "1rem", color: "var(--text-secondary)" }}>
              {search || courseFilter ? "No notes match your search." : "No notes published yet — check back soon."}
            </p>
          )}

          <div className="card-grid">
            {blocks.map((block) => (
              <div key={block.id} className={`block-card ${block.unlocked ? "unlocked" : "locked"}`}>
                <div className="badge">{block.courseCode}</div>
                <h3>{block.title}</h3>
                <div className="meta">{block.courseName}</div>
                {block.scribeName && (
                  <button
                    onClick={() => router.push(`/scribe/${block.scribeId}`)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      color: "var(--text-info)",
                      marginTop: "-0.4rem",
                      marginBottom: "0.6rem",
                      display: "block",
                    }}
                  >
                    by {block.scribeName}
                  </button>
                )}
                {block.topics.length > 0 && (
                  <ul style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "0.4rem 0 0.8rem", paddingLeft: "1.1rem" }}>
                    {block.topics.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {block.discountedPrice != null ? (
                    <span>
                      <span className="price-tag" style={{ textDecoration: "line-through", color: "var(--text-muted)", marginRight: "0.4rem" }}>
                        ₦{block.price.toLocaleString()}
                      </span>
                      <span className="price-tag" style={{ color: "var(--text-success)" }}>
                        ₦{block.discountedPrice.toLocaleString()}
                      </span>
                    </span>
                  ) : (
                    <span className="price-tag">₦{block.price.toLocaleString()}</span>
                  )}
                  {block.liveNoteCount > 1 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {block.unlocked && (
                        <span style={{ color: "var(--text-success)", fontSize: "0.75rem" }}>
                          <i className="fas fa-check-circle"></i>
                        </span>
                      )}
                      <button className="btn btn-primary" onClick={() => openVersionPicker(block)}>
                        <i className="fas fa-layer-group"></i> {block.liveNoteCount} versions
                      </button>
                    </div>
                  ) : block.unlocked ? (
                    <span style={{ color: "var(--text-success)", fontWeight: 500 }}>
                      <i className="fas fa-check-circle"></i> unlocked
                    </span>
                  ) : (
                    <button className="btn btn-primary" onClick={() => handlePurchaseClick(block)}>
                      <i className="fas fa-lock"></i> purchase
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {pickerBlock && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(11,30,51,0.45)",
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
                borderRadius: "16px",
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
                    borderRadius: "30px",
                    border: "1px solid var(--border-blue)",
                    fontSize: "0.82rem",
                  }}
                />
                <select
                  value={pickerTrustFilter}
                  onChange={(e) => setPickerTrustFilter(e.target.value)}
                  style={{
                    padding: "0.5rem 0.8rem",
                    borderRadius: "30px",
                    border: "1px solid var(--border-blue)",
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
                          border: "1px solid var(--border-blue)",
                          borderRadius: "10px",
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
                              if (block) handlePurchaseClick(block, n.noteId);
                            }}
                          >
                            <i className="fas fa-lock"></i> buy
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
      </div>
    </div>
  );
}
