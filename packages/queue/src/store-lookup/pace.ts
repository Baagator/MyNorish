/**
 * Pacing store visits. Norish must never hammer somebody else's supermarket
 * on a household's behalf, so visits to one host are strung out one after
 * another with a pause between them. Together with the queue's concurrency of
 * 1 this is the whole fence: there is no second queue that may visit a shop.
 */

const STORE_VISIT_GAP_MS = 3_000;

/** One promise chain per host, so a second visit waits out the first's pause. */
const globalForPacing = globalThis as unknown as {
  storeVisitChains?: Map<string, Promise<unknown>>;
  storeVisitGapMs?: number;
};

function chains(): Map<string, Promise<unknown>> {
  globalForPacing.storeVisitChains ??= new Map();

  return globalForPacing.storeVisitChains;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The host a visit is a visit to, which is what is being paced. */
export function visitKey(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Run one store visit, after whatever is already queued for that host has
 * finished and its pause has elapsed. The first visit is not delayed; the ones
 * behind it are.
 */
export async function paceStoreVisit<T>(
  key: string,
  visit: () => Promise<T>,
  gapMs: number = globalForPacing.storeVisitGapMs ?? STORE_VISIT_GAP_MS
): Promise<T> {
  const queued = chains().get(key) ?? Promise.resolve();
  const run = queued.then(visit, visit);

  chains().set(
    key,
    run.then(
      () => sleep(gapMs),
      () => sleep(gapMs)
    )
  );

  return run;
}

export function resetStoreVisitPacingForTests(gapMs: number = STORE_VISIT_GAP_MS): void {
  globalForPacing.storeVisitChains = new Map();
  globalForPacing.storeVisitGapMs = gapMs;
}
