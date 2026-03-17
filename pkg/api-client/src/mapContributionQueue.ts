import type { MapFeatureInput } from "@hakwa/types";
import { MapClient } from "./mapClient.ts";

export interface MapContributionQueueItem {
  id: string;
  createdAt: string;
  payload: MapFeatureInput;
}

export interface QueueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export class MemoryQueueStorage implements QueueStorage {
  private readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
}

const STORAGE_KEY = "hakwa.map.contribution.queue";

export class MapContributionQueue {
  constructor(
    private readonly storage: QueueStorage,
    private readonly mapClient: MapClient,
  ) {}

  async enqueue(payload: MapFeatureInput): Promise<MapContributionQueueItem> {
    const item: MapContributionQueueItem = {
      id: cryptoRandomId(),
      createdAt: new Date().toISOString(),
      payload,
    };

    const items = await this.readAll();
    items.push(item);
    await this.writeAll(items);
    return item;
  }

  async drain(): Promise<{ succeeded: number; failed: number }> {
    const items = await this.readAll();
    const nextQueue: MapContributionQueueItem[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const item of items) {
      try {
        await this.mapClient.submitFeature(item.payload);
        succeeded += 1;
      } catch {
        nextQueue.push(item);
        failed += 1;
      }
    }

    await this.writeAll(nextQueue);
    return { succeeded, failed };
  }

  async readAll(): Promise<MapContributionQueueItem[]> {
    const raw = await this.storage.get(STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as MapContributionQueueItem[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async writeAll(items: MapContributionQueueItem[]): Promise<void> {
    await this.storage.set(STORAGE_KEY, JSON.stringify(items));
  }
}

function cryptoRandomId(): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `mq_${Date.now()}_${randomPart}`;
}
