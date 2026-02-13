// Homework status helpers keep v1 transitions explicit and centralized.
import "server-only";

import { HomeworkStatus } from "@/generated/prisma/client";
import { HomeworkError } from "@/lib/homework/errors";

export function canTransitionToSubmitted(current: HomeworkStatus) {
  return current === "ASSIGNED" || current === "SUBMITTED";
}

export function canTransitionToReviewed(current: HomeworkStatus) {
  return current === "SUBMITTED";
}

export function assertCanTransitionToSubmitted(current: HomeworkStatus) {
  if (!canTransitionToSubmitted(current)) {
    throw new HomeworkError(409, "Conflict", "Homework status cannot be submitted", {
      fromStatus: current,
      toStatus: "SUBMITTED",
    });
  }
}

export function assertCanTransitionToReviewed(current: HomeworkStatus) {
  if (!canTransitionToReviewed(current)) {
    throw new HomeworkError(409, "Conflict", "Homework status cannot be reviewed", {
      fromStatus: current,
      toStatus: "REVIEWED",
    });
  }
}

