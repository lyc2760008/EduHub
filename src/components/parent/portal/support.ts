// Shared helper to build a safe, localized support contact line for the portal UI.
export type Translator = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

export type SupportContactParams = {
  t: Translator;
  centerName?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
};

export function buildPortalSupportLine({
  t,
  centerName,
  supportEmail,
  supportPhone,
}: SupportContactParams) {
  const resolvedCenterName = centerName?.trim() || t("portal.support.centerFallback");
  const email = supportEmail?.trim() || "";
  const phone = supportPhone?.trim() || "";

  if (!email && phone) {
    // When only a phone is available, surface a phone-specific contact line.
    return t("portal.support.phoneOnlyLine", {
      centerName: resolvedCenterName,
      supportPhone: phone,
    });
  }

  if (!email) {
    // When no contact details are available, fall back to a generic prompt.
    return t("portal.support.contactFallback", { centerName: resolvedCenterName });
  }

  const supportPhonePart = phone
    ? t("portal.support.phonePart", { supportPhone: phone })
    : "";

  return t("portal.support.contactLine", {
    centerName: resolvedCenterName,
    supportEmail: email,
    supportPhonePart,
  });
}

