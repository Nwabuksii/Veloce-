// Sends email via Brevo's transactional email API
// (https://api.brevo.com/v3/smtp/email — confirmed against their official
// docs). Requires:
//   BREVO_API_KEY        — from Brevo dashboard -> SMTP & API -> API Keys
//                           (must be a v3 key)
//   EMAIL_SENDER_ADDRESS  — the single email address you verified as a
//                           sender in Brevo (Senders, Domains & Dedicated
//                           IPs -> Senders) — sending from anything else
//                           will be rejected
//   EMAIL_SENDER_NAME     — display name shown to recipients, e.g. "Veloce"

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  mimetype: string;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  const res = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY || "",
    },
    body: JSON.stringify({
      sender: {
        email: process.env.EMAIL_SENDER_ADDRESS,
        name: process.env.EMAIL_SENDER_NAME || "Veloce",
      },
      to: [{ email: params.to }],
      subject: params.subject,
      textContent: params.text,
      htmlContent: params.html,
      attachment: params.attachments?.map((a) => ({
        name: a.filename,
        content: a.content.toString("base64"),
      })),
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || `Failed to send email (${res.status})`);
  }
}
