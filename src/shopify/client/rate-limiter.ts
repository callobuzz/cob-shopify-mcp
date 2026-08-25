import type { ShopifyCostData, ShopifyQLCostData } from "@core/observability/types.js";

export class RateLimiter {
	private currentlyAvailable: number;
	private maxAvailable: number;
	private restoreRate: number;
	private activeConcurrent = 0;
	private maxConcurrent: number;
	private enabled: boolean;
	private shopifyQLCost: ShopifyQLCostData | null = null;
	private waitQueue: Array<{
		resolve: () => void;
		estimatedCost: number;
	}> = [];

	constructor(options?: {
		respectShopifyCost?: boolean;
		maxConcurrent?: number;
	}) {
		this.currentlyAvailable = 1000;
		this.maxAvailable = 1000;
		this.restoreRate = 50;
		this.maxConcurrent = options?.maxConcurrent ?? 10;
		this.enabled = options?.respectShopifyCost ?? true;
	}

	async acquire(estimatedCost?: number): Promise<void> {
		if (!this.enabled) return;

		const cost = estimatedCost ?? 0;

		if (this.activeConcurrent < this.maxConcurrent && (cost === 0 || this.currentlyAvailable >= cost)) {
			this.activeConcurrent++;
			if (cost > 0) {
				this.currentlyAvailable -= cost;
			}
			return;
		}

		return new Promise<void>((resolve) => {
			this.waitQueue.push({ resolve, estimatedCost: cost });
		});
	}

	release(): void {
		if (!this.enabled) return;
		this.activeConcurrent--;
		this.processQueue();
	}

	updateFromResponse(costData: ShopifyCostData): void {
		this.currentlyAvailable = costData.throttleStatus.currentlyAvailable;
		this.maxAvailable = costData.throttleStatus.maximumAvailable;
		this.restoreRate = costData.throttleStatus.restoreRate;
	}

	/**
	 * Records the ShopifyQL allowance reported by an analytics response.
	 *
	 * This is a second budget, independent of the leaky bucket above: it has no restore rate and
	 * refills only at `windowResetAt`. Tracking it is what makes it possible to warn before
	 * analytics stops working, rather than discovering it from a failed query.
	 */
	updateFromShopifyQLCost(costData: ShopifyQLCostData): void {
		this.shopifyQLCost = costData;
	}

	/** The most recently reported ShopifyQL allowance, or null if no analytics query has run. */
	getShopifyQLBudget(): ShopifyQLCostData | null {
		return this.shopifyQLCost;
	}

	/** Fraction of the ShopifyQL allowance still available (0–1), or null if unknown. */
	getShopifyQLBudgetFraction(): number | null {
		if (!this.shopifyQLCost || this.shopifyQLCost.maximumAvailable <= 0) return null;
		return this.shopifyQLCost.currentlyAvailable / this.shopifyQLCost.maximumAvailable;
	}

	private processQueue(): void {
		while (this.waitQueue.length > 0) {
			const next = this.waitQueue[0];
			if (this.activeConcurrent >= this.maxConcurrent) break;
			if (next.estimatedCost > 0 && this.currentlyAvailable < next.estimatedCost) break;

			this.waitQueue.shift();
			this.activeConcurrent++;
			if (next.estimatedCost > 0) {
				this.currentlyAvailable -= next.estimatedCost;
			}
			next.resolve();
		}
	}

	/** Exposed for testing */
	get _currentlyAvailable(): number {
		return this.currentlyAvailable;
	}

	get _activeConcurrent(): number {
		return this.activeConcurrent;
	}

	get _maxAvailable(): number {
		return this.maxAvailable;
	}
}
