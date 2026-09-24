"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import { friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";

interface PollAnalyticsSummary {
  totalVotes: number;
  uniqueRespondents: number;
  totalPolls: number;
  leadingOption: string;
  optionBreakdown: Array<{ label: string; votes: number; percentage: number }>;
  departmentMix: Array<{ department: string; votes: number }>;
}

interface PollAnalyticsRow {
  messageId: string;
  messageSubject: string;
  messageBody: string;
  optionId: string;
  optionLabel: string;
  selectedAt: string;
  userId: string;
  userName: string;
  department: string;
  course: string | null;
}

export default function AdminAdvancedAnalyticsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PollAnalyticsRow[]>([]);
  const [summary, setSummary] = useState<PollAnalyticsSummary | null>(null);
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  const [courseOptions, setCourseOptions] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [course, setCourse] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const urlParams = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (department !== "all") params.set("department", department);
    if (course !== "all") params.set("course", course);
    return params.toString();
  }, [search, department, course]);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }
    if (user.role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const query = urlParams ? `?${urlParams}` : "";
        const response = await fetch(`/api/admin/advanced-analytics${query}`);
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Failed to load analytics");
        setRows(json.rows ?? []);
        setSummary(json.summary ?? null);
        setDepartmentOptions(json.filters?.departmentOptions ?? []);
        setCourseOptions(json.filters?.courseOptions ?? []);
      } catch (err) {
        const message = friendlyErrorMessage(err);
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router, urlParams]);

  return (
    <div className="page-wrap">
      <div className="app-container">
        <PageHeader title="Advanced analytics" subtitle="Poll results and respondent breakdown across your audience.">
          <button className="btn" onClick={() => router.push("/admin")}>          <i className="fas fa-arrow-left"></i> Admin
          </button>
        </PageHeader>

        <div style={{ marginTop: "1.25rem", display: "grid", gap: "1rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.75rem",
              padding: "1rem",
              background: "var(--surface)",
              border: "1px solid var(--border-blue)",
              borderRadius: "16px",
            }}
          >
            <label style={{ display: "grid", gap: "0.4rem" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>Search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Poll, label or user"
                style={{ padding: "0.7rem 0.8rem", borderRadius: "10px", border: "1px solid var(--border-blue)" }}
              />
            </label>

            <label style={{ display: "grid", gap: "0.4rem" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>Department</span>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                style={{ padding: "0.7rem 0.8rem", borderRadius: "10px", border: "1px solid var(--border-blue)" }}
              >
                <option value="all">All departments</option>
                {departmentOptions.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: "0.4rem" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>Course / level</span>
              <select
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                style={{ padding: "0.7rem 0.8rem", borderRadius: "10px", border: "1px solid var(--border-blue)" }}
              >
                <option value="all">All courses</option>
                {courseOptions.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>

          {loading ? (
            <p style={{ color: "var(--text-secondary)" }}>Loading poll analytics…</p>
          ) : error ? (
            <div className="auth-error">{error}</div>
          ) : summary && rows.length > 0 ? (
            <>
              <div className="stat-row">
                <div className="stat-card">
                  <div className="stat-label">Total votes</div>
                  <div className="stat-number">{summary.totalVotes}</div>
                  <div className="stat-subtitle">Across {summary.totalPolls} poll{summary.totalPolls === 1 ? "" : "s"}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Unique voters</div>
                  <div className="stat-number">{summary.uniqueRespondents}</div>
                  <div className="stat-subtitle">Distinct respondents</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Leading option</div>
                  <div className="stat-number" style={{ fontSize: "1.2rem" }}>{summary.leadingOption}</div>
                  <div className="stat-subtitle">Current front-runner</div>
                </div>
              </div>

              <div style={{ display: "grid", gap: "1.5rem" }}>
                <section>
                  <h2 style={{ marginBottom: "0.7rem" }}><i className="fas fa-chart-bar" style={{ color: "var(--text-info)" }}></i> Option breakdown</h2>
                  <div style={{ display: "grid", gap: "0.6rem" }}>
                    {summary.optionBreakdown.map((option) => (
                      <div key={option.label}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem", gap: "0.75rem" }}>
                          <strong>{option.label}</strong>
                          <span>{option.votes} votes · {option.percentage}%</span>
                        </div>
                        <div style={{ height: 10, background: "rgba(130, 160, 255, 0.15)", borderRadius: 999 }}>
                          <div style={{ width: `${Math.max(option.percentage, 4)}%`, height: "100%", background: "linear-gradient(90deg, var(--accent), var(--text-info))", borderRadius: 999 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h2 style={{ marginBottom: "0.7rem" }}><i className="fas fa-building-columns" style={{ color: "var(--text-warning)" }}></i> Department mix</h2>
                  <div style={{ display: "grid", gap: "0.45rem" }}>
                    {summary.departmentMix.map((group) => (
                      <div key={group.department} style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                        <span>{group.department}</span>
                        <strong>{group.votes}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section style={{ marginTop: "1.5rem" }}>
                <h2 style={{ marginBottom: "0.7rem" }}><i className="fas fa-user-check" style={{ color: "var(--text-success)" }}></i> Respondent list</h2>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.92rem" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--text-secondary)" }}>
                        <th style={{ padding: "0.7rem 0.5rem" }}>User</th>
                        <th style={{ padding: "0.7rem 0.5rem" }}>Department</th>
                        <th style={{ padding: "0.7rem 0.5rem" }}>Course / level</th>
                        <th style={{ padding: "0.7rem 0.5rem" }}>Poll</th>
                        <th style={{ padding: "0.7rem 0.5rem" }}>Choice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={`${row.messageId}-${row.userId}-${row.optionId}`} style={{ borderTop: "1px solid var(--border-blue)" }}>
                          <td style={{ padding: "0.7rem 0.5rem" }}>{row.userName}</td>
                          <td style={{ padding: "0.7rem 0.5rem" }}>{row.department}</td>
                          <td style={{ padding: "0.7rem 0.5rem" }}>{row.course ?? "—"}</td>
                          <td style={{ padding: "0.7rem 0.5rem" }}>{row.messageSubject}</td>
                          <td style={{ padding: "0.7rem 0.5rem" }}>{row.optionLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <div className="auth-empty" style={{ marginTop: "1rem" }}>
              No poll responses match the current filters yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
