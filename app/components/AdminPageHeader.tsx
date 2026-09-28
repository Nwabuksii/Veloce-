import { ReactNode } from "react";
import { CAMPUS } from "@/lib/campus";

// The template's title block for admin views: eyebrow, a title whose last
// word(s) set in the italic serif, a muted subtitle, and actions on the
// right. Same markup the redesigned dashboard uses, so the CSS is shared.
export default function AdminPageHeader({
  section,
  title,
  serif,
  subtitle,
  children,
}: {
  section: string; // e.g. "Quality" -> "Babcock University · Quality"
  title?: string;  // plain part, optional (e.g. "Content")
  serif: string;   // italic serif part (e.g. "moderation")
  subtitle?: ReactNode;
  children?: ReactNode; // action buttons
}) {
  return (
    <div className="page-header">
      <div className="page-header-left">
        <span className="eyebrow">
          {CAMPUS.name} · {section}
        </span>
        <h1>
          {title ? `${title} ` : null}
          <span className="serif">{serif}</span>
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
