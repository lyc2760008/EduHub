// Server-only notification DTO mappers keep inbox payloads compact and role-safe.
import "server-only";

import type { NotificationType } from "@/generated/prisma/client";

export type InboxListDTO = {
  id: string;
  type: NotificationType;
  title: string;
  bodyPreview: string | null;
  createdAt: string;
  readAt: string | null;
  targetType: string | null;
  targetId: string | null;
  targetUrl: string | null;
};

type InboxSource = {
  id: string;
  type: NotificationType;
  title: string;
  bodyPreview: string | null;
  createdAt: Date;
  readAt: Date | null;
  targetType: string | null;
  targetId: string | null;
  targetUrl: string | null;
};

// Map DB rows to a small DTO without exposing recipient identifiers.
export function toInboxListDTO(source: InboxSource): InboxListDTO {
  return {
    id: source.id,
    type: source.type,
    title: source.title,
    bodyPreview: source.bodyPreview,
    createdAt: source.createdAt.toISOString(),
    readAt: source.readAt ? source.readAt.toISOString() : null,
    targetType: source.targetType,
    targetId: source.targetId,
    targetUrl: source.targetUrl,
  };
}
