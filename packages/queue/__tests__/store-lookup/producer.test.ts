// @vitest-environment node
/**
 * What goes onto the store lookup queue, and in particular what never does:
 * a job with a `delay`. A lazy worker wakes on a `waiting` event and a delayed
 * job is only promoted by a running worker, so a delayed job can sleep
 * forever. This queue is always-on precisely so the work is predictable.
 */
import type { Queue } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoreLookupJobData } from "@norish/queue/contracts/job-types";
import { addStoreMatchJob, addStoreRefreshJob } from "@norish/queue/store-lookup/producer";

const add = vi.fn();
const queue = { add } as unknown as Queue<StoreLookupJobData>;

const HOUSEHOLD = "household-1";
const STORE = "11111111-1111-4111-8111-111111111111";

describe("the store lookup producer", () => {
  beforeEach(() => {
    add.mockReset();
  });

  it("never enqueues a job with a delay", async () => {
    await addStoreMatchJob(queue, {
      kind: "match",
      storeId: STORE,
      name: "kaas",
      householdKey: HOUSEHOLD,
    });
    await addStoreRefreshJob(queue, {
      kind: "refresh",
      storeId: STORE,
      productIds: ["p1"],
      householdKey: HOUSEHOLD,
    });

    expect(add).toHaveBeenCalledTimes(2);
    for (const call of add.mock.calls) {
      expect(call[2] ?? {}).not.toHaveProperty("delay");
    }
  });

  it("lets a user's new grocery jump a batch of stale prices", async () => {
    await addStoreMatchJob(queue, {
      kind: "match",
      storeId: STORE,
      name: "kaas",
      householdKey: HOUSEHOLD,
    });
    await addStoreRefreshJob(queue, {
      kind: "refresh",
      storeId: STORE,
      productIds: ["p1"],
      householdKey: HOUSEHOLD,
    });

    const matchPriority = add.mock.calls[0]?.[2]?.priority as number;
    const refreshPriority = add.mock.calls[1]?.[2]?.priority as number;

    expect(matchPriority).toBeLessThan(refreshPriority);
  });

  it("asks a shop one question per store and name, however many groceries asked it", async () => {
    await addStoreMatchJob(queue, {
      kind: "match",
      storeId: STORE,
      name: "Oude Kaas",
      householdKey: HOUSEHOLD,
    });
    await addStoreMatchJob(queue, {
      kind: "match",
      storeId: STORE,
      name: "oude  kaas!",
      householdKey: HOUSEHOLD,
    });

    expect(add.mock.calls[0]?.[2]?.jobId).toBe(add.mock.calls[1]?.[2]?.jobId);
  });

  it("enqueues nothing to refresh when nothing is stale", async () => {
    await addStoreRefreshJob(queue, {
      kind: "refresh",
      storeId: STORE,
      productIds: [],
      householdKey: HOUSEHOLD,
    });

    expect(add).not.toHaveBeenCalled();
  });
});
