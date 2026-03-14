/**
 * Field selection filter — extracts only specified keys from data.
 */

/**
 * Filter data to include only the specified fields.
 *
 * - Plain object: extract only matching keys
 * - Array of objects: filter each element
 * - Object with a nested array (e.g. {products: [...], pageInfo: {...}}):
 *   detect the array property and filter its elements, discarding non-array keys
 * - Primitives/null/undefined: returned as-is
 */
export function filterFields(data: unknown, fields: string[]): unknown {
	if (data === null || data === undefined) {
		return data;
	}

	if (typeof data !== "object") {
		return data;
	}

	if (Array.isArray(data)) {
		return data.map((item) => pickFields(item, fields));
	}

	const obj = data as Record<string, unknown>;

	// Check if object has a nested array property (e.g. {products: [...], pageInfo: {...}})
	const arrayKey = findArrayProperty(obj);
	if (arrayKey !== undefined) {
		const arr = obj[arrayKey] as unknown[];
		return arr.map((item) => pickFields(item, fields));
	}

	// Check if object is a single-key wrapper (e.g. {product: {id, title, ...}})
	// If the requested fields don't exist at this level but exist inside
	// the single nested object, unwrap and filter there.
	const keys = Object.keys(obj);
	if (keys.length === 1) {
		const inner = obj[keys[0]];
		if (inner !== null && typeof inner === "object" && !Array.isArray(inner)) {
			const innerObj = inner as Record<string, unknown>;
			const hasFieldsInner = fields.some((f) => f in innerObj);
			const hasFieldsOuter = fields.some((f) => f in obj);
			if (hasFieldsInner && !hasFieldsOuter) {
				return pickFields(innerObj, fields);
			}
		}
	}

	// Plain object
	return pickFields(obj, fields);
}

function pickFields(item: unknown, fields: string[]): Record<string, unknown> {
	if (item === null || item === undefined || typeof item !== "object") {
		return {};
	}
	const obj = item as Record<string, unknown>;
	const result: Record<string, unknown> = {};
	for (const field of fields) {
		if (field in obj) {
			result[field] = obj[field];
		}
	}
	return result;
}

/**
 * Find the first property that is an array in an object.
 * Only returns a key if the object has at least one array property
 * and at least one non-array property (indicating a wrapper object).
 */
function findArrayProperty(obj: Record<string, unknown>): string | undefined {
	const keys = Object.keys(obj);
	let arrayKey: string | undefined;
	let hasNonArray = false;

	for (const key of keys) {
		if (Array.isArray(obj[key])) {
			if (arrayKey === undefined) {
				arrayKey = key;
			}
		} else {
			hasNonArray = true;
		}
	}

	return hasNonArray ? arrayKey : undefined;
}
