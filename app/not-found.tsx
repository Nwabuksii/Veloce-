import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-wrap">
      <div className="app-container" style={{ display: "grid", placeItems: "center", minHeight: "70vh" }}>
        <div style={{ maxWidth: 520, textAlign: "center", padding: "2rem 1.25rem" }}>
          <h1 style={{ fontSize: "2.2rem", margin: 0 }}>This link is invalid</h1>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.8rem", lineHeight: 1.6 }}>
            The page you entered does not exist, or it has moved. Check the URL and try again.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", marginTop: "1.25rem", flexWrap: "wrap" }}>
            <Link href="/dashboard" className="btn btn-primary press-on-tap">
              <i className="fas fa-house"></i> Go to dashboard
            </Link>
            <Link href="/admin" className="btn press-on-tap">
              <i className="fas fa-arrow-left"></i> Admin
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
