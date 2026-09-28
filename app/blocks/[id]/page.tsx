"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SiteHeader from "@/app/components/SiteHeader";
import Avatar from "@/app/components/Avatar";
import { getStoredUser } from "@/lib/client-session";
import { friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import "./block-details.css";

type AnyRecord = Record<string, any>;

const naira = (n: number | null | undefined) => `₦${Number(n || 0).toLocaleString()}`;
const text = (v: any, fallback = "") => (v === null || v === undefined || v === "" ? fallback : String(v));
const arr = (v: any): any[] => Array.isArray(v) ? v : [];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase() || "V";
}

function relativeDate(value: any) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function normalise(raw: AnyRecord) {
  const root = raw?.block ?? raw?.data?.block ?? raw?.data ?? raw;
  const versions = arr(raw?.versions ?? root?.versions ?? raw?.data?.versions);
  const reviews = arr(raw?.reviews ?? root?.reviews ?? raw?.data?.reviews);
  const related = arr(raw?.relatedBlocks ?? raw?.related ?? root?.relatedBlocks ?? root?.related);

  return {
    block: {
      id: text(root?.id ?? root?.blockId),
      code: text(root?.courseCode ?? root?.code, "BLOCK"),
      title: text(root?.courseName ?? root?.title ?? root?.blockTitle, "Block details"),
      department: text(root?.department ?? root?.schoolDepartment ?? root?.dept),
      description: text(root?.description ?? root?.desc),
      topics: arr(root?.topics ?? root?.tags),
      pages: Number(root?.pages ?? root?.pageCount ?? 0),
      versions: Number(root?.versionCount ?? versions.length),
      downloads: Number(root?.downloads ?? root?.downloadCount ?? 0),
      price: Number(root?.price ?? root?.startingPrice ?? versions[0]?.price ?? 0),
      was: root?.was ?? root?.originalPrice ?? null,
      rating: root?.rating ?? root?.avgRating ?? null,
      reviewCount: Number(root?.reviewCount ?? root?.ratingCount ?? reviews.length ?? 0),
      owned: Boolean(root?.owned ?? root?.isOwned),
    },
    versions,
    reviews,
    related,
  };
}

export default function BlockDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const blockId = String(params.id || "");
  const [data, setData] = useState<ReturnType<typeof normalise> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"versions" | "reviews">("versions");
  const [versionSort, setVersionSort] = useState("rating");
  const [versionFilter, setVersionFilter] = useState("all");
  const [reviewSort, setReviewSort] = useState("recent");
  const [helpful, setHelpful] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!getStoredUser()) {
      router.push("/login");
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/blocks/${encodeURIComponent(blockId)}`)
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Failed to load block");
        return body;
      })
      .then(body => { if (!cancelled) setData(normalise(body)); })
      .catch(err => { if (!cancelled) setError(friendlyErrorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [blockId, router]);

  const versions = useMemo(() => {
    const list = [...(data?.versions || [])];
    const mapped = list.map((v: AnyRecord, index) => ({
      ...v,
      id: text(v.id ?? v.noteId ?? v.versionId, String(index)),
      scribe: text(v.scribe?.fullName ?? v.scribeName ?? v.authorName ?? v.fullName, "Veloce scribe"),
      avatarUrl: v.scribe?.avatarUrl ?? v.avatarUrl ?? null,
      trust: String(v.trustLevel ?? v.trust ?? "NEW").toLowerCase(),
      notes: Number(v.scribe?.noteCount ?? v.noteCount ?? v.notes ?? 0),
      followers: Number(v.scribe?.followerCount ?? v.followers ?? 0),
      downloads: Number(v.downloads ?? v.downloadCount ?? 0),
      number: text(v.versionNumber ?? v.version ?? `V${list.length - index}`),
      label: text(v.versionLabel ?? (v.isLatest ? "Latest" : "Version")),
      title: text(v.title ?? v.noteTitle ?? v.blockTitle, "Study notes"),
      desc: text(v.description ?? v.desc),
      topics: arr(v.topics ?? v.tags),
      pages: Number(v.pages ?? v.pageCount ?? 0),
      uploaded: relativeDate(v.uploadedAt ?? v.createdAt ?? v.uploaded),
      price: Number(v.price ?? 0),
      was: v.was ?? v.originalPrice ?? null,
      rating: Number(v.rating ?? v.avgRating ?? 0),
      reviews: Number(v.reviewCount ?? v.ratingCount ?? 0),
      owned: Boolean(v.owned ?? v.isOwned),
      isLatest: Boolean(v.isLatest ?? v.latest),
      bestValue: Boolean(v.bestValue),
    }));
    const filtered = versionFilter === "owned" ? mapped.filter(v => v.owned) : versionFilter === "affordable" ? mapped.filter(v => v.price < 1500) : mapped;
    filtered.sort((a, b) => {
      if (a.owned !== b.owned) return a.owned ? -1 : 1;
      if (versionSort === "price") return a.price - b.price;
      if (versionSort === "recent") return b.downloads - a.downloads;
      return b.rating - a.rating;
    });
    return filtered;
  }, [data, versionFilter, versionSort]);

  const reviews = useMemo(() => {
    const list = (data?.reviews || []).map((r: AnyRecord, index) => ({
      ...r,
      id: text(r.id, String(index)),
      name: text(r.user?.fullName ?? r.fullName ?? r.name, "Student"),
      avatarUrl: r.user?.avatarUrl ?? r.avatarUrl ?? null,
      stars: Number(r.rating ?? r.stars ?? 0),
      version: text(r.versionNumber ?? r.version ?? ""),
      date: relativeDate(r.createdAt ?? r.date),
      title: text(r.title ?? r.headline),
      body: text(r.body ?? r.comment ?? r.review),
      helpful: Number(r.helpfulCount ?? r.helpful ?? 0),
      verified: Boolean(r.verified ?? r.isVerifiedPurchase),
    }));
    return list.sort((a, b) => reviewSort === "highest" ? b.stars - a.stars : reviewSort === "lowest" ? a.stars - b.stars : b.helpful - a.helpful);
  }, [data, reviewSort]);

  if (loading) return <><SiteHeader /><main className="bd-main"><div className="bd-skeleton" /><div className="bd-skeleton bd-skeleton-tall" /></main></>;
  if (error || !data) return <><SiteHeader /><main className="bd-main"><section className="bd-error"><i className="fas fa-circle-exclamation" /><h1>We couldn't load this block</h1><p>{error || "The block could not be found."}</p><button className="bd-btn bd-btn-primary" onClick={() => router.back()}>Go back</button></section></main></>;

  const b = data.block;
  const totalReviews = reviews.length || b.reviewCount;
  const rating = b.rating == null ? (reviews.length ? reviews.reduce((s, r) => s + r.stars, 0) / reviews.length : 0) : Number(b.rating);
  const unlockVersion = versions.find(v => v.bestValue) || versions[0];

  return (
    <div className="bd-shell">
      <SiteHeader />
      <main className="bd-main">
        <div className="bd-breadcrumb"><button onClick={() => router.back()}><i className="fas fa-arrow-left" /> Back</button><span>/</span><span>{b.code}</span><strong>{b.title}</strong></div>

        <section className="bd-hero">
          <div className="bd-hero-inner">
            <div className="bd-hero-copy">
              <div className="bd-code-row"><span className="bd-code"><i className="fas fa-book-open" /> {b.code}</span>{b.department && <span className="bd-dept">{b.department}</span>}</div>
              <h1>{b.title}</h1>
              {b.department && <p className="bd-department"><strong>{b.department}</strong> · Course block</p>}
              {!!b.topics.length && <div className="bd-topics">{b.topics.map((t: any, i) => <span key={i}><i className="fas fa-tag" /> {text(t?.name ?? t)}</span>)}</div>}
              {b.description && <p className="bd-description">{b.description}</p>}
              <div className="bd-stats">
                <div><strong>{b.versions || versions.length}</strong><span>Versions</span></div>
                <div><strong>{b.pages || "—"}</strong><span>Pages</span></div>
                <div><strong>{b.downloads.toLocaleString()}</strong><span>Downloads</span></div>
                <div><strong>{rating ? rating.toFixed(1) : "—"}</strong><span>Rating</span></div>
              </div>
            </div>
            <aside className="bd-buy">
              <span className="bd-eyebrow">From</span>
              <div className="bd-price"><span>₦</span>{(unlockVersion?.price || b.price).toLocaleString()}</div>
              {unlockVersion?.was != null && <div className="bd-was">{naira(Number(unlockVersion.was))}</div>}
              <p><i className="fas fa-shield-halved" /> Secure Veloce purchase</p>
              <button className="bd-btn bd-btn-primary bd-full" disabled={!unlockVersion} onClick={() => unlockVersion && toast(`Unlocking ${unlockVersion.number} — ${naira(unlockVersion.price)}`)}><i className="fas fa-lock-open" /> Unlock best option</button>
              <button className="bd-btn bd-btn-ghost bd-full" onClick={() => toast("Opening preview…")}><i className="fas fa-eye" /> Preview sample</button>
              <small>Choose another version below if you need a different depth, price, or scribe.</small>
            </aside>
          </div>
        </section>

        <div className="bd-tabs" role="tablist">
          <button className={tab === "versions" ? "active" : ""} onClick={() => setTab("versions")}><i className="fas fa-layer-group" /> Versions <b>{versions.length}</b></button>
          <button className={tab === "reviews" ? "active" : ""} onClick={() => setTab("reviews")}><i className="fas fa-star" /> Reviews <b>{totalReviews}</b></button>
        </div>

        {tab === "versions" ? (
          <section className="bd-section">
            <div className="bd-toolbar"><div><span className="bd-eyebrow">Available editions</span><h2>Choose your <em>version</em></h2></div><div className="bd-selects"><select value={versionSort} onChange={e => setVersionSort(e.target.value)}><option value="rating">Top rated</option><option value="price">Lowest price</option><option value="recent">Most downloaded</option></select><select value={versionFilter} onChange={e => setVersionFilter(e.target.value)}><option value="all">All versions</option><option value="owned">Purchased</option><option value="affordable">Under ₦1,500</option></select></div></div>
            <div className="bd-version-list">
              {versions.length ? versions.map((v: AnyRecord) => <article className={`bd-version ${v.owned ? "owned" : ""}`} key={v.id}>
                {v.owned && <span className="bd-ribbon">Owned</span>}
                {!v.owned && v.bestValue && <span className="bd-ribbon gold">Best value</span>}
                <div className="bd-version-head"><Avatar name={v.scribe} imageUrl={v.avatarUrl} /><div className="bd-scribe"><div><strong>{v.scribe}</strong><span className={`bd-trust ${v.trust}`}>{v.trust === "elite" ? "Elite" : v.trust === "trusted" ? "Trusted" : "New scribe"}</span></div><small><span>{v.notes} notes</span><span>{v.followers} followers</span><span>{v.downloads} downloads</span></small></div><span className={`bd-version-badge ${v.isLatest ? "latest" : ""}`}><i className="fas fa-code-branch" /> {v.number} · {v.label}</span></div>
                <h3>{v.title}</h3><p className="bd-version-desc">{v.desc}</p>
                {!!v.topics.length && <div className="bd-version-topics">{v.topics.map((t: any, i: number) => <span key={i}>{text(t?.name ?? t)}</span>)}</div>}
                <div className="bd-meta"><span><i className="fas fa-file-lines" /> <b>{v.pages}</b> pages</span><span><i className="fas fa-clock" /> Uploaded <b>{v.uploaded}</b></span><span><i className="fas fa-star" /> <b>{v.rating.toFixed(1)}</b> · {v.reviews} reviews</span></div>
                <div className="bd-version-foot"><div><small>{v.owned ? "Purchased for" : "Price"}</small><strong>{naira(v.price)}</strong>{v.was != null && <del>{naira(Number(v.was))}</del>}</div><div className="bd-actions"><button className="bd-btn bd-btn-ghost" onClick={() => toast(`Opening preview — ${v.number}`)}><i className="fas fa-eye" /> Preview</button>{v.owned ? <button className="bd-btn bd-btn-success" onClick={() => router.push(`/notes/${v.noteId ?? v.note?.id ?? v.id}/read`)}><i className="fas fa-book-open" /> Read</button> : <button className="bd-btn bd-btn-primary" onClick={() => toast(`Unlocking ${v.number} — ${naira(v.price)}`)}><i className="fas fa-lock-open" /> Unlock</button>}</div></div>
              </article>) : <div className="bd-empty"><i className="fas fa-layer-group" /><h3>No versions match</h3><p>Try clearing your filters to see all available versions.</p><button className="bd-btn bd-btn-ghost" onClick={() => setVersionFilter("all")}>Reset filters</button></div>}
            </div>
          </section>
        ) : (
          <section className="bd-section">
            <div className="bd-review-summary"><div className="bd-rating"><strong>{rating ? rating.toFixed(1) : "—"}</strong><div>{[1,2,3,4,5].map(i => <i key={i} className={`fas fa-star ${i <= Math.round(rating) ? "" : "empty"}`} />)}</div><span>{totalReviews} reviews</span></div><div className="bd-review-note">Ratings and reviews are tied to purchased versions. Sort below to find recent or highest-rated feedback.</div></div>
            <div className="bd-toolbar"><div><span className="bd-eyebrow">Reader feedback</span><h2>What students <em>say</em></h2></div><select className="bd-review-sort" value={reviewSort} onChange={e => setReviewSort(e.target.value)}><option value="recent">Most helpful</option><option value="highest">Highest rated</option><option value="lowest">Lowest rated</option></select></div>
            <div className="bd-review-list">{reviews.length ? reviews.map((r: AnyRecord) => <article className="bd-review" key={r.id}><div className="bd-review-head"><Avatar name={r.name} imageUrl={r.avatarUrl} /><div><strong>{r.name}</strong>{r.verified && <span className="bd-verified"><i className="fas fa-check" /> Verified</span>}<small>{r.version && `${r.version} · `}{r.date}</small></div><span className="bd-stars">{[1,2,3,4,5].map(i => <i key={i} className={`fas fa-star ${i <= r.stars ? "" : "empty"}`} />)}</span></div>{r.title && <h3>{r.title}</h3>}<p>{r.body}</p><div className="bd-review-foot"><span>Was this helpful?</span><button className={helpful[r.id] ? "active" : ""} onClick={() => setHelpful(x => ({ ...x, [r.id]: !x[r.id] }))}><i className="fas fa-thumbs-up" /> {r.helpful + (helpful[r.id] ? 1 : 0)}</button>{r.version && <code>Note: {r.version}</code>}</div></article>) : <div className="bd-empty"><i className="fas fa-star" /><h3>No reviews yet</h3><p>Be the first to review this block after you buy it.</p></div>}</div>
          </section>
        )}

        {!!data.related.length && <section className="bd-related"><div className="bd-toolbar"><div><span className="bd-eyebrow">Keep studying</span><h2>Related <em>blocks</em></h2></div></div><div className="bd-related-grid">{data.related.map((r: AnyRecord, i) => <button key={i} className="bd-related-card" onClick={() => router.push(`/blocks/${r.id ?? r.blockId}`)}><span>{text(r.courseCode ?? r.code)}</span><strong>{text(r.courseName ?? r.title ?? r.blockTitle)}</strong><small>{text(r.department ?? r.dept)}</small><div><b>{naira(Number(r.price ?? 0))}</b><span><i className="fas fa-star" /> {Number(r.rating ?? r.avgRating ?? 0).toFixed(1)}</span></div></button>)}</div></section>}
      </main>
    </div>
  );
}
