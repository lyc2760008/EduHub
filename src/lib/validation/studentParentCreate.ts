import { ParentRelationship } from "@/generated/prisma/client";
import { z } from "zod";

const optionalTrimmed = (max: number) =>
  z.preprocess((val) => {
    if (val === null || val === undefined) return undefined;
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed === "") return undefined;
      return trimmed;
    }
    return val;
  }, z.string().max(max).optional());

const parentSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().email().max(254),
    phone: optionalTrimmed(40),
    notes: optionalTrimmed(2000),
  })
  .strict();

export const createAndLinkParentSchema = z
  .object({
    parent: parentSchema,
    relationship: z.nativeEnum(ParentRelationship).optional(),
  })
  .strict();

export type CreateAndLinkParentInput = z.infer<
  typeof createAndLinkParentSchema
>;
