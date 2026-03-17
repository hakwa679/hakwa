export interface ApiClientOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
}

export class HakwaApiClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
    this.headers = options.headers ?? {};
  }

  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`GET ${path} failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`POST ${path} failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  }
}

export * from "./mapClient.js";
export * from "./mapPhotoUploadClient.js";
export * from "./mapContributionQueue.js";
export * from "./hooks/useMapVerification.js";
export * from "./hooks/useMapStats.js";
export * from "./hooks/useMapPendingFeatures.js";
