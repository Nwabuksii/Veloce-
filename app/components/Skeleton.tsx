export function SkeletonText({ width }: { width?: string }) {
  return <span className="skeleton skeleton-text" style={width ? { width } : undefined} />;
}

export function SkeletonCard({ height }: { height?: string }) {
  return <div className="skeleton skeleton-card" style={height ? { height } : undefined} />;
}

/** A row that mimics an avatar + two lines of text — for lists (transactions, messages, notes). */
export function SkeletonRow() {
  return (
    <div className="skeleton-row">
      <span className="skeleton skeleton-avatar" />
      <div className="skeleton-lines">
        <SkeletonText width="55%" />
        <SkeletonText width="35%" />
      </div>
    </div>
  );
}

/** A vertical stack of skeleton rows, e.g. for a loading list. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-stack" style={{ gap: "0.6rem" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: "0.9rem" }}>
          <SkeletonRow />
        </div>
      ))}
    </div>
  );
}

/** A row of skeleton stat cards, matching .stat-row layout. */
export function SkeletonStatRow({ count = 3 }: { count?: number }) {
  return (
    <div className="stat-row">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} height="5.5rem" />
      ))}
    </div>
  );
}
