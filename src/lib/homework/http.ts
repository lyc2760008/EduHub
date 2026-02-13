// Homework HTTP helpers normalize error envelopes for admin/tutor/portal handlers.
import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { HomeworkError } from "@/lib/homework/errors";

export function toHomeworkErrorResponse(error: unknown) {
  if (error instanceof HomeworkError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "ValidationError",
          message: "Invalid payload",
          details: { issues: error.issues },
        },
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "InternalError",
        message: "Internal server error",
        details: {},
      },
    },
    { status: 500 },
  );
}

