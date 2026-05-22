export function sanitizeFtsQuery(value: string) {
	return value
		.trim()
		.split(/\s+/)
		.map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, ""))
		.filter(Boolean)
		.join(" ");
}
