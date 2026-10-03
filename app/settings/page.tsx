"use client";

import { useEffect, useState, FormEvent, ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getStoredUser, saveUser, StoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import "@/app/admin/admin.css";
import { SkeletonCard } from "@/app/components/Skeleton";
import { toggleTheme } from "@/app/components/toggle-theme";
import AvatarPicker from "@/app/components/AvatarPicker";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { SUPPORT_EMAIL } from "@/lib/support-contact";

type Tab = "about" | "faq" | "contact" | "account" | "display";

const FAQ_GROUPS: { title: string; items: { q: string; a: string }[] }[] = [
  {
    title: "Getting started",
    items: [
      {
        q: "Who can use Veloce, and how do I verify my account?",
        a: "Veloce is for students of the university you register under. After signing up, open the verification link we email you within 10 minutes. If it expires or never arrives, ask for a new link and check your spam folder.",
      },
      {
        q: "I forgot my password. What do I do?",
        a: "Use \"Forgot password\" on the login page and follow the link we email you. Passwords need at least 8 characters, with at least one letter and one number.",
      },
    ],
  },
  {
    title: "Buying and reading notes",
    items: [
      {
        q: "How much do notes cost and how do I pay?",
        a: "The price is shown before you buy. A standard note is ₦1,000. A note written to fulfil a student request is ₦900 for the students who voted for that request. Payment is handled by Paystack and your note unlocks as soon as it's confirmed. If you have credit, it's used automatically first.",
      },
      {
        q: "Can I download or screenshot a note?",
        a: "No. Notes are read inside Veloce and can't be downloaded. Every page is stamped with your name and email, so any screenshot, photo or shared copy can be traced to your account. Sharing or reselling notes can get your account banned.",
      },
      {
        q: "I was charged but I don't see my note.",
        a: "Wait a minute, then refresh your Purchases page. If it's still missing, email " + SUPPORT_EMAIL + " with your payment reference and the email you signed up with. Please don't pay a second time.",
      },
      {
        q: "Can I get a refund?",
        a: "Yes, but only within 30 minutes of buying. Go to your Purchases page and request a refund there. An admin reviews every request; it isn't automatic. If it's approved, you lose access to the note and get credit for everything you paid. If it's declined, the purchase stands. After 30 minutes the refund option closes.",
      },
      {
        q: "What is credit, and can I withdraw it?",
        a: "Credit is what you receive when a refund is approved. It's applied automatically to your next purchases, never expires, and any leftover is kept for later. It is not cash — it can't be withdrawn or transferred, so only request a refund if you're happy to get credit.",
      },
      {
        q: "Should I dispute a charge with my bank instead?",
        a: "Please don't. A bank dispute (chargeback) immediately removes your access to the note, gives you no credit, and repeated chargebacks can lead to a ban. Use the refund request on your Purchases page instead.",
      },
      {
        q: "Why are there notes I can't find for my course?",
        a: "Use the Requests page to ask for a topic. Other students can vote for it, and when a scribe writes it, the voters get the ₦900 request price.",
      },
    ],
  },
  {
    title: "Scribes and earnings",
    items: [
      {
        q: "How do I become a Scribe?",
        a: "Open the menu and choose \"Become a scribe,\" tell us why you'd be a good fit, and an admin will review your application. If it's rejected, you can apply again after 14 days.",
      },
      {
        q: "How much does a scribe earn on a sale?",
        a: "A fixed ₦600 per sale, whether the note sold for ₦1,000 or ₦900. Veloce keeps the rest. This is worked out on the full price, whether the buyer paid with cash, credit or both.",
      },
      {
        q: "When can I withdraw my earnings?",
        a: "A sale becomes yours about 31 minutes after it's made, if the buyer hasn't asked for a refund. If they have, the money stays on hold until an admin decides. You can request one withdrawal per calendar month, during the first 7 days of the month, for at least ₦2,000 and up to your available balance. Withdrawals are approved by an admin and paid to your bank account, so double-check your account number.",
      },
      {
        q: "What can't I upload?",
        a: "Only your own original notes. Don't upload lecturers' slides, textbook pages, past exam papers, or anything copied from someone else. Uploads go through an automated check and admin review. A flag means a person will look at it; it isn't automatically a rejection.",
      },
      {
        q: "What happens if I'm removed as a Scribe?",
        a: "You keep your existing uploads and sales history, but you can no longer upload new notes. You can appeal for reinstatement from the \"Appeal reinstatement\" menu item. If an appeal is rejected, you can submit another after 30 days.",
      },
    ],
  },
  {
    title: "Leaderboard and badges",
    items: [
      {
        q: "How is the leaderboard worked out?",
        a: "Scribes are scored on verified buyer ratings, purchases, notes read, followers and recent activity. The score rewards doing well across many notes rather than one viral note. Only live notes count, and refunded, disputed and self-made purchases don't. There's an all-time view and a per-semester view that resets when a new semester starts.",
      },
      {
        q: "Why hasn't my score changed yet?",
        a: "The leaderboard refreshes about once a day, not instantly, so new sales and ratings show up on the next refresh.",
      },
      {
        q: "How do I earn badges?",
        a: "Finish in the top 3 of your department, your school, or (when there's more than one school) globally, or in the top 3 for a category like Highest Rated or Top Seller. Each badge is dated by the semester or year you earned it, and you can display up to 5 on your profile. The Badges page explains each one.",
      },
      {
        q: "Does cheating the leaderboard work?",
        a: "No. Buying your own notes, fake accounts, trading reviews or follows, and similar tricks are against the rules. Those results can be removed, along with badges, payouts and the account itself.",
      },
      {
        q: "I've graduated. Do I keep my badges?",
        a: "Yes. Graduated scribes leave the rankings, but badges you've already earned stay on your profile.",
      },
    ],
  },
  {
    title: "Your account and safety",
    items: [
      {
        q: "How do I change my email or password?",
        a: "Go to the Account tab. You'll need your current password. When you change your email, your old address is told, and can undo the change for 7 days. Your name can't be changed here, so email " + SUPPORT_EMAIL + " if it's wrong.",
      },
      {
        q: "How long do I stay logged in?",
        a: "Up to 7 days on a device. Log out when you use a shared or public computer.",
      },
      {
        q: "What if a block's notes are wrong, stolen, or low quality?",
        a: "Open the block's page and click \"Report.\" An admin will review it and can remove the content if needed.",
      },
      {
        q: "What if someone is behaving maliciously toward me?",
        a: "Visit their profile page and click \"Report user,\" describing what happened. Reports go straight to your university's admins.",
      },
      {
        q: "How do I stay safe from scams?",
        a: "Never share your password or a verification code with anyone, including people who say they're from Veloce. We never ask for either. Only request refunds through your Purchases page, and only pay through the Veloce checkout.",
      },
      {
        q: "How do I delete my account or get a copy of my data?",
        a: "Email " + SUPPORT_EMAIL + " from the email on your account, or use the Feedback page. Scribes should withdraw their earnings first, and unspent credit can't be paid out. We remove your personal details, but keep the basic purchase and payment records that the law and other users' records require. See the Privacy Policy for details.",
      },
      {
        q: "How do I reach someone?",
        a: "Use the Contact tab for your university's admin, or email " + SUPPORT_EMAIL + ". For feature ideas or bugs, the Feedback page works best.",
      },
    ],
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
    { key: "contact", label: "Contact admin", icon: AIcon.mail() },
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
                <strong>Good to know:</strong> notes are read inside Veloce and can&apos;t be downloaded, and every page carries your name and email. Refunds can be requested within 30 minutes of buying and come back as credit, which is not cash. Scribes earn a fixed ₦600 per sale and can withdraw once a month, in the first 7 days of the month.
              </p>
              <p>
                Have feedback or an idea for what&apos;s next? Use the <strong>Contact</strong> tab or the <Link href="/feedback">Feedback</Link> page — we read every message. You can also email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
              </p>
              <p>
                Read our <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.
              </p>
            </div>
          </div>
        )}

        {tab === "faq" && (
          <div className="panel">
            <h2 className="panel-title">{AIcon.list()} Frequently asked</h2>
            <p className="panel-desc">Everything students and scribes ask us most often. Still stuck? Use the Contact tab.</p>
            {FAQ_GROUPS.map((group) => (
              <div key={group.title} style={{ marginTop: "1.25rem" }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "1.6px",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    marginBottom: 8,
                  }}
                >
                  {group.title}
                </div>
                <div className="faq-list">
                  {group.items.map((item) => (
                    <details key={item.q} className="faq-item">
                      <summary>{item.q}</summary>
                      <div className="faq-body">{item.a}</div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "contact" && (
          <div className="panel">
            <h2 className="panel-title">{AIcon.mail()} Contact your admin</h2>
            <p className="panel-desc">Questions, refund requests, or anything else — reach your university&apos;s admin directly.</p>
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
                  {AIcon.send()} Email admin
                </a>
              </div>
            )}
            {!contactLoading && !adminEmail && (
              <p className="panel-desc">No admin is set up for your university yet — check back later.</p>
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

            <div className="prose" style={{ marginTop: "1.5rem" }}>
              <p>
                <strong>Your data and sessions.</strong> You stay logged in on a device for up to 7 days, so log out on shared computers. To get a copy of your data or close your account, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from this account&apos;s email address. Scribes should withdraw their earnings first, and unspent credit can&apos;t be paid out. See the <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms</Link>.
              </p>
            </div>
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
