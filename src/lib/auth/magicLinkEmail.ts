// Email template builder for parent magic link messages (i18n-driven content).
type TranslationValues = Record<string, string | number | Date>;
type TranslationFn = (key: string, values?: TranslationValues) => string;

type MagicLinkEmailInput = {
  appName: string;
  signInUrl: string;
  expiresInMinutes: number;
  supportEmail?: string | null;
  supportUrl?: string | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeSignature(signature: string) {
  return signature.replace(/\n/g, "<br />");
}

// Build both HTML and plaintext email bodies from translation keys.
export function buildMagicLinkEmail(
  t: TranslationFn,
  input: MagicLinkEmailInput,
) {
  const { appName, signInUrl, expiresInMinutes, supportEmail, supportUrl } =
    input;
  const subject = t("parentAuth.email.subject", { appName });
  const greeting = t("parentAuth.email.greeting");
  const intro = t("parentAuth.email.intro");
  const cta = t("parentAuth.email.cta");
  const fallback = t("parentAuth.email.fallback");
  const securityTitle = t("parentAuth.email.security.title");
  const securityBody = t("parentAuth.email.security.body", {
    expiresInMinutes,
  });
  const notRequestedTitle = t("parentAuth.email.notRequested.title");
  const notRequestedBody = t("parentAuth.email.notRequested.body", {
    supportEmail: supportEmail ?? "",
    supportUrl: supportUrl ?? "",
  });
  const signature = t("parentAuth.email.signature", { appName });

  const text = [
    greeting,
    "",
    intro,
    signInUrl,
    "",
    fallback,
    signInUrl,
    "",
    `${securityTitle}`,
    securityBody,
    "",
    `${notRequestedTitle}`,
    notRequestedBody,
    "",
    signature,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <p>${escapeHtml(greeting)}</p>
      <p>${escapeHtml(intro)}</p>
      <p>
        <a href="${escapeHtml(signInUrl)}" style="display: inline-block; padding: 10px 16px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 6px;">
          ${escapeHtml(cta)}
        </a>
      </p>
      <p>${escapeHtml(fallback)}</p>
      <p><a href="${escapeHtml(signInUrl)}">${escapeHtml(signInUrl)}</a></p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
      <p><strong>${escapeHtml(securityTitle)}</strong></p>
      <p>${escapeHtml(securityBody)}</p>
      <p><strong>${escapeHtml(notRequestedTitle)}</strong></p>
      <p>${escapeHtml(notRequestedBody)}</p>
      <p>${normalizeSignature(escapeHtml(signature))}</p>
    </div>
  `.trim();

  return { subject, text, html };
}
