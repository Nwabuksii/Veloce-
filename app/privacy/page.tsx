import Link from "next/link";
import Logo from "@/app/components/Logo";

export const metadata = { title: "Privacy Policy — Veloce" };

export default function PrivacyPolicyPage() {
  return (
    <div className="page-wrap">
      <div className="app-container" style={{ maxWidth: 760 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.5rem" }}>
          <Logo size={34} />
          <h1>
            Veloce
          </h1>
        </div>

        <div style={{ lineHeight: 1.7 }}>
          <h2>Privacy Policy</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Last updated: September 2026</p>

          <p>
            Veloce ("we", "us") is operated by Nwabuks, an individual, not a registered company. This policy explains
            what personal data Veloce collects from students and scribes using the platform at Babcock University,
            why, and what you can do about it. This is written to comply with Nigeria's Data Protection Act, 2023
            (NDPA), which applies to anyone processing the personal data of people in Nigeria — including an
            individual operator, not just registered companies.
          </p>

          <h3>1. What we collect</h3>
          <p>Specifically, and only, the following:</p>
          <ul>
            <li><strong>Account details:</strong> your full name, email address, and password (stored as an irreversible hash — we never see or store your actual password).</li>
            <li><strong>Academic details:</strong> your university, department, and level (e.g. "200L"), used to show you the right courses.</li>
            <li><strong>Purchase history:</strong> which notes you've bought, when, and how much was paid.</li>
            <li><strong>Content you upload</strong> (if you're a scribe): the PDF notes themselves, and text extracted from them for automated quality checks.</li>
            <li><strong>Bank account details</strong> (if you're a scribe requesting withdrawals): bank name, account number, and the account name your bank returns — needed to actually pay you.</li>
            <li><strong>Activity on the platform:</strong> ratings and reviews you leave, who you follow, messages sent to you, requests you vote on, and feedback you submit.</li>
            <li><strong>Basic technical data:</strong> your IP address, used briefly to prevent abuse (e.g. limiting how many login or signup attempts can come from one network in a short window) — not stored long-term or used to track you.</li>
          </ul>
          <p>We do not collect location data, browsing history outside Veloce, or any data from third-party trackers or advertising networks — there are none integrated into this site.</p>

          <h3>2. Why we collect it</h3>
          <ul>
            <li>To create and secure your account, and verify it's really you (email verification, login protection).</li>
            <li>To process payments and deliver the notes you've paid for.</li>
            <li>To pay scribes what they're owed for notes they've sold.</li>
            <li>To operate the trust and moderation systems that keep the marketplace usable — ratings, reports, and admin review of uploaded content.</li>
            <li>To respond to refund requests and payment disputes.</li>
            <li>To communicate with you about your account, purchases, or requests.</li>
          </ul>

          <h3>3. Who else sees it</h3>
          <p>Three outside services process parts of this data on our behalf, strictly to make the platform work:</p>
          <ul>
            <li><strong>Paystack</strong> — processes all payments. Veloce never sees or stores your card details; Paystack handles that directly.</li>
            <li><strong>Vercel</strong> — hosts the site and stores uploaded PDF files.</li>
            <li><strong>Brevo</strong> — sends transactional emails (verification links, password resets, purchase and refund notifications).</li>
          </ul>
          <p>
            We do not sell personal data to anyone, and we do not share it with advertisers — there is no advertising
            on Veloce. Babcock University itself does not have standing access to your Veloce account data; we would
            only disclose specific information if legally required to.
          </p>

          <h3>4. How long we keep it</h3>
          <p>
            Account and purchase data is kept for as long as your account exists, since purchase history is what
            proves you own access to a note. If you ask us to delete your account, we will delete what we can while
            keeping the minimum transaction record Nigerian law requires us to retain for financial record-keeping.
          </p>

          <h3>5. Your rights</h3>
          <p>Under the NDPA, you can ask us to:</p>
          <ul>
            <li>Tell you what personal data we hold about you.</li>
            <li>Correct inaccurate data (e.g. a misspelled name).</li>
            <li>Delete your account and associated personal data, subject to the retention note above.</li>
          </ul>
          <p>
            To exercise any of these, use the <Link href="/feedback">Feedback</Link> page while logged in, or contact
            us directly at the email address on your account confirmation.
          </p>

          <h3>6. Security</h3>
          <p>
            Passwords are hashed, never stored in plain text. Your login session is stored in an httpOnly cookie that
            client-side scripts cannot read. Access to uploaded notes is gated to people who've actually purchased
            them or have an administrative reason to view them.
          </p>

          <h3>7. Changes to this policy</h3>
          <p>
            If this policy changes in a way that matters, we'll update the date at the top and, for material changes,
            notify you through the platform's messaging system.
          </p>

          <h3>8. Contact</h3>
          <p>Questions about this policy or your data can be sent through the in-app Feedback page, or to the operator directly.</p>
        </div>
      </div>
    </div>
  );
}
