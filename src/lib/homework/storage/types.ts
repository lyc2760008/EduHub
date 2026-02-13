// Storage provider seam keeps homework handlers stable if we move from DB-bytes to object storage later.
import "server-only";

export type HomeworkStoragePutParams = {
  tenantId: string;
  fileId: string;
  bytes: Buffer;
  mimeType: string;
  sizeBytes: number;
  checksum?: string | null;
};

export type HomeworkStorageGetParams = {
  tenantId: string;
  fileId: string;
};

export type HomeworkStorageGetResult = {
  bytes: Buffer;
  mimeType: string;
  sizeBytes: number;
};

export interface HomeworkStorageProvider {
  put(params: HomeworkStoragePutParams): Promise<void>;
  get(params: HomeworkStorageGetParams): Promise<HomeworkStorageGetResult>;
}

