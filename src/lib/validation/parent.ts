import { z } from "zod";

const emailRequired = z.string().trim().toLowerCase().email().max(254);

const emailOptional = z.preprocess((val) => {
  if (val === null || val === undefined) return undefined;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return undefined;
    return trimmed.toLowerCase();
  }
  return val;
}, z.string().toLowerCase().email().max(254).optional());

const phoneOptional = z.preprocess((val) => {
  if (val === null || val === undefined) return undefined;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return undefined;
    return trimmed;
  }
  return val;
}, z.string().max(40).optional());

const notesOptional = z.preprocess((val) => {
  if (val === null || val === undefined) return undefined;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return undefined;
    return trimmed;
  }
  return val;
}, z.string().max(2000).optional());

export const createParentSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: emailRequired,
    phone: phoneOptional,
    notes: notesOptional,
  })
  .strict();

export const updateParentSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    email: emailOptional,
    phone: phoneOptional,
    notes: notesOptional,
  })
  .strict();

export type CreateParentInput = z.infer<typeof createParentSchema>;
export type UpdateParentInput = z.infer<typeof updateParentSchema>;
