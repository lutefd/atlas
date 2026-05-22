import {
	deriveEntities,
	deriveTimelineEvents,
	parseEvidence,
} from "@atlas/core";
import type { Evidence, ParsedOutput } from "@atlas/shared";
import {
	addEvidence,
	clearEvidenceParsers,
	createJob,
	hasOcr,
	runOcr,
	saveParserOutput,
	updateJob,
} from "../../api";

async function fileToBase64(file: File) {
	const buffer = await file.arrayBuffer();
	let binary = "";
	const bytes = new Uint8Array(buffer);
	for (let index = 0; index < bytes.length; index += 8192) {
		binary += String.fromCharCode(...bytes.slice(index, index + 8192));
	}
	return btoa(binary);
}

export async function ingestEvidence(input: {
	incidentId: string;
	kind: string;
	source: string;
	text?: string;
	file?: File;
}) {
	let attachmentBase64: string | undefined;
	let attachmentName: string | undefined;
	if (input.file) {
		attachmentName = input.file.name;
		attachmentBase64 = await fileToBase64(input.file);
	}
	const evidence = await addEvidence({
		incidentId: input.incidentId,
		kind: input.kind as Evidence["kind"],
		source: input.source,
		text: input.text,
		metadata: { fileName: input.file?.name },
		attachmentName,
		attachmentMimeType: input.file?.type || null,
		attachmentBase64,
	});
	try {
		await runParsersForEvidence(evidence);
	} catch (caught) {
		console.error("Parser failed after evidence was saved:", caught);
	}
	if (input.file?.type.startsWith("image/") && (await hasOcr())) {
		try {
			await runOcrForEvidence(evidence);
		} catch (caught) {
			console.error("OCR failed after evidence was saved:", caught);
		}
	}
}

export async function runParsersForEvidence(evidence: Evidence) {
	const jobId = crypto.randomUUID();
	await createJob({
		id: jobId,
		kind: "parser",
		status: "running",
		payload: { evidenceId: evidence.id, incidentId: evidence.incidentId },
	});
	try {
		const outputs = await parseEvidence(evidence);
		for (const output of outputs) {
			const timeline = deriveTimelineEvents(evidence.incidentId, output);
			const entities = deriveEntities(evidence.incidentId, output);
			await saveParserOutput({
				id: output.id,
				evidenceId: output.evidenceId,
				parserName: output.parserName,
				parserVersion: output.parserVersion,
				output: output.output,
				timelineEvents: timeline,
				entities,
			});
		}
		await updateJob({ id: jobId, status: "succeeded" });
	} catch (caught) {
		await updateJob({
			id: jobId,
			status: "failed",
			errorText: caught instanceof Error ? caught.message : String(caught),
		});
		throw caught;
	}
}

export async function replayEvidenceParsers(evidence: Evidence) {
	await clearEvidenceParsers(evidence.id);
	await runParsersForEvidence(evidence);
}

export async function runOcrForEvidence(evidence: Evidence) {
	const jobId = crypto.randomUUID();
	await createJob({
		id: jobId,
		kind: "ocr",
		status: "running",
		payload: { evidenceId: evidence.id, incidentId: evidence.incidentId },
	});
	try {
		const text = await runOcr(evidence.id);
		if (!text.trim()) throw new Error("OCR completed but found no text.");
		const ocrEvidence = { ...evidence, contentText: text };
		const outputs = await parseEvidence(ocrEvidence);
		const parsedOutput = outputs.reduce<ParsedOutput>(
			(combined, output) => ({
				entities: [...combined.entities, ...output.output.entities],
				timestamps: [...combined.timestamps, ...output.output.timestamps],
				events: [...combined.events, ...output.output.events],
				metrics: [...combined.metrics, ...output.output.metrics],
				references: [...combined.references, ...output.output.references],
			}),
			{
				entities: [],
				timestamps: [],
				events: [],
				metrics: [],
				references: [],
			},
		);
		const ocrOutput = {
			...parsedOutput,
			references: [
				{ kind: "ocr_text", value: text, sourceText: text },
				...parsedOutput.references,
			],
		};
		await saveParserOutput({
			id: crypto.randomUUID(),
			evidenceId: evidence.id,
			parserName: "local-ocr",
			parserVersion: "0.1.0",
			output: ocrOutput,
			timelineEvents: [],
			entities: [],
		});
		for (const output of outputs) {
			const timeline = deriveTimelineEvents(evidence.incidentId, output);
			const entities = deriveEntities(evidence.incidentId, output);
			await saveParserOutput({
				id: output.id,
				evidenceId: evidence.id,
				parserName: `${output.parserName}-ocr`,
				parserVersion: output.parserVersion,
				output: output.output,
				timelineEvents: timeline,
				entities,
			});
		}
		await updateJob({ id: jobId, status: "succeeded" });
	} catch (caught) {
		await updateJob({
			id: jobId,
			status: "failed",
			errorText: caught instanceof Error ? caught.message : String(caught),
		});
		throw caught;
	}
}
