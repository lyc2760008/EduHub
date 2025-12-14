import { StudentStatus } from "@/generated/prisma/client";
import { z } from "zod";

const optionalTrimmed = (max: number) =>
  z
    .preprocess(
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

export const createStudentSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    preferredName: z.string().trim().max(80).optional(),
    grade: z.string().trim().max(20).optional(),
    dateOfBirth: z.coerce.date().optional(),
    status: z.nativeEnum(StudentStatus).default(StudentStatus.ACTIVE),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const updateStudentSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    preferredName: optionalTrimmed(80),
    grade: optionalTrimmed(20),
    dateOfBirth: z.coerce.date().optional(),
    status: z.nativeEnum(StudentStatus).optional(),
    notes: optionalTrimmed(2000),
  })
  .strict();

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
