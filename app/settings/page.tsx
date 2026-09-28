"use client";

import { useCallback, useEffect, useRef, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { clearSession, getStoredUser, saveUser, StoredUser, USER_UPDATED_EVENT } from "@/lib/client-session";
import Avatar from "@/app/components/Avatar";
import "@/app/admin/admin.css";
import "./settings.css";
import { SkeletonCard } from "@/app/components/Skeleton";
import { toggleTheme } from "@/app/components/toggle-theme";
import AvatarPicker from "@/app/components/AvatarPicker";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

type Tab = "about" | "faq" | "contact" | "account" | "display";

const TABS: { key: Tab; label: string; desc: string; icon: string }[] = [
  { key: "about", label: "About", desc: "What Veloce is and why", icon: "fa-circle-info" },
  { key: "faq", label: "FAQ", desc: "Answers to common questions", icon: "fa-circle-question" },
  { key: "contact", label: "Contact admin", desc: "Reach your university admin", icon: "fa-envelope" },
  { key: "account", label: "Account", desc: "Email and password", icon: "fa-user-gear" },
  { key: "display", label: "Display", desc: "Theme and profile icon", icon: "fa-moon" },
];

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
    a: "Payments are processed securely through Paystack. Once a payment is confirmed, the notes unlock immediately and you can download them from their page.",
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

function PanelHead({ icon, eyebrow, title, serif, sub }: { icon: string; eyebrow: string; title?: string; serif: string; sub: string }) {
  return (
    <div className="sx-panel-head">
      <div className="sx-panel-head-icon"><i className={`fas ${icon}`} aria-hidden="true" /></div>
      <div className="sx-panel-head-text">
        <div className="sx-eyebrow">Preferences · {eyebrow}</div>
        <h1 className="sx-panel-title">
          {title ? `${title} ` : null}
          <span className="serif">{serif}</span>
        </h1>
        <p className="sx-panel-sub">{sub}</p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [tab, setTab] = useState<Tab>("about");
  const [isDark, setIsDark] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const contentRef = useRef<HTMLElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  // Pick up changes saved elsewhere (a new profile photo, for instance).
  useEffect(() => {
    const sync = () => {
      const stored = getStoredUser();
      if (stored) setUser(stored);
    };
    window.addEventListener(USER_UPDATED_EVENT, sync);
    return () => window.removeEventListener(USER_UPDATED_EVENT, sync);
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Drawer (phones/tablets): lock page scroll, close on Escape, and close
  // itself if the window grows back to desktop width.
  useEffect(() => {
    if (!drawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        triggerRef.current?.focus();
      }
    };
    const mq = window.matchMedia("(min-width: 901px)");
    const onMq = (e: MediaQueryListEvent) => {
      if (e.matches) setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
    };
  }, [drawerOpen]);

  function selectTab(key: Tab) {
    setTab(key);
    setDrawerOpen(false);
    // Bring the new panel into view if the page is scrolled past it.
    requestAnimationFrame(() => {
      const el = contentRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      if (top < 70) window.scrollTo({ top: top + window.scrollY - 90, behavior: "smooth" });
    });
  }

  async function handleLogout() {
    setDrawerOpen(false);
    await clearSession();
    router.push("/login");
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
      setAccountStatus("Saved.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setAccountStatus(friendlyErrorMessage(err));
    } finally {
      setAccountSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="page-wrap">
        <div className="sx">
          <div className="sx-layout">
            <SkeletonCard height="18rem" />
            <SkeletonCard height="22rem" />
          </div>
        </div>
      </div>
    );
  }

  const mailtoHref = adminEmail
    ? `mailto:${adminEmail}?subject=${encodeURIComponent("Veloce support request")}&body=${encodeURIComponent(
        `Hi,\n\nMy account email is ${user.email}.\n\n`
      )}`
    : undefined;

  const imageUrl = user.avatarDisplay === "custom" ? user.avatarUrl : null;
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];

  return (
    <div className="page-wrap">
      <div className="sx">
        <div className="sx-layout">
          {/* Phone/tablet: a bar that opens the section list as a drawer */}
          <button
            ref={triggerRef}
            type="button"
            className="sx-trigger"
            aria-label="Open settings menu"
            aria-expanded={drawerOpen}
            aria-controls="sx-sidebar"
            onClick={() => setDrawerOpen(true)}
          >
            <span className="sx-trigger-icon"><i className="fas fa-bars" aria-hidden="true" /></span>
            <span className="sx-trigger-text">
              <span className="sx-trigger-label">Settings</span>
              <span className="sx-trigger-title">{active.label}</span>
            </span>
            <i className="fas fa-chevron-right sx-trigger-caret" aria-hidden="true" />
          </button>

          <div className={`sx-backdrop${drawerOpen ? " is-open" : ""}`} onClick={closeDrawer} aria-hidden="true" />

          <aside id="sx-sidebar" className={`sx-sidebar${drawerOpen ? " is-open" : ""}`} aria-label="Settings sections">
            <div className="sx-sidebar-head">
              <Avatar name={user.fullName} imageUrl={imageUrl} enlargeOnTap={false} />
              <div className="sx-sidebar-user">
                <div className="sx-sidebar-name">{user.fullName}</div>
                <div className="sx-sidebar-email">{user.email}</div>
              </div>
              <button ref={closeBtnRef} type="button" className="sx-sidebar-close" aria-label="Close settings menu" onClick={closeDrawer}>
                <i className="fas fa-xmark" aria-hidden="true" />
              </button>
            </div>

            <div className="sx-sidebar-label">Preferences</div>
            <nav className="sx-sidebar-nav">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`sx-item${tab === t.key ? " is-active" : ""}`}
                  aria-current={tab === t.key ? "page" : undefined}
                  onClick={() => selectTab(t.key)}
                >
                  <span className="sx-item-icon"><i className={`fas ${t.icon}`} aria-hidden="true" /></span>
                  <span className="sx-item-text">
                    <span className="sx-item-title">{t.label}</span>
                    <span className="sx-item-desc">{t.desc}</span>
                  </span>
                </button>
              ))}
            </nav>

            <div className="sx-sidebar-foot">
              <button type="button" className="sx-signout" onClick={handleLogout}>
                <i className="fas fa-right-from-bracket" aria-hidden="true" /> Sign out
              </button>
            </div>
          </aside>

          <section className="sx-content" ref={contentRef}>
            {tab === "about" && (
              <div className="sx-panel" key="about">
                <PanelHead
                  icon="fa-circle-info"
                  eyebrow="About"
                  title="About"
                  serif="Veloce"
                  sub="A marketplace where students turn the notes they've already taken into something other students can buy — organized by course and block."
                />
                <div className="sx-body-copy">
                  <p>
                    Built for students, by a student who got tired of scrambling for good notes before exams — Veloce started as a way to make that easier for everyone else too.
                  </p>
                  <p>
                    Have feedback or an idea for what&apos;s next? Open <strong>Contact admin</strong> in the sidebar — we read every message.
                  </p>
                </div>
              </div>
            )}

            {tab === "faq" && (
              <div className="sx-panel" key="faq">
                <PanelHead icon="fa-circle-question" eyebrow="FAQ" title="Frequently" serif="asked" sub="Everything students and scribes ask us most often." />
                <div className="sx-faq-list">
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
              <div className="sx-panel" key="contact">
                <PanelHead
                  icon="fa-envelope"
                  eyebrow="Contact"
                  title="Contact your"
                  serif="admin"
                  sub="Questions, refund requests, or anything else — reach your university's admin directly."
                />
                {contactLoading && <SkeletonCard height="6rem" />}
                {!contactLoading && adminEmail && (
                  <div className="sx-contact">
                    <div className="sx-contact-icon"><i className="fas fa-envelope" aria-hidden="true" /></div>
                    <div className="sx-contact-info">
                      <div className="sx-contact-title">Email support</div>
                      <div className="sx-contact-desc">
                        Reach us at <strong>{adminEmail}</strong>
                      </div>
                    </div>
                    <a className="btn btn-primary" href={mailtoHref}>
                      <i className="fas fa-paper-plane" aria-hidden="true" /> Email admin
                    </a>
                  </div>
                )}
                {!contactLoading && !adminEmail && (
                  <p className="sx-body-copy">No admin is set up for your university yet — check back later.</p>
                )}
              </div>
            )}

            {tab === "account" && (
              <div className="sx-panel" key="account">
                <PanelHead icon="fa-user-gear" eyebrow="Account" title="Your" serif="account" sub="Change your email or password. Your name can't be changed here." />

                <div className="sx-summary">
                  <div><div className="k">Name</div><div className="v">{user.fullName}</div></div>
                  <div><div className="k">School</div><div className="v">{profileInfo?.universityName || "—"}</div></div>
                  <div><div className="k">Department</div><div className="v">{profileInfo?.departmentName || "Not set"}</div></div>
                  <div><div className="k">Level</div><div className="v">{profileInfo?.level || "Not set"}</div></div>
                </div>

                <form onSubmit={handleAccountSubmit}>
                  <div className="form-field">
                    <label className="form-label" htmlFor="sx-email">Email</label>
                    <input id="sx-email" className="input" type="email" autoComplete="email" inputMode="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                  </div>
                  <div className="form-field">
                    <label className="form-label" htmlFor="sx-new-password">New password</label>
                    <input id="sx-new-password" className="input" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Leave blank to keep current — at least 8 characters" />
                  </div>
                  <div className="form-field">
                    <label className="form-label" htmlFor="sx-current-password">Current password <span className="sx-req">*</span></label>
                    <input id="sx-current-password" className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Required to save any change" />
                  </div>

                  {accountStatus && (
                    <div className={`form-status${accountStatus === "Saved." ? " is-ok" : ""}`} role="status">{accountStatus}</div>
                  )}

                  <div className="sx-form-foot">
                    <button className="btn btn-primary" type="submit" disabled={accountSubmitting}>
                      {accountSubmitting ? "Saving..." : <><i className="fas fa-check" aria-hidden="true" /> Save changes</>}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {tab === "display" && (
              <div className="sx-panel" key="display">
                <PanelHead icon="fa-moon" eyebrow="Display" title="Look &" serif="feel" sub="Choose how Veloce looks and how you show up around the app." />

                <AvatarPicker />

                <div className="sx-block">
                  <div className="sx-block-info">
                    <div className="sx-block-title">Dark mode</div>
                    <div className="sx-block-desc">A darker, high-contrast look across the whole app. We also follow your system preference by default.</div>
                  </div>
                  <button
                    type="button"
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
          </section>
        </div>
      </div>
    </div>
  );
}
