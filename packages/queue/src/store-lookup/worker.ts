import type { Job } from "bullmq";
import { Worker } from "bullmq";

import type { StoreLookupJobData } from "@norish/queue/contracts/job-types";
import { getBullClient } from "@norish/queue/redis/bullmq";
import { createLogger } from "@norish/shared-server/logger";

import { baseWorkerOptions, QUEUE_NAMES, STALLED_INTERVAL, WORKER_CONCURRENCY } from "../config";
import { reportStep } from "../job-steps";
import { matchGroceryName, refreshProducts } from "./lookup";

const log = createLogger("worker:store-lookup");

// Read on every access, never copied into a module-local — see the note on
// `globalForRegistry` in ../registry.ts. Here the cost of getting it wrong is a
// rival always-on worker that the first instance's shutdown cannot reach.
const globalForWorker = globalThis as unknown as {
  storeLookupWorker: Worker<StoreLookupJobData> | null;
};

async function processStoreLookup(job: Job<StoreLookupJobData>): Promise<void> {
  if (job.data.kind === "match") {
    const { storeId, name, householdKey } = job.data;

    await matchGroceryName({
      storeId,
      name,
      householdKey,
      onStep: (step) => reportStep(job, step),
    });

    return;
  }

  await reportStep(job, "searching");
  const { refreshed } = await refreshProducts({
    productIds: job.data.productIds,
    householdKey: job.data.householdKey,
  });

  log.debug({ jobId: job.id, refreshed }, "Refreshed stale Shelf Prices");
}

/**
 * Always-on, concurrency 1. Always-on because a grocery must be priced while
 * the user is still looking at the list, and because a lazy worker is where
 * the `delay` trap lives; concurrency 1 because one visit at a time to
 * somebody else's supermarket is the whole good-citizen fence.
 */
export function startStoreLookupWorker(): void {
  if (globalForWorker.storeLookupWorker) return;

  const worker = new Worker<StoreLookupJobData>(QUEUE_NAMES.STORE_LOOKUP, processStoreLookup, {
    connection: getBullClient(),
    ...baseWorkerOptions,
    stalledInterval: STALLED_INTERVAL[QUEUE_NAMES.STORE_LOOKUP],
    concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.STORE_LOOKUP],
  });

  worker.on("failed", (job, error) => {
    log.error({ jobId: job?.id, err: error }, "Store lookup failed");
  });

  worker.on("error", (error) => {
    log.error({ err: error }, "Store lookup worker error");
  });

  globalForWorker.storeLookupWorker = worker;
  log.info("Store lookup worker started");
}

export async function stopStoreLookupWorker(): Promise<void> {
  const worker = globalForWorker.storeLookupWorker;

  if (worker) {
    worker.removeAllListeners();
    await worker.close();
    globalForWorker.storeLookupWorker = null;
    log.info("Store lookup worker stopped");
  }
}
