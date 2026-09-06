"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, saveUser, StoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

type Tab = "about" | "faq" | "contact" | "account";

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "How do I become a Scribe?",
    a: "Open the menu and choose \"Become a scribe,\" tell us why you'd be a good fit, and an admin will review your application. If it's rejected, you can apply again after 14 days.",
  },
  {
    q: "What happens if I'm removed as a Scribe?",
    a: "You keep your existing uploads and sales history, but you can no longer upload new notes. You can submit one reinstatement appeal per month from the \"Appeal reinstatement\" menu item.",
  },
  {
    q: "How do payments work?",
    a: "Payments are processed securely through Paystack. Once a payment is confirmed, the block unlocks immediately and you can download the notes from its page.",
  },
  {
    q: "Can I get a refund?",
    a: "Refunds are handled case by case — use the Contact tab here to reach an admin at your university and explain the situation.",
  },
  {
    q: "What if a block's notes are wrong, stolen, or low quality?",
    a: "Open the block's page and click \"Report.\" An admin will review it and can remove the content if needed.",
  },
  {
    q: "What if someone is behaving maliciously toward me?",
    a: "Visit their profile page and click \"Report user,\" describing what happened. Reports go straight to your university's admins.",
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [tab, setTab] = useState<Tab>("about");

  // Contact tab
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [contactLoading, setContactLoading] = useState(true);

  // Account tab
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [accountSubmitting, setAccountSubmitting] = useState(false);

  useEffect(() => {
    const storedUser = getStoredUser();
    if (!storedUser) {
      router.push("/login");
      return;
    }
    setUser(storedUser);
    setNewEmail(storedUser.email);
  }, [router]);

  useEffect(() => {
    if (tab !== "contact" || adminEmail !== null) return;
    setContactLoading(true);
    apiFetch("/api/settings/contact")
      .then((data) => setAdminEmail(data.adminEmail))
      .catch(() => setAdminEmail(""))
      .finally(() => setContactLoading(false));
  }, [tab, adminEmail]);

  async function handleAccountSubmit(e: FormEvent) {
    e.preventDefault();
    setAccountStatus("");

    if (!currentPassword) {
      setAccountStatus("Enter your current password to confirm changes.");
      return;
    }
    const emailChanged = user && newEmail.trim().toLowerCase() !== user.email.toLowerCase();
    if (!emailChanged && !newPassword) {
      setAccountStatus("Change your email and/or password before saving.");
      return;
    }

    setAccountSubmitting(true);
    try {
      const data = await apiFetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newEmail: emailChanged ? newEmail.trim() : undefined,
          newPassword: newPassword || undefined,
        }),
      });

      if (user) {
        const updatedUser = { ...user, email: data.user.email };
        saveUser(updatedUser);
        setUser(updatedUser);
      }
      setAccountStatus("Saved.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setAccountStatus(friendlyErrorMessage(err));
    } finally {
      setAccountSubmitting(false);
    }
  }

  if (!user) return null;

  const mailtoHref = adminEmail
    ? `mailto:${adminEmail}?subject=${encodeURIComponent("Veloce support request")}&body=${encodeURIComponent(
        `Hi,\n\nMy account email is ${user.email}.\n\n`
      )}`
    : undefined;

  return (
    <div className="page-wrap">
      <div className="app-container" style={{ maxWidth: 640 }}>
        <div className="top-bar">
          <div className="logo" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Logo size={34} />
            <div>
              <h1>
                Veloce <span className="accent">.</span>
              </h1>
              <div className="logo-sub">Settings</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn" onClick={() => router.push("/dashboard")}>
              <i className="fas fa-arrow-left"></i> Dashboard
            </button>
            <ProfileMenu />
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
          {([
            { key: "about", label: "About", icon: "fa-circle-info" },
            { key: "faq", label: "FAQ", icon: "fa-circle-question" },
            { key: "contact", label: "Contact admin", icon: "fa-envelope" },
            { key: "account", label: "Account", icon: "fa-user-gear" },
          ] as { key: Tab; label: string; icon: string }[]).map((t) => (
            <button
              key={t.key}
              className={`btn ${tab === t.key ? "btn-primary" : ""}`}
              onClick={() => setTab(t.key)}
            >
              <i className={`fas ${t.icon}`}></i> {t.label}
            </button>
          ))}
        </div>

        <div style={{ marginTop: "1.5rem" }}>
          {tab === "about" && (
            <div style={{ background: "white", border: "1px solid #e1e8f0", borderRadius: "1rem", padding: "1.2rem", lineHeight: 1.7, color: "#3b4c62" }}>
              <h2 style={{ marginBottom: "0.6rem" }}>About Veloce</h2>
              <p>
                Veloce is a marketplace where students turn the notes they've already taken into something other
                students can buy — organized by course and block, so anyone can find exactly the topic they're
                stuck on.
              </p>
              <p style={{ marginTop: "0.8rem" }}>
                Built for students, by a student who got tired of scrambling for good notes before exams —
                Veloce started as a way to make that easier for everyone else too.
              </p>
              <p style={{ marginTop: "0.8rem" }}>
                Have feedback or an idea for what's next? Use the Contact tab — we read every message.
              </p>
            </div>
          )}

          {tab === "faq" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
              {FAQ_ITEMS.map((item, i) => (
                <details
                  key={i}
                  style={{ background: "white", border: "1px solid #e1e8f0", borderRadius: "0.8rem", padding: "0.9rem 1rem" }}
                >
                  <summary style={{ cursor: "pointer", fontWeight: 600, color: "#1a2b3c" }}>{item.q}</summary>
                  <p style={{ marginTop: "0.6rem", color: "#5e7188", fontSize: "0.9rem", lineHeight: 1.6 }}>{item.a}</p>
                </details>
              ))}
            </div>
          )}

          {tab === "contact" && (
            <div style={{ background: "white", border: "1px solid #e1e8f0", borderRadius: "1rem", padding: "1.2rem" }}>
              <h2 style={{ marginBottom: "0.6rem" }}>Contact your admin</h2>
              {contactLoading && <p style={{ color: "#5e7188" }}>Loading...</p>}
              {!contactLoading && adminEmail && (
                <>
                  <p style={{ color: "#5e7188", marginBottom: "1rem" }}>
                    Questions, refund requests, or anything else — reach your university's admin directly.
                  </p>
                  <a className="btn btn-primary" href={mailtoHref}>
                    <i className="fas fa-envelope"></i> Email {adminEmail}
                  </a>
                </>
              )}
              {!contactLoading && !adminEmail && (
                <p style={{ color: "#5e7188" }}>
                  No admin is set up for your university yet — check back later.
                </p>
              )}
            </div>
          )}

          {tab === "account" && (
            <div style={{ background: "white", border: "1px solid #e1e8f0", borderRadius: "1rem", padding: "1.2rem" }}>
              <h2 style={{ marginBottom: "0.3rem" }}>Account</h2>
              <p style={{ color: "#5e7188", fontSize: "0.85rem", marginBottom: "1rem" }}>
                Change your email or password. Your name can't be changed here.
              </p>

              <form onSubmit={handleAccountSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.85rem", color: "#5e7188" }}>
                  Email
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    style={{ padding: "0.6rem", borderRadius: "0.6rem", border: "1px solid #d0dae8" }}
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.85rem", color: "#5e7188" }}>
                  New password (leave blank to keep current)
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    style={{ padding: "0.6rem", borderRadius: "0.6rem", border: "1px solid #d0dae8" }}
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.85rem", color: "#5e7188" }}>
                  Current password (required to save any change)
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    style={{ padding: "0.6rem", borderRadius: "0.6rem", border: "1px solid #d0dae8" }}
                  />
                </label>

                {accountStatus && (
                  <p style={{ color: accountStatus === "Saved." ? "#1b7e4a" : "#b13e3e", fontSize: "0.85rem" }}>
                    {accountStatus}
                  </p>
                )}

                <button className="btn btn-primary" type="submit" disabled={accountSubmitting}>
                  {accountSubmitting ? "Saving..." : "Save changes"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
