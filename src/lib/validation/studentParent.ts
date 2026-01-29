import { ParentRelationship } from "@/generated/prisma/client";
import { z } from "zod";

const optionalNullableTrimmed = (max: number) =>
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

export const linkStudentParentSchema = z
  .object({
    parentId: z.string().min(1),
    relationship: z.nativeEnum(ParentRelationship).optional(),
  })
  .strict();

// Minimal payload for tenant-scoped parent lookup/create by email.
export const linkStudentParentByEmailSchema = z
  .object({
    parentEmail: z.string().trim().toLowerCase().email().max(254),
    name: optionalNullableTrimmed(160),
    phone: optionalNullableTrimmed(40),
  })
  .strict();

export type LinkStudentParentInput = z.infer<typeof linkStudentParentSchema>;
export type LinkStudentParentByEmailInput = z.infer<
  typeof linkStudentParentByEmailSchema
>;
