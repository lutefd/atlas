import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Tags } from "lucide-react";
import { useState } from "react";
import type { Snapshot } from "../../api";
import { addTag, deleteTag } from "../../api";

export function TagsPanel({
	incidentId,
	tags,
}: {
	incidentId: string;
	tags: Snapshot["tags"];
}) {
	const queryClient = useQueryClient();
	const [tag, setTag] = useState("");
	const addTagMutation = useMutation({
		mutationFn: () => addTag(incidentId, tag),
		onSuccess: () => {
			setTag("");
			queryClient.invalidateQueries({ queryKey: ["snapshot"] });
		},
	});
	const deleteTagMutation = useMutation({
		mutationFn: deleteTag,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["snapshot"] });
		},
	});
	return (
		<section className="panel">
			<h2>
				<Tags size={16} /> Tags
			</h2>
			<div className="tag-input">
				<input
					value={tag}
					onChange={(event) => setTag(event.target.value)}
					placeholder="Add tag"
				/>
				<button
					onClick={() => addTagMutation.mutate()}
					disabled={!tag.trim()}
				>
					Add
				</button>
			</div>
			{tags.length ? (
				tags.map((item) => (
					<span className="pill tag-pill" key={item.id}>
						{item.name}
						<button
							title={`Remove ${item.name}`}
							onClick={() => deleteTagMutation.mutate(item.id)}
						>
							×
						</button>
					</span>
				))
			) : (
				<p className="muted">No tags yet.</p>
			)}
		</section>
	);
}
