import Link from "next/link";
import PageHeader from "@/app/components/PageHeader";
import { SUPPORT_EMAIL } from "@/lib/support-contact";

export const metadata = { title: "Privacy Policy — Veloce" };

export default function PrivacyPolicyPage() {
  return (
    <div className="page-wrap">
      <div className="app-container" style={{ maxWidth: 760 }}>
        <PageHeader title="Privacy Policy" subtitle="Last updated: October 2026" />

        <div className="legal-prose" style={{ marginTop: "2rem" }}>
          <p>
            Veloce ("we", "us") is operated by Nwabuks, an individual, not a registered company. This policy explains
            what personal data Veloce collects from students and scribes at Babcock University, why, who else handles
            it, and what you can do about it. It is written to comply with Nigeria's Data Protection Act, 2023 (NDPA),
            which applies to anyone processing the personal data of people in Nigeria — including an individual
            operator, not just registered companies.
          </p>

          <h3>1. What we collect</h3>
          <ul>
            <li><strong>Account details:</strong> your full name, email address and password (stored only as an irreversible hash — we never see or store your actual password). Optionally, a profile picture or avatar you choose.</li>
            <li><strong>Academic details:</strong> your university, department and level (e.g. "200L"), used to show you the right courses.</li>
            <li><strong>Purchase and payment records:</strong> which notes you bought, when, how much was paid in cash and credit, refund requests, and your credit balance. Card details are handled by Paystack, never by us.</li>
            <li><strong>Content you upload</strong> (scribes): the PDF notes, the page images made from them, and text extracted from them for automated quality and duplicate checks. Scribe applications and appeals are kept too.</li>
            <li><strong>Bank details</strong> (scribes who request withdrawals): bank name, account number and the account name your bank returns, needed to pay you.</li>
            <li><strong>Activity on the platform:</strong> ratings and reviews, who you follow, which notes you opened, messages sent to you, requests you vote on, reports you file, and feedback you submit. For scribes, this activity also feeds the leaderboard and badges.</li>
            <li><strong>Technical and security data:</strong> your IP address and the time of important events (sign-ins, failed logins, bans, refund decisions and similar) in a security log, plus the time you were last active on the site.</li>
          </ul>
          <p>We do not collect your location, your browsing outside Veloce, or any data from advertising trackers — there are none on this site.</p>

          <h3>2. Why we collect it</h3>
          <ul>
            <li>To create and secure your account and confirm it's really you (email verification, login protection, two-step verification for admins).</li>
            <li>To process payments, deliver the notes you've paid for, and handle refunds, credit and disputes.</li>
            <li>To pay scribes what they're owed.</li>
            <li>To run the trust and moderation systems that keep the marketplace usable: reviews, reports, quality checks and admin review of uploads, and the leaderboard and badges.</li>
            <li>To discourage misuse. Every note page you read is stamped with your name and email address, so that leaked copies can be traced to the account that leaked them.</li>
            <li>To detect fraud and abuse, such as fake reviews, self-purchases and repeated sign-in attempts.</li>
            <li>To contact you about your account, purchases or requests.</li>
          </ul>

          <h3>3. What other users and staff can see</h3>
          <ul>
            <li><strong>Other users</strong> can see a scribe's name, picture, level of trust, ratings, follower count, notes, badges and leaderboard rank. Ratings are shown as averages and counts, not with the name of whoever gave them, and what you've bought is not shown to other students.</li>
            <li><strong>Admins</strong> at the scribe's university can see account details, purchase and refund history, reports, uploads, and when a user was last active, in order to run moderation, refunds and withdrawals.</li>
            <li>Babcock University itself does not have standing access to your Veloce data. We would only disclose specific information if the law required it.</li>
          </ul>

          <h3>4. Outside services that process data for us</h3>
          <ul>
            <li><strong>Paystack</strong> — processes all payments and holds card details.</li>
            <li><strong>Vercel</strong> — hosts the website and application.</li>
            <li><strong>Neon</strong> — hosts our database (accounts, purchases, reviews and so on).</li>
            <li><strong>Cloudinary</strong> — stores uploaded note files and page images in private storage, delivered only through signed, short-lived links.</li>
            <li><strong>Brevo</strong> — sends transactional emails (verification links, password resets, purchase and refund notices).</li>
            <li><strong>Sentry</strong> — receives technical error reports when something breaks, so we can fix it. We strip personal and payment details from these reports.</li>
          </ul>
          <p>
            Some of these providers store data outside Nigeria. We use them only to run Veloce and expect them to
            protect it. We do not sell personal data to anyone, and we do not share it with advertisers — there is no
            advertising on Veloce.
          </p>

          <h3>5. Cookies and local storage</h3>
          <p>
            Veloce uses one essential cookie to keep you signed in. It is httpOnly (scripts on the page can't read
            it) and lasts up to 7 days. Your browser also stores small items such as your display preferences (for
            example dark mode) and basic details used to show your name and picture in the app. We do not use
            advertising or tracking cookies.
          </p>

          <h3>6. How long we keep it</h3>
          <ul>
            <li><strong>Account and purchase data</strong> is kept while your account exists, because purchase history is what proves you own access to a note.</li>
            <li><strong>Security logs</strong> (including IP addresses) are archived and cleared from the live log every month. The monthly archive is sent to the operator.</li>
            <li><strong>Closed accounts:</strong> we remove your name, email and other personal details and replace them with a placeholder, but keep the minimum record of purchases, reviews and earnings that Nigerian financial record-keeping and the fairness of other users' records require.</li>
            <li><strong>Backups:</strong> we keep database backups for disaster recovery. Data you asked us to delete can remain in a backup until that backup expires, and is not used for anything else.</li>
          </ul>

          <h3>7. Your rights</h3>
          <p>Under the NDPA, you can ask us to:</p>
          <ul>
            <li>Tell you what personal data we hold about you, and give you a copy.</li>
            <li>Correct inaccurate data (your name is fixed in Settings, so ask us to change it).</li>
            <li>Delete your account and personal data, subject to §6.</li>
            <li>Stop or limit certain uses of your data, where the law allows.</li>
          </ul>
          <p>
            To use any of these, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the email address on
            your account, or use the <Link href="/feedback">Feedback</Link> page while logged in. We may need to
            confirm it's you first. If you're not satisfied with how we handle your data, you can complain to the
            Nigeria Data Protection Commission.
          </p>

          <h3>8. Security</h3>
          <p>
            Passwords are hashed and never stored in plain text. Your session cookie is httpOnly. Note files are in
            private storage, and a note can only be opened by someone who bought it or has an administrative reason
            to view it. Admin accounts can use two-step verification. No system is perfectly secure, so please use a
            strong, unique password and log out on shared devices. If you believe your account has been accessed
            without your permission, change your password and email us straight away.
          </p>

          <h3>9. Children</h3>
          <p>
            Veloce is for university students. We don't knowingly collect data from children, and will delete an
            account if we learn it belongs to one.
          </p>

          <h3>10. Changes to this policy</h3>
          <p>
            If this policy changes in a way that matters, we'll update the date at the top and, for material changes,
            notify you through the platform.
          </p>

          <h3>11. Contact</h3>
          <p>
            Questions about this policy or your data: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or the
            in-app Feedback page. See also our <Link href="/terms">Terms of Service</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
