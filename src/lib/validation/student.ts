import { StudentStatus } from "@/generated/prisma/client";
import { z } from "zod";

const optionalTrimmed = (max: number) =>
  z.preprocess(
    (val) => {
      if (val === null || val === undefined) return undefined;
      if (typeof val === "string") {
        const trimmed = val.trim();
        if (trimmed === "") return undefined;
        return trimmed;
      }
      return val;
    },
    z.string().max(max).optional()
  );

// Allow explicit null to clear optional fields (ex: notes or levelId).
const nullableTrimmed = (max: number) =>
  z.preprocess(
    (val) => {
      if (val === null) return null;
      if (val === undefined) return undefined;
      if (typeof val === "string") {
        const trimmed = val.trim();
        if (trimmed === "") return null;
        return trimmed;
      }
      return val;
    },
    z.string().max(max).nullable().optional()
  );

export const createStudentSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    preferredName: z.string().trim().max(80).optional(),
    grade: z.string().trim().max(20).optional(),
    levelId: z.string().trim().min(1).max(191).optional(),
    dateOfBirth: z.coerce.date().optional(),
    status: z.nativeEnum(StudentStatus).default(StudentStatus.ACTIVE),
    // isActive is mapped to status in handlers for backward compatibility.
    isActive: z.boolean().optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const updateStudentSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    preferredName: optionalTrimmed(80),
    grade: optionalTrimmed(20),
    levelId: nullableTrimmed(191),
    dateOfBirth: z.coerce.date().optional(),
    status: z.nativeEnum(StudentStatus).optional(),
    isActive: z.boolean().optional(),
    notes: nullableTrimmed(2000),
  })
  .strict();

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
