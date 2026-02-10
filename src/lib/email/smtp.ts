// SMTP email sender for transactional messages (no PII logged).
import "server-only";
import nodemailer from "nodemailer";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type SendEmailResult = { ok: true } | { ok: false; reason: string };

let cachedTransport: nodemailer.Transporter | null = null;

function getTransport() {
  if (cachedTransport) return cachedTransport;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "0");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const secure = process.env.SMTP_SECURE === "true";

  if (!host || !port || !user || !pass) {
    return null;
  }

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return cachedTransport;
}

// Send a single transactional email using SMTP config from env.
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailInput): Promise<SendEmailResult> {
  const from = process.env.EMAIL_FROM;
  const transport = getTransport();

  if (!from || !transport) {
    console.error("SMTP configuration missing; email not sent.");
    return { ok: false, reason: "missing_config" };
  }

  try {
    await transport.sendMail({ from, to, subject, html, text });
    return { ok: true };
  } catch {
    // Avoid logging email addresses or content; keep error output generic.
    console.error("SMTP send failed.");
    return { ok: false, reason: "send_failed" };
  }
}
