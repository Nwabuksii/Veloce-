import Link from "next/link";
import PageHeader from "@/app/components/PageHeader";
import { SUPPORT_EMAIL } from "@/lib/support-contact";

export const metadata = { title: "Terms of Service — Veloce" };

export default function TermsPage() {
  return (
    <div className="page-wrap">
      <div className="app-container" style={{ maxWidth: 760 }}>
        <PageHeader title="Terms of Service" subtitle="Last updated: October 2026" />

        <div className="legal-prose" style={{ marginTop: "2rem" }}>
          <p>
            Veloce is operated by Nwabuks, an individual, not a registered company. By creating an account, you agree
            to these terms and to our <Link href="/privacy">Privacy Policy</Link>. If you don't agree, don't use
            Veloce.
          </p>

          <h3>1. What Veloce is</h3>
          <p>
            Veloce is a marketplace where students at Babcock University ("scribes") sell their own course notes to
            other students, and where students can request notes for courses that don't have any yet. Veloce keeps
            part of each sale (see §5) in exchange for running the platform.
          </p>

          <h3>2. Your account</h3>
          <ul>
            <li>You must be a student of the university you register under, and the details you give us (name, email, department, level) must be true.</li>
            <li>One person, one account. Don't create extra accounts, or let someone else use yours.</li>
            <li>You must verify your email address with the link we send you, which expires after 10 minutes (you can ask for a new one).</li>
            <li>Passwords must be at least 8 characters with at least one letter and one number. Keep your password to yourself — you are responsible for everything done through your account. Veloce staff will never ask you for your password.</li>
            <li>You stay signed in on a device for up to 7 days. Log out on any shared or public device.</li>
            <li>You can change your email address in Settings. The old address is told about the change and can undo it for 7 days.</li>
          </ul>

          <h3>3. Content ownership and what you can upload</h3>
          <p>By uploading notes as a scribe, you confirm that:</p>
          <ul>
            <li>The notes are your own original work — your own summaries, explanations, and understanding of the course material.</li>
            <li>You are not uploading a lecturer's slides, a textbook's actual text or images, past exam papers, or any other material you don't hold the rights to distribute.</li>
            <li>You are not uploading exam content obtained through academic misconduct, or notes that would give buyers an unfair advantage through dishonest means.</li>
          </ul>
          <p>
            Uploads go through an automated quality and similarity check, then admin review, before going live. A
            flag from the automated check is not a rejection, but an admin may reject, hide or remove a note at any
            time — including after sales — if it breaks this section (see §10). You keep ownership of your original
            notes; uploading them gives Veloce the right to host, display, and deliver them to buyers, nothing more.
          </p>
          <p>
            If you believe a note on Veloce infringes your copyright or contains your material, email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with the note's title and what you own, and we
            will look into it promptly. If a note is removed for breaking these terms, we will deal with the affected
            buyers case by case, which may include credit.
          </p>

          <h3>4. Buying and reading notes</h3>
          <ul>
            <li>A purchase gives you personal access to read that specific version of a note, for your own studying.</li>
            <li>Notes are read inside Veloce. There is no download. Every page is stamped with <strong>your name and email address</strong>, so a screenshot, photo, recording or copy of a page can be traced back to your account.</li>
            <li>Do not screenshot, photograph, record, copy, resell, share, post or otherwise redistribute purchased notes. Doing so is a breach of these terms and can lead to a permanent ban.</li>
            <li>Notes are written by students and are not checked by Veloce for academic accuracy (see §12).</li>
          </ul>

          <h3>5. Pricing and what scribes are paid</h3>
          <p>
            The price of a note is shown before you buy it. At the time of writing a standard note is ₦1,000, and a
            note written to fulfil a student request is ₦900 for the students who voted for that request (everyone
            else pays the normal price). On every paid sale the scribe receives a fixed ₦600 and Veloce keeps the
            rest — so ₦400 of a ₦1,000 sale and ₦300 of a ₦900 sale. The split is worked out on the full price,
            whether you paid with cash, credit or both.
          </p>
          <p>
            Money from a sale is held until the refund window below has passed. Only then does it become the scribe's
            earnings and Veloce's revenue. Prices and the split can change in future; a change never affects a
            purchase already made.
          </p>

          <h3>6. Payments</h3>
          <p>
            Payments are processed by Paystack. Veloce never sees or stores your card details. If you were charged
            but didn't get your note, check your Purchases page after a minute, then email {SUPPORT_EMAIL} with your
            payment reference and the email you used. Please don't pay twice.
          </p>

          <h3>7. Refunds and credit</h3>
          <ul>
            <li>You can request a refund within <strong>30 minutes</strong> of buying a note, from your Purchases page. After that, the refund option closes.</li>
            <li>Refunds are not automatic. An admin reviews every request. While a request is pending, the sale is held and nobody is paid from it, however long the review takes.</li>
            <li>If approved, you lose access to that note and receive <strong>credit</strong> equal to everything you paid for it (cash and credit combined).</li>
            <li>Credit is applied automatically to your next purchase(s), up to the price, and any leftover is kept for later. Credit does not expire, but it <strong>is not cash</strong>: it can't be withdrawn, transferred or paid out, including if your account is closed.</li>
            <li>A purchase made with credit follows the same rules, including the same 30-minute refund window.</li>
            <li>If a refund request is declined, the sale completes normally.</li>
          </ul>
          <p>
            <strong>Please use this process instead of disputing the charge with your bank.</strong> A bank dispute
            (chargeback) filed instead of using Veloce's refund request immediately removes your access to the note
            while it is investigated and does not entitle you to credit. Repeated chargebacks are a breach of these
            terms and can lead to a ban.
          </p>

          <h3>8. Scribe earnings and withdrawals</h3>
          <ul>
            <li>Becoming a scribe requires an approved application. If an application is rejected you can apply again after 14 days.</li>
            <li>A sale's earnings become available about 31 minutes after the sale, if no refund has been requested. Sales under refund review stay held until the admin decides.</li>
            <li>You can request <strong>one withdrawal per calendar month, during the first 7 days of the month</strong>, for any amount from ₦2,000 up to your available balance.</li>
            <li>Withdrawals are reviewed and approved by an admin and paid to the bank account you give us. You are responsible for entering your account details correctly. Veloce is not responsible for money sent to a wrong account you provided.</li>
            <li>We may delay, hold or refuse a payout where we reasonably suspect fraud, rating or sales manipulation, a chargeback, or a breach of these terms, until it is looked into.</li>
            <li>A ban does not erase earnings already owed to you for genuine sales, but earnings from sales found to be fraudulent or manipulated can be cancelled.</li>
            <li>You are responsible for any tax that applies to what you earn.</li>
          </ul>

          <h3>9. Leaderboard and badges</h3>
          <ul>
            <li>Scribes are ranked on a leaderboard (all-time and per semester) using a mix of verified buyer ratings, purchases, notes read, followers and recent activity. Only live notes count. Refunded, disputed and self-made purchases don't.</li>
            <li>Rankings are refreshed periodically (about once a day), not instantly. Your name, picture, score and rank are shown to other users.</li>
            <li>Top-ranked scribes can earn badges, dated by the semester or year they were earned. Scribes can display up to 5 on their profile. Badges are recognition only — they have no cash value and aren't a promise of income.</li>
            <li>Scribes who are banned, demoted or have graduated leave the rankings. Badges already earned stay on a graduated scribe's profile; badges can be removed if they were earned through manipulation.</li>
            <li>Veloce may adjust how scores are calculated to keep the leaderboard fair, and may recalculate past results if a mistake or manipulation is found.</li>
          </ul>

          <h3>10. Rules of conduct</h3>
          <p>Don't:</p>
          <ul>
            <li>Upload content that breaks §3, or notes you copied from someone else's work.</li>
            <li>Share, resell or capture purchased notes (§4).</li>
            <li>Buy your own notes, use extra accounts, trade reviews or follows, pay for ratings, or otherwise manipulate reviews, sales, followers, the leaderboard or badges.</li>
            <li>Abuse the refund or credit system, for example by requesting refunds on notes you have used, or by filing chargebacks instead of refund requests.</li>
            <li>Harass or threaten anyone, or send spam or misleading messages.</li>
            <li>Try to break into, overload, scrape or bypass the security of Veloce, or use it for anything unlawful.</li>
          </ul>

          <h3>11. Reports, bans and appeals</h3>
          <p>
            You can report a note or a user from their page. Admins review reports and may remove content, send a
            warning, suspend an account for a fixed period, or ban it permanently. Scribe status can be revoked
            (demotion back to student) for repeated or serious violations. A demoted scribe can appeal for
            reinstatement; if an appeal is rejected, they can submit another one after 30 days. If you think action
            on your account was a mistake, email {SUPPORT_EMAIL}.
          </p>

          <h3>12. No warranty</h3>
          <p>
            Veloce is provided "as is". We don't guarantee that any note is accurate, complete or will lead to a
            particular grade, or that the service will always be available or error-free. Use notes as a study aid,
            not a substitute for attending your own classes.
          </p>

          <h3>13. Limitation of liability</h3>
          <p>
            Veloce is run by an individual, not a company. To the fullest extent permitted by Nigerian law, Veloce is
            not liable for indirect losses arising from use of the platform, including academic outcomes or loss of
            earnings, and our liability for any one purchase is limited to the amount you actually paid for it.
          </p>

          <h3>14. Closing your account</h3>
          <p>
            You can ask us to close your account at any time (see the Privacy Policy). Scribes should withdraw any
            available earnings first. Unspent credit can't be paid out. Some records, such as purchases and
            payments, must be kept for financial record-keeping.
          </p>

          <h3>15. Changes to these terms</h3>
          <p>
            We may update these terms as Veloce grows. For material changes we will notify you through the platform,
            and the date at the top of this page will change. Continuing to use Veloce after a change means you accept
            it.
          </p>

          <h3>16. Governing law and contact</h3>
          <p>
            These terms are governed by the laws of the Federal Republic of Nigeria. Please contact us first so we can
            try to resolve any problem informally. You can reach us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{" "}
            or through the in-app <Link href="/feedback">Feedback</Link> page.
          </p>
        </div>
      </div>
    </div>
  );
}
