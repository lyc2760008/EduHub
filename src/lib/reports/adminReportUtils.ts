import { StudentStatus } from "@/generated/prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DateRangePreset = "today" | "7d" | "14d" | "30d" | "60d" | "90d";
export type WeekPreset = "thisWeek" | "nextWeek";
export type ActiveInactiveAll = "ACTIVE" | "INACTIVE" | "ALL";

export function getUtcStartOfDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

export function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

export function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function getUpcomingRangeFromPreset(
  preset: DateRangePreset,
  baseDate = new Date(),
) {
  const today = getUtcStartOfDay(baseDate);

  switch (preset) {
    case "today":
      return {
        from: today,
        toExclusive: addUtcDays(today, 1),
      };
    case "7d":
      return {
        from: today,
        toExclusive: addUtcDays(today, 8),
      };
    case "14d":
      return {
        from: today,
        toExclusive: addUtcDays(today, 15),
      };
    case "30d":
      return {
        from: today,
        toExclusive: addUtcDays(today, 31),
      };
    case "60d":
      return {
        from: addUtcDays(today, -59),
        toExclusive: addUtcDays(today, 1),
      };
    case "90d":
      return {
        from: addUtcDays(today, -89),
        toExclusive: addUtcDays(today, 1),
      };
    default:
      return {
        from: today,
        toExclusive: addUtcDays(today, 15),
      };
  }
}

export function getPastRangeFromPreset(
  preset: Exclude<DateRangePreset, "14d">,
  baseDate = new Date(),
) {
  const today = getUtcStartOfDay(baseDate);

  switch (preset) {
    case "today":
      return {
        from: today,
        toExclusive: addUtcDays(today, 1),
      };
    case "7d":
      return {
        from: addUtcDays(today, -6),
        toExclusive: addUtcDays(today, 1),
      };
    case "30d":
      return {
        from: addUtcDays(today, -29),
        toExclusive: addUtcDays(today, 1),
      };
    case "60d":
      return {
        from: addUtcDays(today, -59),
        toExclusive: addUtcDays(today, 1),
      };
    case "90d":
      return {
        from: addUtcDays(today, -89),
        toExclusive: addUtcDays(today, 1),
      };
    default:
      return {
        from: addUtcDays(today, -29),
        toExclusive: addUtcDays(today, 1),
      };
  }
}

export function getWeekRangeFromPreset(
  preset: WeekPreset,
  baseDate = new Date(),
) {
  const today = getUtcStartOfDay(baseDate);
  const dayOfWeek = today.getUTCDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  const thisWeekStart = addUtcDays(today, -mondayOffset);
  const rangeStart = preset === "nextWeek" ? addUtcDays(thisWeekStart, 7) : thisWeekStart;
  const rangeEndExclusive = addUtcDays(rangeStart, 7);

  return { from: rangeStart, toExclusive: rangeEndExclusive };
}

export function formatDisplayName(
  firstName: string,
  lastName: string,
  preferredName?: string | null,
) {
  if (preferredName?.trim()) {
    return preferredName.trim();
  }
  return `${firstName} ${lastName}`.trim();
}

export function mapStatusFilterToStudentStatuses(
  statusFilter: ActiveInactiveAll,
): StudentStatus[] | null {
  if (statusFilter === "ALL") return null;
  if (statusFilter === "ACTIVE") return [StudentStatus.ACTIVE];
  return [StudentStatus.INACTIVE, StudentStatus.ARCHIVED];
}
