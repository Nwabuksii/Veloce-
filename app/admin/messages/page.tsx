"use client";

import { useEffect, useRef, useState, FormEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import Avatar from "@/app/components/Avatar";
import { SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage } from "@/lib/api-client";
import { displayEmail } from "@/lib/deleted-user";

interface UserOption {
  id: string;
  fullName: string;
  email: string;
  role: string;
  avatarUrl: string | null;
}
interface SentMessage {
  subject: string;
  body: string;
  type: "TEXT" | "POLL";
  priority: "NORMAL" | "SERIOUS";
  recipientCount: number;
  recipientSummary: string;
  createdAt: string;
  messageId: string;
  pollGroupId: string | null;
}

type Role = "STUDENT" | "SCRIBE" | "ADMIN";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "STUDENT", label: "Students" },
  { value: "SCRIBE", label: "Scribes" },
  { value: "ADMIN", label: "Admins" },
];

// How the "sent to" line reads for 1, a few, or many people — same
// shorthand the backend already uses for its own recipientSummary.
function summarizeNames(names: string[]): string {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} other${names.length - 2 === 1 ? "" : "s"}`;
}

export default function AdminMessagesPage() {
  const router = useRouter();

  // Opens Advanced analytics already filtered to this one poll.
  function openPollAnalytics(m: { pollGroupId: string | null; messageId: string }) {
    router.push(`/admin/advanced-analytics?poll=${encodeURIComponent(m.pollGroupId ?? m.messageId)}`);
  }
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [audience, setAudience] = useState<"individual" | "group">("individual");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserOption[]>([]);
  // One or more people — picking (or comma-confirming) a person adds them
  // here rather than replacing a single selection, so the admin can keep
  // searching and adding more without starting over.
  const [recipients, setRecipients] = useState<UserOption[]>([]);

  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const allChecked = selectedRoles.length === ROLE_OPTIONS.length;

  const [msgType, setMsgType] = useState<"TEXT" | "POLL">("TEXT");
  const [priority, setPriority] = useState<"NORMAL" | "SERIOUS">("NORMAL");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);
  const [loadingSent, setLoadingSent] = useState(true);

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
    loadSent();
  }, [router]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/users/search?q=${encodeURIComponent(query.trim())}`)
        .then((res) => res.json())
        .then((data) => setResults((data.users || []).filter((u: UserOption) => !recipients.some((r) => r.id === u.id))))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function loadSent() {
    setLoadingSent(true);
    try {
      const res = await fetch("/api/admin/messages");
      const data = await res.json();
      setSentMessages(data.messages || []);
    } finally {
      setLoadingSent(false);
    }
  }

  function addRecipient(u: UserOption) {
    setRecipients((prev) => (prev.some((r) => r.id === u.id) ? prev : [...prev, u]));
    setQuery("");
    setResults([]);
    searchInputRef.current?.focus();
  }

  function removeRecipient(id: string) {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
  }

  // A comma commits the top match and clears the box for the next
  // name/email — so picking someone, then typing a comma, then typing the
  // next person works as one continuous flow instead of click, click, click.
  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "," && results.length > 0) {
      e.preventDefault();
      addRecipient(results[0]);
    }
  }

  function toggleRole(role: Role) {
    setSelectedRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function toggleAll() {
    setSelectedRoles(allChecked ? [] : ROLE_OPTIONS.map((r) => r.value));
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();

    if (audience === "individual" && recipients.length === 0) {
      setStatus("Pick at least one recipient first.");
      return;
    }
    if (audience === "group" && selectedRoles.length === 0) {
      setStatus("Check at least one audience group.");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setStatus("Fill in both a subject and a message.");
      return;
    }
    const cleanedOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (msgType === "POLL" && cleanedOptions.length < 2) {
      setStatus("A poll needs at least 2 options.");
      return;
    }

    setSending(true);
    setStatus("");
    try {
      const base = {
        subject: subject.trim(),
        body: body.trim(),
        type: msgType,
        priority,
        ...(msgType === "POLL" ? { pollOptions: cleanedOptions } : {}),
      };
      const payload =
        audience === "individual"
          ? { audience, recipientIds: recipients.map((r) => r.id), ...base }
          : { audience, roles: selectedRoles, ...base };

      const res = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.formErrors?.[0] || data.error || "Could not send message");

      setStatus(
        audience === "individual"
          ? `Sent to ${summarizeNames(recipients.map((r) => r.fullName))}.`
          : `Sent to ${data.sentCount} recipient${data.sentCount === 1 ? "" : "s"}.`
      );
      setRecipients([]);
      setSelectedRoles([]);
      setQuery("");
      setSubject("");
      setBody("");
      setPollOptions(["", ""]);
      setPriority("NORMAL");
      setMsgType("TEXT");
      loadSent();
    } catch (err) {
      setStatus(friendlyErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page-wrap">
      <AdminPageHeader
        section="Comms"
        title="Message"
        serif="users"
        subtitle="Send a direct message or a broadcast to a group. Serious priority blocks the app until opened."
      >
        <button className="btn btn-ghost" onClick={() => router.push("/admin")}>
          {AIcon.back()} Admin
        </button>
      </AdminPageHeader>

      <div className="two-col">
        <div className="panel">
          <h2 className="panel-title">{AIcon.send()} Compose</h2>
          <p className="panel-desc">Specific people or a group broadcast.</p>

          <form onSubmit={handleSend}>
            <div className="tabs mb-16" style={{ width: "fit-content" }}>
              <button type="button" className={`tab${audience === "individual" ? " is-active" : ""}`} onClick={() => setAudience("individual")}>
                Specific people
              </button>
              <button type="button" className={`tab${audience === "group" ? " is-active" : ""}`} onClick={() => setAudience("group")}>
                Group broadcast
              </button>
            </div>

            {audience === "individual" && (
              <div className="form-field">
                {recipients.length > 0 && (
                  <div className="chip-row">
                    {recipients.map((r) => (
                      <div key={r.id} className="chip">
                        <Avatar name={r.fullName} imageUrl={r.avatarUrl} size="sm" />
                        <span>{r.fullName}</span>
                        <button type="button" onClick={() => removeRecipient(r.id)} aria-label={`Remove ${r.fullName}`}>
                          {AIcon.x()}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="picker">
                  <label className="form-label">{recipients.length === 0 ? "Who's this for?" : "Add another"}</label>
                  <input
                    ref={searchInputRef}
                    className="input"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search name or email, then , for the next"
                  />
                  {results.length > 0 && (
                    <div className="picker-menu">
                      {results.map((u) => (
                        <button key={u.id} type="button" className="picker-item" onClick={() => addRecipient(u)}>
                          <Avatar name={u.fullName} imageUrl={u.avatarUrl} size="sm" />
                          <div>
                            <strong>{u.fullName}</strong> · {u.role}
                            <div className="sub">{displayEmail(u.email)}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {audience === "group" && (
              <div className="check-list">
                <label className="check-row is-all">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  All users
                </label>
                {ROLE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="check-row">
                    <input type="checkbox" checked={selectedRoles.includes(opt.value)} onChange={() => toggleRole(opt.value)} />
                    {opt.label}
                  </label>
                ))}
              </div>
            )}

            <div className="form-field">
              <label className="form-label">Subject</label>
              <input className="input" type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div className="form-field">
              <label className="form-label">Message</label>
              <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
            </div>

            <div className="form-field">
              <label className="form-label">Type</label>
              <div className="tabs" style={{ width: "fit-content" }}>
                <button type="button" className={`tab${msgType === "TEXT" ? " is-active" : ""}`} onClick={() => setMsgType("TEXT")}>
                  Message
                </button>
                <button type="button" className={`tab${msgType === "POLL" ? " is-active" : ""}`} onClick={() => setMsgType("POLL")}>
                  {AIcon.chart()} Poll
                </button>
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">Priority</label>
              <div className="tabs" style={{ width: "fit-content" }}>
                <button type="button" className={`tab${priority === "NORMAL" ? " is-active" : ""}`} onClick={() => setPriority("NORMAL")}>
                  Normal
                </button>
                <button
                  type="button"
                  className={`tab${priority === "SERIOUS" ? " is-active" : ""}`}
                  onClick={() => setPriority("SERIOUS")}
                  title="Blocks the recipient from using the app until they open it"
                >
                  {AIcon.warn()} Serious
                </button>
              </div>
            </div>

            {msgType === "POLL" && (
              <div className="form-field">
                <label className="form-label">Options</label>
                {pollOptions.map((opt, i) => (
                  <div key={i} className="inline-row">
                    <input
                      className="input"
                      type="text"
                      value={opt}
                      placeholder={`Option ${i + 1}`}
                      onChange={(e) => setPollOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove option ${i + 1}`}
                      >
                        {AIcon.x()}
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 8 && (
                  <button type="button" className="btn btn-ghost" onClick={() => setPollOptions((prev) => [...prev, ""])}>
                    {AIcon.plus()} Add option
                  </button>
                )}
              </div>
            )}

            {status && <div className={`form-status${status.startsWith("Sent") ? " is-ok" : ""}`}>{status}</div>}

            <div className="flex-end">
              <button className="btn btn-primary" type="submit" disabled={sending}>
                {sending ? "Sending..." : recipients.length > 1 ? `Send to ${recipients.length} people` : "Send message"} {!sending && AIcon.arrow()}
              </button>
            </div>
          </form>
        </div>

        <div>
          <h2 className="panel-title">{AIcon.list()} Recently sent</h2>
          <p className="panel-desc">Everything the admin team has sent recently.</p>

          {loadingSent && <SkeletonList rows={3} />}
          {!loadingSent && sentMessages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">{AIcon.send()}</div>
              <h3 className="empty-title">Nothing sent yet</h3>
            </div>
          )}

          <div className="stack-10">
            {sentMessages.map((m, i) => (
              <div
                key={`${m.subject}-${m.createdAt}-${i}`}
                className={`data-row link-row${m.type === "POLL" ? " poll-row-clickable" : ""}`}
                onClick={() => { if (m.type === "POLL") openPollAnalytics(m); }}
                onKeyDown={(e) => {
                  if (m.type === "POLL" && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    openPollAnalytics(m);
                  }
                }}
                role={m.type === "POLL" ? "link" : undefined}
                tabIndex={m.type === "POLL" ? 0 : undefined}
              >
                <div>
                  <div className="row-title">{m.subject}</div>
                  <div className="row-desc">
                    {m.recipientCount === 0
                      ? m.recipientSummary
                      : <>To {m.recipientCount === 1 ? m.recipientSummary : `${m.recipientCount} recipients — ${m.recipientSummary}`}</>}
                  </div>
                  <div className="row-code">{new Date(m.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="request-actions" style={{ justifyContent: "flex-end" }}>
                  {m.type === "POLL" ? (
                    <button
                      type="button"
                      className="status info"
                      onClick={(e) => { e.stopPropagation(); openPollAnalytics(m); }}
                      title="Open analytics for this poll"
                    >
                      Poll · Analytics
                    </button>
                  ) : null}
                  <span className={`status ${m.priority === "SERIOUS" ? "danger" : ""}`}>{m.priority === "SERIOUS" ? "Serious" : "Normal"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
