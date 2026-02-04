// Shared helper validates IANA timezones for server-side input checks.
import { DateTime } from "luxon";

export function isValidTimeZone(timeZone: string) {
  if (!timeZone) return false;
  return DateTime.now().setZone(timeZone).isValid;
}
