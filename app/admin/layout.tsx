import "./admin.css";

// Loads the admin-only styles (template panels, rows, status pills…) for
// every /admin route without touching the global stylesheet.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
