import {
  HakwaApiClient,
  MapClient,
  MapContributionQueue,
  MemoryQueueStorage,
} from "@hakwa/api-client";

let timer: ReturnType<typeof setInterval> | null = null;

export function startPassengerMapQueueBootstrap(apiBaseUrl: string): void {
  if (timer) return;

  const apiClient = new HakwaApiClient({ baseUrl: apiBaseUrl });
  const mapClient = new MapClient(apiClient);
  const queue = new MapContributionQueue(new MemoryQueueStorage(), mapClient);

  const drain = async () => {
    try {
      await queue.drain();
    } catch {
      // Keep queue items for next retry.
    }
  };

  void drain();
  timer = setInterval(() => {
    void drain();
  }, 30_000);
}

export function stopPassengerMapQueueBootstrap(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
