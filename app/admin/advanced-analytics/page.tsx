"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
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

interface SelectedPoll {
  subject: string;
  body: string;
  options: Array<{ id: string; label: string; votes: number }>;
}

interface PollAnalyticsRow {
  messageId: string;
  pollGroupId: string | null;
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
  return (
    <Suspense fallback={<div className="page-wrap"><p style={{ color: "var(--text-secondary)" }}>Loading poll analytics…</p></div>}>
      <AdminAdvancedAnalyticsContent />
    </Suspense>
  );
}

function AdminAdvancedAnalyticsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<PollAnalyticsRow[]>([]);
  const [summary, setSummary] = useState<PollAnalyticsSummary | null>(null);
  const [selectedPoll, setSelectedPoll] = useState<SelectedPoll | null>(null);
  const [polls, setPolls] = useState<Array<{ id: string; subject: string }>>([]);
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  const [courseOptions, setCourseOptions] = useState<string[]>([]);
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [department, setDepartment] = useState("all");
  const [course, setCourse] = useState("all");
  const [pollId, setPollId] = useState(() => searchParams.get("poll") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const querySearch = searchParams.get("search") ?? "";
  const queryPoll = searchParams.get("poll") ?? "";

  // Keep the controlled search field synchronized with router query params.
  // This is important when navigating to this page from a poll link without a full reload.
  useEffect(() => {
    setSearch(querySearch);
    setPollId(queryPoll);
  }, [querySearch, queryPoll]);

  const urlParams = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (department !== "all") params.set("department", department);
    if (course !== "all") params.set("course", course);
    if (pollId) params.set("poll", pollId);
    return params.toString();
  }, [search, department, course, pollId]);

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
        setSelectedPoll(json.selectedPoll ?? null);
        setPolls(json.polls ?? []);
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
      <AdminPageHeader section="Polls" title="Advanced" serif="analytics" subtitle={pollId ? "Analytics for the selected poll only." : "Poll results and respondent breakdown across your audience."}>
        <button className="btn btn-ghost" onClick={() => router.push("/admin")}>
          {AIcon.back()} Admin
        </button>
      </AdminPageHeader>

      <div className="filter-panel">
        {pollId && (
          <div className="notice" style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span><strong>Filtered to one poll.</strong> Only responses belonging to this poll are shown.</span>
            <button type="button" className="btn btn-ghost" onClick={() => { setPollId(""); setSearch(""); router.push("/admin/advanced-analytics"); }}>Clear poll filter</button>
          </div>
        )}

        <div className="form-field">
          <label className="form-label" htmlFor="aa-poll">Poll</label>
          <select
            id="aa-poll"
            className="select"
            value={pollId}
            onChange={(e) => {
              const next = e.target.value;
              setPollId(next);
              router.replace(next ? `/admin/advanced-analytics?poll=${encodeURIComponent(next)}` : "/admin/advanced-analytics");
            }}
          >
            <option value="">All polls</option>
            {polls.map((p) => (
              <option key={p.id} value={p.id}>{p.subject}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="aa-search">Search</label>
          <input id="aa-search" className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Poll, label or user" />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="aa-dept">Department</label>
          <select id="aa-dept" className="select" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="all">All departments</option>
            {departmentOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="aa-course">Course / level</label>
          <select id="aa-course" className="select" value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="all">All courses</option>
            {courseOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>
      </div>

      {pollId && selectedPoll && !loading && (
        <div className="panel mb-24">
          <div className="code-label">Selected poll</div>
          <h2 className="panel-title" style={{ marginTop: 6 }}>{selectedPoll.subject}</h2>
          <p className="panel-desc" style={{ whiteSpace: "pre-wrap", marginBottom: 14 }}>{selectedPoll.body}</p>
          <div className="info-list">
            {selectedPoll.options.map((option) => (
              <div className="info-row" key={option.id}>
                <span className="k">{option.label}</span>
                <span className="v">{option.votes} vote{option.votes === 1 ? "" : "s"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading poll analytics…</p>
      ) : error ? (
        <div className="auth-error">{error}</div>
      ) : summary && rows.length > 0 ? (
        <>
          <div className="three-col mb-24">
            <div className="stat-tile">
              <div className="label">Total votes</div>
              <div className="value">{summary.totalVotes}</div>
              <div className="sub">Across {summary.totalPolls} poll{summary.totalPolls === 1 ? "" : "s"}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Unique voters</div>
              <div className="value">{summary.uniqueRespondents}</div>
              <div className="sub">Distinct respondents</div>
            </div>
            <div className="stat-tile">
              <div className="label">Leading option</div>
              <div className="value" style={{ fontSize: "22px", lineHeight: 1.15 }}>{summary.leadingOption}</div>
              <div className="sub">Current front-runner</div>
            </div>
          </div>

          <div className="two-col mb-24">
            <div className="panel">
              <h2 className="panel-title">{AIcon.chart()} Option breakdown</h2>
              <p className="panel-desc">How the votes split across the options.</p>
              {summary.optionBreakdown.map((option) => (
                <div className="poll-option" key={option.label}>
                  <div className="poll-top">
                    <span>{option.label}</span>
                    <strong>{option.percentage}% · {option.votes}</strong>
                  </div>
                  <div className="poll-track">
                    <div className="poll-fill" style={{ width: `${Math.max(option.percentage, 4)}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="panel">
              <h2 className="panel-title">{AIcon.grid()} Department mix</h2>
              <p className="panel-desc">Votes by respondent department.</p>
              <div className="info-list">
                {summary.departmentMix.map((group) => (
                  <div className="info-row" key={group.department}>
                    <span className="k">{group.department}</span>
                    <span className="v">{group.votes}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <h2 className="panel-title">{AIcon.user()} Respondent list</h2>
            <p className="panel-desc">Every vote matching the current filters.</p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Department</th>
                    <th>Course / level</th>
                    <th>Poll</th>
                    <th>Choice</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.pollGroupId ?? row.messageId}-${row.userId}-${row.optionId}`}>
                      <td>{row.userName}</td>
                      <td>{row.department}</td>
                      <td>{row.course ?? "—"}</td>
                      <td>{row.messageSubject}</td>
                      <td>{row.optionLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">{AIcon.chart()}</div>
          <h3 className="empty-title">No responses yet</h3>
          <p className="empty-desc">{pollId ? "Nobody has voted on this poll yet." : "No poll responses match the current filters yet."}</p>
        </div>
      )}
    </div>
  );
}
