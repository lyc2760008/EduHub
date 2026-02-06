// Minimal module declaration to satisfy TypeScript in E2E helpers.
declare module "pg" {
  export type ClientConfig = {
    connectionString?: string;
  };

  export class Client {
    constructor(config?: ClientConfig);
    connect(): Promise<void>;
    end(): Promise<void>;
    query<T = unknown>(
      text: string,
      params?: unknown[],
    ): Promise<{ rows: T[] }>;
  }
}
