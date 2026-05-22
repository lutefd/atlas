import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { search, type SearchResult, type Snapshot } from "../../api";
import { sanitizeFtsQuery } from "../../lib/search";

export function SearchPanel({
	incidentId,
	timeline,
	entities,
	onSelectEvidence,
}: {
	incidentId: string;
	timeline: Snapshot["timelineEvents"];
	entities: Snapshot["entities"];
	onSelectEvidence: (id: string) => void;
}) {
	const [query, setQuery] = useState("");
	const [searchFilter, setSearchFilter] = useState("all");
	const safeQuery = sanitizeFtsQuery(query);
	const { data: results = [], error: searchError } = useQuery<SearchResult[]>({
		queryKey: ["search", incidentId, safeQuery],
		queryFn: () =>
			safeQuery ? search(incidentId, safeQuery) : Promise.resolve([]),
		enabled: Boolean(safeQuery),
	});
	const filteredResults =
		searchFilter === "all"
			? results
			: results.filter((result) => result.kind === searchFilter);

	function openSearchResult(result: SearchResult) {
		if (
			result.kind === "evidence" ||
			result.kind === "attachment" ||
			result.kind === "parser_output"
		)
			onSelectEvidence(result.refId);
		if (result.kind === "timeline")
			onSelectEvidence(
				timeline.find((event) => event.id === result.refId)?.sourceEvidenceId ??
					"",
			);
		if (result.kind === "entity")
			onSelectEvidence(
				entities.find((entity) => entity.id === result.refId)
					?.sourceEvidenceId ?? "",
			);
	}

	return (
		<section className="panel">
			<div className="panel-heading">
				<h2>
					<Search size={16} /> Search
				</h2>
				{query ? <button onClick={() => setQuery("")}>Clear</button> : null}
			</div>
			<input
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				placeholder="Search evidence, events, entities, files"
			/>
			<div className="search-filters">
				{[
					"all",
					"evidence",
					"timeline",
					"entity",
					"attachment",
					"parser_output",
				].map((filter) => (
					<button
						className={searchFilter === filter ? "active" : ""}
						key={filter}
						onClick={() => setSearchFilter(filter)}
					>
						{filter}
					</button>
				))}
			</div>
			{query.trim() && !safeQuery ? (
				<p className="muted">Use letters or numbers to search.</p>
			) : null}
			{searchError ? (
				<p className="error">Search failed: {String(searchError)}</p>
			) : null}
			{safeQuery && results.length === 0 && !searchError ? (
				<p className="muted">No results.</p>
			) : null}
			{safeQuery && results.length > 0 && filteredResults.length === 0 ? (
				<p className="muted">No {searchFilter} results.</p>
			) : null}
			{filteredResults.map((result) => (
				<button
					className="result"
					key={`${result.kind}-${result.refId}`}
					onClick={() => openSearchResult(result)}
				>
					<strong>
						{result.kind}: {result.title}
					</strong>
					<span dangerouslySetInnerHTML={{ __html: result.snippet }} />
				</button>
			))}
		</section>
	);
}
