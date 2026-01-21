// Request-scoped i18n config using a locale cookie (no locale routing).
import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

const SUPPORTED_LOCALES = ["en", "zh-CN"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// Normalize and validate the locale cookie value.
function resolveLocale(value: string | undefined): SupportedLocale {
  if (value === "zh-CN") return "zh-CN";
  return SUPPORTED_LOCALES[0];
}

export default getRequestConfig(async () => {
  // Read the locale from the cookie; default to English if missing/invalid.
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get("locale")?.value);

  // Load messages from the repo-level messages folder.
  const messages = (await import(`../../messages/${locale}.json`)).default;

  return { locale, messages };
});
