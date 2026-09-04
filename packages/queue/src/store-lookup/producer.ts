import type { Queue } from "bullmq";

import type { StoreLookupJobData } from "@norish/queue/contracts/job-types";
import { normalizeGroceryName } from "@norish/shared/lib/normalized-name";

/**
 * A user's new grocery jumps a batch of stale prices. BullMQ reads a lower
 * number as the more urgent job.
 */
const MATCH_PRIORITY = 1;
const REFRESH_PRIORITY = 5;

/**
 * **Never enqueue on this queue with `delay`.** A lazy worker wakes on a
 * `waiting` event and a delayed job is only promoted by a running worker, so a
 * delayed job on a sleeping queue sleeps forever
 * (`packages/queue/src/lazy-worker-manager.ts`). This queue is always-on
 * precisely so the work is predictable; scheduling ahead would put the hazard
 * back for no gain.
 */
export async function addStoreMatchJob(
  queue: Queue<StoreLookupJobData>,
  data: Extract<StoreLookupJobData, { kind: "match" }>
): Promise<void> {
  await queue.add("match", data, {
    // One question per store and name, however many groceries asked it.
    jobId: `match:${data.storeId}:${normalizeGroceryName(data.name)}`,
    priority: MATCH_PRIORITY,
  });
}

export async function addStoreRefreshJob(
  queue: Queue<StoreLookupJobData>,
  data: Extract<StoreLookupJobData, { kind: "refresh" }>
): Promise<void> {
  if (data.productIds.length === 0) return;
  await queue.add("refresh", data, {
    jobId: `refresh:${data.storeId}:${data.productIds.slice().sort().join(",")}`,
    priority: REFRESH_PRIORITY,
  });
}
