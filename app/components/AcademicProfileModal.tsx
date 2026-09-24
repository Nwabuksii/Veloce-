"use client";

import { useEffect, useState } from "react";
import SearchableSelect from "@/app/components/SearchableSelect";
import { LEVELS } from "@/lib/academic";
import { saveUser, StoredUser } from "@/lib/client-session";

interface Department {
  id: string;
  name: string;
}

// A full-screen, non-dismissible overlay — no backdrop click, no Escape,
// no close button — shown by SiteChrome whenever a logged-in student or
// scribe is missing their department or level. Nothing behind it is
// reachable until both are picked and saved.
export default function AcademicProfileModal({
  user,
  onComplete,
}: {
  user: StoredUser;
  onComplete: (departmentId: string, level: string) => void;
}) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/departments")
      .then((res) => res.json())
      .then((data) => setDepartments(data.departments || []))
      .catch(() => setError("Couldn't load the department list — refresh to try again."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!departmentId || !level) {
      setError("Pick both a course of study and a level.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/account/academic-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId, level }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.formErrors?.[0] || data.error || "Could not save");

      saveUser({ ...user, departmentId, level });
      onComplete(departmentId, level);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Complete your academic profile"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "var(--overlay)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "1rem",
          boxShadow: "var(--menu-shadow)",
          padding: "2rem",
          width: "100%",
          maxWidth: 420,
        }}
      >
        <h2>One more thing</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "0.3rem" }}>
          Tell us your course of study and level so we can show you the right notes. This only takes a second.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1.2rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>
            Course of study
            <div style={{ marginTop: "0.4rem" }}>
              <SearchableSelect
                options={departments.map((d) => ({ id: d.id, label: d.name }))}
                value={departmentId}
                onChange={setDepartmentId}
                placeholder={loading ? "Loading..." : "Search your course..."}
                disabled={loading}
              />
            </div>
          </label>

          <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>
            Level
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.4rem" }}>
              {LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`tab${level === l ? " is-active" : ""}`}
                  onClick={() => setLevel(l)}
                  style={{ border: "1px solid var(--border)" }}
                >
                  {l}
                </button>
              ))}
            </div>
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn btn-primary btn-block" onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
