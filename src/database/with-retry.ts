/**
 * Supabase's shared pooler load-balances across several backend IPs; some
 * are occasionally unreachable from a given network path while others work
 * fine (confirmed by hand: a bare connection attempt fails, then succeeds
 * moments later with no code change). Retrying a couple of times absorbs
 * that instead of failing the user's request outright.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 400): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}
