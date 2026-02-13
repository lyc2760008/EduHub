// Coarse audit error-code mapping keeps failure events useful without leaking stack/message details.
import { Prisma } from "@/generated/prisma/client";

export function toAuditErrorCode(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `prisma_${error.code.toLowerCase()}`;
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return "validation_error";
  }
  if (error instanceof SyntaxError) {
    return "invalid_json";
  }
  return "internal_error";
}
