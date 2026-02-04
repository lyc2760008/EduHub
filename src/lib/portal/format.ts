// Formatting helpers for parent portal labels and dates.
function parsePortalDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function formatPortalDateTime(
  value: string | Date,
  locale: string,
  timeZone?: string,
) {
  const date = parsePortalDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatPortalDateTimeRange(
  startValue: string | Date,
  endValue: string | Date | null | undefined,
  locale: string,
  timeZone?: string,
) {
  const start = parsePortalDate(startValue);
  if (!start) return "";
  const end = endValue ? parsePortalDate(endValue) : null;

  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(start);
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
  const timeRange = end
    ? `${timeFormatter.format(start)} - ${timeFormatter.format(end)}`
    : timeFormatter.format(start);

  return `${dateLabel} ${timeRange}`;
}

export function formatPortalDuration(startValue: string | Date, endValue: string | Date) {
  const start = parsePortalDate(startValue);
  const end = parsePortalDate(endValue);
  if (!start || !end) return "";
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  // Use HH:MM to avoid adding new localized duration copy outside the contract.
  return `${hours}:${String(remainder).padStart(2, "0")}`;
}

export function getSessionTypeLabelKey(sessionType: string) {
  switch (sessionType) {
    case "ONE_ON_ONE":
      return "admin.sessions.types.oneOnOne";
    case "GROUP":
      return "admin.sessions.types.group";
    case "CLASS":
      return "admin.sessions.types.class";
    default:
      return null;
  }
}

export function getAttendanceStatusLabelKey(status: string) {
  switch (status) {
    case "PRESENT":
      return "portal.attendance.status.present";
    case "ABSENT":
      return "portal.attendance.status.absent";
    case "LATE":
      return "portal.attendance.status.late";
    case "EXCUSED":
      return "portal.attendance.status.excused";
    case "CANCELED":
      return "portal.attendance.status.canceled";
    default:
      return null;
  }
}
