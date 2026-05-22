import type { ParsedEntity } from "@atlas/shared";

export function parseTimestamp(raw: string): string | null {
	if (/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(raw)) {
		const [hours, minutes] = raw.split(":").map(Number);
		const date = new Date();
		date.setHours(hours, minutes, 0, 0);
		return date.toISOString();
	}
	const withYear =
		/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}$/.test(
			raw,
		)
			? `${new Date().getUTCFullYear()} ${raw}`
			: raw;
	const normalized =
		withYear.includes(" ") && /^\d{4}-/.test(withYear)
			? withYear.replace(" ", "T")
			: withYear;
	const date = /^\d{10}(?:\.\d{3})?$/.test(raw)
		? new Date(Number(raw) * 1000)
		: new Date(normalized);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function dedupeEntities(entities: ParsedEntity[]): ParsedEntity[] {
	const seen = new Set<string>();
	return entities.filter((entity) => {
		const key = `${entity.type}:${entity.value.toLowerCase()}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
