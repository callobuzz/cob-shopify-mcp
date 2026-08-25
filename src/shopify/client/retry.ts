export interface RetryOptions {
	maxRetries?: number;
	baseDelayMs?: number;
}

export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
	const maxRetries = options?.maxRetries ?? 3;
	const baseDelay = options?.baseDelayMs ?? 1000;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (err: unknown) {
			if (attempt === maxRetries) throw err;

			// An error that declares itself non-retryable is final. Without this, any error lacking
			// an HTTP status falls through to the status check below and gets retried — which is
			// wrong for failures that are known to be permanent for this request, such as an
			// exhausted ShopifyQL allowance whose window will not turn over soon enough to wait for.
			if ((err as { retryable?: boolean })?.retryable === false) throw err;

			// An error may state exactly how long to wait — for a budget that resets at a window
			// boundary, that beats exponential backoff, which would either retry too early and
			// waste an attempt or sleep well past the reset.
			const explicitWaitMs = (err as { retryAfterMs?: number })?.retryAfterMs;

			const status =
				(err as Record<string, unknown>)?.status ??
				((err as Record<string, Record<string, unknown>>)?.response?.status as number | undefined);

			// Only retry on 429 and 5xx
			if (status !== undefined && status !== 429 && (status as number) < 500) throw err;

			// Respect Retry-After header
			const retryAfter = (
				err as { response?: { headers?: { get?(h: string): string | null } } }
			)?.response?.headers?.get?.("Retry-After");

			const delay = explicitWaitMs ?? (retryAfter ? Number(retryAfter) * 1000 : baseDelay * 2 ** attempt);

			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
	throw new Error("Unreachable");
}
