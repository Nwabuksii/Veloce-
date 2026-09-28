import { ReactNode } from "react";

// The title block at the top of every page.
//
// Template layout (pass `eyebrow` and/or `accent`): small gold-ruled eyebrow,
// the title with its last word set in italic serif, a muted subtitle, and the
// page-level actions on the right — exactly like "Browse Notes".
//
//   <PageHeader eyebrow="Scribe · Money" title="Your" accent="earnings" subtitle="…">
//
// Pages that haven't been moved to the template yet pass neither prop and keep
// rendering the previous plain layout, so nothing else on the site changes.
export default function PageHeader({
  title,
  accent,
  eyebrow,
  subtitle,
  children,
}: {
  title: string;
  accent?: string;
  eyebrow?: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  const templated = eyebrow !== undefined || accent !== undefined;

  if (!templated) {
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

  return (
    <div className="page-header">
      <div className="page-header-left">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>
          {title}
          {accent && (
            <>
              {" "}
              <span className="serif">{accent}</span>
            </>
          )}
        </h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && (
        <div className="page-header-right">
          <div className="header-actions">{children}</div>
        </div>
      )}
    </div>
  );
}
