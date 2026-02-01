// Formatting helpers for parent portal labels and dates.
export function formatPortalDateTime(value: string | Date, locale: string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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

