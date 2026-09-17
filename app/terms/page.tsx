import Link from "next/link";
import Logo from "@/app/components/Logo";

export const metadata = { title: "Terms of Service — Veloce" };

export default function TermsPage() {
  return (
    <div className="page-wrap">
      <div className="app-container" style={{ maxWidth: 760 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.5rem" }}>
          <Logo size={34} />
          <h1>
            Veloce <span className="accent">.</span>
          </h1>
        </div>

        <div style={{ lineHeight: 1.7 }}>
          <h2>Terms of Service</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Last updated: September 2026</p>

          <p>
            Veloce is operated by Nwabuks, an individual, not a registered company. By creating an account, you agree
            to these terms. If you don't agree, don't use Veloce.
          </p>

          <h3>1. What Veloce is</h3>
          <p>
            Veloce is a marketplace where Babcock University students ("scribes") can sell their own course notes to
            other students, and where students can request notes for courses that don't have any yet. Veloce takes a
            percentage of each sale (see §4) in exchange for running the platform.
          </p>

          <h3>2. Content ownership and what you can upload</h3>
          <p>By uploading notes as a scribe, you confirm that:</p>
          <ul>
            <li>The notes are your own original work — your own summaries, explanations, and understanding of the course material.</li>
            <li>You are not uploading a professor's slides, a textbook's actual text or images, past exam papers, or any other material you don't hold the rights to distribute.</li>
            <li>You are not uploading exam content obtained through academic misconduct, or notes that would give buyers an unfair advantage through dishonest means.</li>
          </ul>
          <p>
            Uploaded notes go through an automated quality/similarity check before going live, and can be removed by
            an admin at any time — including after a sale — if they're found to violate this section (see §7). You
            keep ownership of your own original notes; uploading them to Veloce gives us the right to host, display,
            and deliver them to buyers, nothing more.
          </p>

          <h3>3. Buying notes</h3>
          <p>
            A purchase gives you personal access to read that specific version of a note. It is for your own studying
            — reselling, redistributing, or publicly sharing purchased notes outside your own use is not allowed and
            can result in your account being banned.
          </p>

          <h3>4. Pricing, and what scribes are paid</h3>
          <p>
            A normal purchase is ₦1,000, split 60% to the scribe and 40% to Veloce. A note that fulfills a
            student-requested topic is priced at a fixed ₦900 total instead, split ₦600 to the scribe and ₦300 to
            Veloce, for every buyer. Scribe earnings are held for 30 minutes after each sale before becoming
            available to withdraw, specifically to cover the refund window in §5 — this isn't a delay for its own
            sake, it's what makes refunds possible without a scribe already having cashed out disputed money.
          </p>

          <h3>5. Refunds</h3>
          <p>
            You can request a refund on a purchase within 30 minutes of buying it, by going to your Purchases page.
            An admin reviews every request and decides whether to approve it — refunds are not automatic. If
            approved, you lose access to that note, and you're issued credit equal to what you paid for it,
            automatically applied toward your next purchase(s) — covering the price up to that amount, with any
            leftover carried forward. Credit does not expire and is not redeemable for cash.
          </p>
          <p>
            <strong>Please use this process instead of disputing the charge with your bank.</strong> A bank dispute
            (chargeback) filed instead of using Veloce's own refund request will immediately revoke your access to
            the note while the dispute is investigated, and does not entitle you to credit. Repeated chargebacks
            instead of using the refund process may be treated as a violation of these terms.
          </p>

          <h3>6. Accounts and bans</h3>
          <p>
            You're responsible for keeping your account credentials to yourself. Veloce can suspend or ban an account
            — for a fixed period or indefinitely — for violating these terms, including: uploading content that
            violates §2, reselling or redistributing purchased notes, abusing the refund or credit system, or
            harassing other users. A ban does not erase a scribe's existing sales or earnings already owed to them.
          </p>

          <h3>7. Scribe status and moderation</h3>
          <p>
            Becoming a scribe requires an approved application. Scribe status can be revoked by an admin (demotion
            back to student) for repeated content violations; a demoted scribe can appeal for reinstatement.
          </p>

          <h3>8. No warranty</h3>
          <p>
            Notes are provided by individual students, not verified by Veloce for academic accuracy. Veloce doesn't
            guarantee that any note is error-free, complete, or will result in any particular grade. Use notes as a
            study aid, not a substitute for attending your own classes.
          </p>

          <h3>9. Limitation of liability</h3>
          <p>
            Veloce is provided as-is, run by an individual operator, not a company. To the fullest extent permitted
            by Nigerian law, Veloce is not liable for indirect losses arising from use of the platform, including
            academic outcomes, beyond the amount you actually paid for the specific purchase in question.
          </p>

          <h3>10. Changes to these terms</h3>
          <p>
            These terms may be updated as Veloce grows. Material changes will be communicated through the platform's
            messaging system, and the date at the top of this page will be updated.
          </p>

          <h3>11. Contact</h3>
          <p>
            Questions about these terms can be sent through the in-app <Link href="/feedback">Feedback</Link> page.
            See also our <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
