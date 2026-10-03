"use client";

import { useEffect, useState, FormEvent, ReactElement } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, saveUser, StoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import "@/app/admin/admin.css";
import { SkeletonCard } from "@/app/components/Skeleton";
import { toggleTheme } from "@/app/components/toggle-theme";
import AvatarPicker from "@/app/components/AvatarPicker";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { REFUND_WINDOW_MINUTES } from "@/lib/pricing";

type Tab = "about" | "faq" | "contact" | "account" | "display";

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
    a: "Payments are processed securely through Paystack. Once a payment is confirmed, the note unlocks immediately and you can read it in the reader. Notes can't be downloaded.",
  },
  {
    q: "Can I get a refund?",
    a: `You can request a refund within ${REFUND_WINDOW_MINUTES} minutes of buying: go to Purchases, find the note and tap Request refund. An admin reviews it, and an approved refund comes back as credit for your next purchase. After ${REFUND_WINDOW_MINUTES} minutes the window closes.`,
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
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  // Contact tab
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [contactLoading, setContactLoading] = useState(true);

  // Account tab
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [profileInfo, setProfileInfo] = useState<{
    universityName: string;
    departmentName: string | null;
    level: string | null;
  } | null>(null);

  // Two-step verification (admins only) — opt-in per admin.
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [mfaStep, setMfaStep] = useState<"idle" | "password" | "code" | "codes" | "disable">("idle");
  const [mfaPassword, setMfaPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSecret, setMfaSecret] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [mfaStatus, setMfaStatus] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);

  useEffect(() => {
    const storedUser = getStoredUser();
    if (!storedUser) {
      router.push("/login");
      return;
    }
    setUser(storedUser);
    setNewEmail(storedUser.email);
    // Deep link, e.g. /settings?tab=account from the admin two-step reminder.
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted === "about" || wanted === "faq" || wanted === "contact" || wanted === "account" || wanted === "display") {
      setTab(wanted);
    }
  }, [router]);

  useEffect(() => {
    if (tab !== "contact" || adminEmail !== null) return;
    setContactLoading(true);
    apiFetch("/api/settings/contact")
      .then((data) => setAdminEmail(data.adminEmail))
      .catch(() => setAdminEmail(""))
      .finally(() => setContactLoading(false));
  }, [tab, adminEmail]);

  useEffect(() => {
    if (tab !== "account" || profileInfo !== null) return;
    apiFetch("/api/account")
      .then((data) =>
        setProfileInfo({
          universityName: data.user.university?.name ?? "",
          departmentName: data.user.department?.name ?? null,
          level: data.user.level ?? null,
        })
      )
      .catch(() => {});
  }, [tab, profileInfo]);

  useEffect(() => {
    if (tab !== "account" || user?.role !== "ADMIN" || mfaEnabled !== null) return;
    apiFetch("/api/account/mfa")
      .then((data) => setMfaEnabled(!!(data.enabled ?? data.mfaEnabled)))
      .catch(() => setMfaEnabled(false));
  }, [tab, user, mfaEnabled]);

  function resetMfaForm() {
    setMfaStep("idle");
    setMfaPassword("");
    setMfaCode("");
    setMfaSecret(null);
    setMfaStatus("");
  }

  async function handleMfaSetup(e: FormEvent) {
    e.preventDefault();
    if (!mfaPassword) {
      setMfaStatus("Enter your current password.");
      return;
    }
    setMfaBusy(true);
    setMfaStatus("");
    try {
      const data = await apiFetch("/api/account/mfa", {
        method: "POST",
        body: JSON.stringify({ action: "setup", currentPassword: mfaPassword }),
      });
      setMfaSecret({ secret: data.secret, otpauthUri: data.otpauthUri });
      setMfaPassword("");
      setMfaStep("code");
    } catch (err) {
      setMfaStatus(friendlyErrorMessage(err));
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleMfaEnable(e: FormEvent) {
    e.preventDefault();
    const code = mfaCode.replace(/\D/g, "");
    if (code.length !== 6) {
      setMfaStatus("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setMfaBusy(true);
    setMfaStatus("");
    try {
      const data = await apiFetch("/api/account/mfa", {
        method: "POST",
        body: JSON.stringify({ action: "enable", code }),
      });
      setRecoveryCodes(data.recoveryCodes ?? []);
      setMfaEnabled(true);
      setMfaSecret(null);
      setMfaCode("");
      setMfaStep("codes");
    } catch (err) {
      setMfaStatus(friendlyErrorMessage(err));
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleMfaDisable(e: FormEvent) {
    e.preventDefault();
    if (!mfaPassword || !mfaCode.trim()) {
      setMfaStatus("Enter your password and a code (an authenticator code or a recovery code).");
      return;
    }
    setMfaBusy(true);
    setMfaStatus("");
    try {
      await apiFetch("/api/account/mfa", {
        method: "POST",
        body: JSON.stringify({ action: "disable", currentPassword: mfaPassword, code: mfaCode.trim() }),
      });
      setMfaEnabled(false);
      resetMfaForm();
      setMfaStatus("Two-step verification is off.");
    } catch (err) {
      setMfaStatus(friendlyErrorMessage(err));
    } finally {
      setMfaBusy(false);
    }
  }

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
      if (data.emailChangePending) {
        // The email only changes once the new address confirms it.
        setNewEmail(data.user.email);
        setAccountStatus(
          `We sent a confirmation link to ${data.pendingEmail}. Your email stays ${data.user.email} until you click it${newPassword ? " (your new password is already saved)" : ""}. We also emailed your current address in case this wasn't you.`
        );
      } else {
        setAccountStatus("Saved.");
      }
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

  const TABS: { key: Tab; label: string; icon: ReactElement }[] = [
    { key: "about", label: "About", icon: AIcon.spark() },
    { key: "faq", label: "FAQ", icon: AIcon.list() },
    { key: "contact", label: "Contact support", icon: AIcon.mail() },
    { key: "account", label: "Account", icon: AIcon.user() },
    { key: "display", label: "Display", icon: AIcon.moon() },
  ];

  return (
    <div className="page-wrap">
      <div className="narrow">
        <AdminPageHeader section="Account" title="Your" serif="settings" subtitle="Manage your account, preferences, and everything else from one place.">
          <button className="btn btn-ghost" onClick={() => router.push("/dashboard")}>
            {AIcon.back()} Catalog
          </button>
        </AdminPageHeader>

        <div className="tabs mb-24">
          {TABS.map((t) => (
            <button key={t.key} className={`tab${tab === t.key ? " is-active" : ""}`} onClick={() => setTab(t.key)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === "about" && (
          <div className="panel">
            <h2 className="panel-title">{AIcon.spark()} About Veloce</h2>
            <p className="panel-desc">
              A marketplace where students turn the notes they&apos;ve already taken into something other students can buy — organized by course and block.
            </p>
            <div className="prose">
              <p>
                Built for students, by a student who got tired of scrambling for good notes before exams — Veloce started as a way to make that easier for everyone else too.
              </p>
              <p>
                Have feedback or an idea for what&apos;s next? Use the <strong>Contact support</strong> tab — we read every message.
              </p>
            </div>
          </div>
        )}

        {tab === "faq" && (
          <div className="panel">
            <h2 className="panel-title">{AIcon.list()} Frequently asked</h2>
            <p className="panel-desc">Everything students and scribes ask us most often.</p>
            <div className="faq-list">
              {FAQ_ITEMS.map((item, i) => (
                <details key={i} className="faq-item">
                  <summary>{item.q}</summary>
                  <div className="faq-body">{item.a}</div>
                </details>
              ))}
            </div>
          </div>
        )}

        {tab === "contact" && (
          <div className="panel">
            <h2 className="panel-title">{AIcon.mail()} Contact support</h2>
            <p className="panel-desc">Questions, feedback, or anything else — send us an email.</p>
            {contactLoading && <SkeletonCard height="4.5rem" />}
            {!contactLoading && adminEmail && (
              <div className="contact-cta">
                <div className="icon-tile">{AIcon.mail()}</div>
                <div className="info">
                  <div className="info-title">Email support</div>
                  <div className="info-desc">
                    Reach us at <strong>{adminEmail}</strong>
                  </div>
                </div>
                <a className="btn btn-primary" href={mailtoHref}>
                  {AIcon.send()} Email support
                </a>
              </div>
            )}
            {!contactLoading && !adminEmail && (
              <p className="panel-desc">We couldn&apos;t load the support address. Please try again later.</p>
            )}
          </div>
        )}

        {tab === "account" && (
          <div className="panel">
            <h2 className="panel-title">{AIcon.gear()} Account</h2>
            <p className="panel-desc">Change your email or password. Your name can&apos;t be changed here.</p>

            <div className="profile-summary">
              <div><div className="k">Name</div><div className="v">{user.fullName}</div></div>
              <div><div className="k">School</div><div className="v">{profileInfo?.universityName || "—"}</div></div>
              <div><div className="k">Department</div><div className="v">{profileInfo?.departmentName || "Not set"}</div></div>
              <div><div className="k">Level</div><div className="v">{profileInfo?.level || "Not set"}</div></div>
            </div>

            <form onSubmit={handleAccountSubmit}>
              <div className="form-field">
                <label className="form-label">Email</label>
                <input className="input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </div>
              <div className="form-field">
                <label className="form-label">New password</label>
                <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Leave blank to keep current — at least 8 characters" />
              </div>
              <div className="form-field">
                <label className="form-label">Current password <span className="text-danger">*</span></label>
                <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Required to save any change" />
              </div>

              {accountStatus && <div className={`form-status${accountStatus === "Saved." ? " is-ok" : ""}`}>{accountStatus}</div>}

              <div className="form-footer">
                <button className="btn btn-primary" type="submit" disabled={accountSubmitting}>
                  {accountSubmitting ? "Saving..." : <>{AIcon.check()} Save changes</>}
                </button>
              </div>
            </form>
          </div>
        )}

        {tab === "account" && user.role === "ADMIN" && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h2 className="panel-title">{AIcon.eye()} Two-step verification</h2>
            <p className="panel-desc">
              Adds a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy) to your admin login. Optional, but a password alone is all that protects an admin account without it.
            </p>

            {mfaEnabled === null && <SkeletonCard height="4.5rem" />}

            {mfaEnabled !== null && mfaStep === "idle" && (
              <div className="display-row">
                <div className="display-info">
                  <div className="display-title">{mfaEnabled ? "On" : "Off"}</div>
                  <div className="display-desc">
                    {mfaEnabled
                      ? "You'll be asked for a code every time you sign in. Turning it on or off signs you out of your other devices."
                      : "You currently sign in with just your password."}
                  </div>
                </div>
                <button
                  className={`btn ${mfaEnabled ? "btn-danger" : "btn-primary"}`}
                  onClick={() => {
                    resetMfaForm();
                    setMfaStep(mfaEnabled ? "disable" : "password");
                  }}
                >
                  {mfaEnabled ? "Turn off" : "Turn on"}
                </button>
              </div>
            )}

            {mfaStep === "password" && (
              <form onSubmit={handleMfaSetup}>
                <div className="form-field">
                  <label className="form-label">Current password</label>
                  <input className="input" type="password" autoComplete="current-password" value={mfaPassword} onChange={(e) => setMfaPassword(e.target.value)} />
                </div>
                {mfaStatus && <div className="form-status">{mfaStatus}</div>}
                <div className="form-actions">
                  <button className="btn btn-primary" type="submit" disabled={mfaBusy}>{mfaBusy ? "Checking..." : "Continue"}</button>
                  <button className="btn btn-ghost" type="button" onClick={resetMfaForm}>Cancel</button>
                </div>
              </form>
            )}

            {mfaStep === "code" && mfaSecret && (
              <form onSubmit={handleMfaEnable}>
                <div className="prose">
                  <p>1. In your authenticator app, add a new account and choose <strong>enter a setup key</strong>.</p>
                  <p>2. Type this key in (spaces don&apos;t matter):</p>
                </div>
                <div className="claim" style={{ margin: "10px 0 12px" }}>
                  <div className="claim-text" style={{ fontFamily: "var(--font-mono), ui-monospace, monospace", wordBreak: "break-all" }}>{mfaSecret.secret}</div>
                </div>
                <p className="form-hint" style={{ marginBottom: 16 }}>
                  On a phone with the app installed you can also <a href={mfaSecret.otpauthUri}>open this setup link</a>.
                </p>
                <div className="form-field">
                  <label className="form-label">3. Enter the 6-digit code it shows</label>
                  <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} />
                </div>
                {mfaStatus && <div className="form-status">{mfaStatus}</div>}
                <div className="form-actions">
                  <button className="btn btn-primary" type="submit" disabled={mfaBusy}>{mfaBusy ? "Checking..." : "Turn on"}</button>
                  <button className="btn btn-ghost" type="button" onClick={resetMfaForm}>Cancel</button>
                </div>
              </form>
            )}

            {mfaStep === "codes" && (
              <div>
                <div className="notice">Two-step verification is on.</div>
                <p className="panel-desc">
                  Save these recovery codes somewhere safe <strong>now</strong> — they&apos;re shown only once. Each works one time if you lose your phone.
                </p>
                <div className="claim">
                  <div className="claim-text" style={{ fontFamily: "var(--font-mono), ui-monospace, monospace", columns: 2 }}>
                    {recoveryCodes.join("\n")}
                  </div>
                </div>
                <div className="form-actions" style={{ marginTop: 14 }}>
                  <button className="btn btn-ghost" type="button" onClick={() => navigator.clipboard?.writeText(recoveryCodes.join("\n"))}>Copy codes</button>
                  <button className="btn btn-primary" type="button" onClick={() => { setRecoveryCodes([]); resetMfaForm(); }}>I&apos;ve saved them</button>
                </div>
              </div>
            )}

            {mfaStep === "disable" && (
              <form onSubmit={handleMfaDisable}>
                <div className="form-field">
                  <label className="form-label">Current password</label>
                  <input className="input" type="password" autoComplete="current-password" value={mfaPassword} onChange={(e) => setMfaPassword(e.target.value)} />
                </div>
                <div className="form-field">
                  <label className="form-label">Authenticator code or recovery code</label>
                  <input className="input" autoComplete="one-time-code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} />
                </div>
                {mfaStatus && <div className="form-status">{mfaStatus}</div>}
                <div className="form-actions">
                  <button className="btn btn-danger" type="submit" disabled={mfaBusy}>{mfaBusy ? "Turning off..." : "Turn off"}</button>
                  <button className="btn btn-ghost" type="button" onClick={resetMfaForm}>Cancel</button>
                </div>
              </form>
            )}

            {mfaStep === "idle" && mfaStatus && <div className="form-status is-ok" style={{ marginTop: 12 }}>{mfaStatus}</div>}
          </div>
        )}

        {tab === "display" && (
          <div className="panel">
            <h2 className="panel-title">{AIcon.moon()} Display</h2>
            <p className="panel-desc">Choose how Veloce looks, and how you show up around the app.</p>

            <AvatarPicker />

            <div className="display-row">
              <div className="display-info">
                <div className="display-title">Dark mode</div>
                <div className="display-desc">A darker, high-contrast look across the whole app. We also follow your system preference by default.</div>
              </div>
              <button
                role="switch"
                aria-checked={isDark}
                aria-label="Toggle dark mode"
                className="toggle-lg press-on-tap"
                onClick={() => {
                  toggleTheme();
                  setIsDark((d) => !d);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
