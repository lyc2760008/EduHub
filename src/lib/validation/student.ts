import { StudentStatus } from "@/generated/prisma/client";
import { z } from "zod";

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

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
