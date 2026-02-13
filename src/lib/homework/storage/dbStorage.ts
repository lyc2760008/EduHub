// MVP storage provider persists homework bytes in Postgres and keeps tenant-scoped access explicit.
import "server-only";

import { prisma } from "@/lib/db/prisma";
import { HomeworkError } from "@/lib/homework/errors";
import type { HomeworkStorageProvider } from "@/lib/homework/storage/types";

function toBuffer(bytes: Uint8Array<ArrayBufferLike> | Buffer) {
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
}

export const dbHomeworkStorageProvider: HomeworkStorageProvider = {
  async put(params) {
    const updated = await prisma.homeworkFile.updateMany({
      where: {
        id: params.fileId,
        tenantId: params.tenantId,
      },
      data: {
        // Prisma Bytes expects Uint8Array at compile-time even though Buffer is accepted at runtime.
        bytes: new Uint8Array(params.bytes),
        mimeType: params.mimeType,
        sizeBytes: params.sizeBytes,
        checksum: params.checksum ?? null,
      },
    });

    if (updated.count === 0) {
      throw new HomeworkError(404, "NotFound", "Homework file not found");
    }
  },
  async get(params) {
    const file = await prisma.homeworkFile.findFirst({
      where: {
        id: params.fileId,
        tenantId: params.tenantId,
      },
      select: {
        bytes: true,
        mimeType: true,
        sizeBytes: true,
      },
    });

    if (!file) {
      throw new HomeworkError(404, "NotFound", "Homework file not found");
    }

    return {
      bytes: toBuffer(file.bytes),
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    };
  },
};
