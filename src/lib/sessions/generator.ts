import { DateTime } from "luxon";

const TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type SessionOccurrence = {
  startAtUtc: Date;
  endAtUtc: Date;
  localDateLabel: string;
};

export type GenerateOccurrencesInput = {
  startDate: string;
  endDate: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  timezone: string;
};

function parseTimeParts(time: string): { hour: number; minute: number } {
  if (!TIME_REGEX.test(time)) {
    throw new Error("Invalid time format");
  }

  const [hour, minute] = time.split(":").map((part) => Number(part));
  return { hour, minute };
}

export function toUtcDateTime(
  dateISO: string,
  time: string,
  timezone: string,
): DateTime {
  const { hour, minute } = parseTimeParts(time);
  const local = DateTime.fromISO(dateISO, { zone: timezone }).set({
    hour,
    minute,
    second: 0,
    millisecond: 0,
  });

  if (!local.isValid) {
    throw new Error(local.invalidExplanation || "Invalid date or timezone");
  }

  return local.toUTC();
}

/**
 * Generate session occurrences in order.
 * Weekday mapping uses ISO convention: 1=Mon ... 7=Sun.
 */
export function generateOccurrences(
  input: GenerateOccurrencesInput,
): SessionOccurrence[] {
  const start = DateTime.fromISO(input.startDate, {
    zone: input.timezone,
  }).startOf("day");
  const end = DateTime.fromISO(input.endDate, {
    zone: input.timezone,
  }).startOf("day");

  if (!start.isValid || !end.isValid) {
    throw new Error("Invalid startDate/endDate for timezone");
  }
  if (end < start) {
    throw new Error("endDate must be on or after startDate");
  }

  const weekdaySet = new Set(input.weekdays);
  const occurrences: SessionOccurrence[] = [];

  for (let cursor = start; cursor <= end; cursor = cursor.plus({ days: 1 })) {
    if (!weekdaySet.has(cursor.weekday)) continue;
    const localDateLabel = cursor.toISODate();
    if (!localDateLabel) continue;

    const startAtUtc = toUtcDateTime(
      localDateLabel,
      input.startTime,
      input.timezone,
    );
    const endAtUtc = toUtcDateTime(
      localDateLabel,
      input.endTime,
      input.timezone,
    );

    occurrences.push({
      startAtUtc: startAtUtc.toJSDate(),
      endAtUtc: endAtUtc.toJSDate(),
      localDateLabel,
    });
  }

  return occurrences;
}
