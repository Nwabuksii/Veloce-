import { ReactNode } from "react";

// The title block at the top of every page — same structure as the
// reference design's "Browse Notes" hero: big title, muted subtitle, and
// any page-level actions/links aligned to the right, over a hairline rule.
export default function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="page-header-actions">{children}</div>}
    </div>
  );
}
