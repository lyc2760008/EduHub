import { ParentRelationship } from "@/generated/prisma/client";
import { z } from "zod";

export const linkStudentParentSchema = z
  .object({
    parentId: z.string().min(1),
    relationship: z.nativeEnum(ParentRelationship).optional(),
  })
  .strict();

export type LinkStudentParentInput = z.infer<typeof linkStudentParentSchema>;
