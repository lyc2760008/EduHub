// Unit-level coverage for timezone-safe occurrence generation.
import { expect, test } from "@playwright/test";
import { DateTime } from "luxon";

import { generateOccurrences } from "../../src/lib/sessions/generator";

// Tagged for Playwright suite filtering.
test.describe("[slow] [regression] Sessions - generator core", () => {
  test("generates one occurrence for a single weekday", () => {
    const timezone = "America/Edmonton";
    const startDate = DateTime.now().setZone(timezone).startOf("day");
    const endDate = startDate.plus({ days: 6 });
    const weekday = startDate.weekday;

    const occurrences = generateOccurrences({
      startDate: startDate.toISODate() ?? "",
      endDate: endDate.toISODate() ?? "",
      weekdays: [weekday],
      startTime: "09:00",
      endTime: "10:00",
      timezone,
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].localDateLabel).toBe(startDate.toISODate());
    expect(occurrences[0].startAtUtc instanceof Date).toBe(true);
    expect(occurrences[0].endAtUtc instanceof Date).toBe(true);
    expect(occurrences[0].endAtUtc.getTime()).toBeGreaterThan(
      occurrences[0].startAtUtc.getTime(),
    );
  });
});

