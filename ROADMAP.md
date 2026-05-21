# Atlas Roadmap

## v0.2 Theme

Move from "evidence can be preserved and replayed" to "evidence can be organized, reprocessed, searched, and exported reliably."

## v0.2 Definition

Atlas `v0.2` is complete when:

- Parser replay is reliable.
- Evidence ingestion has visible status.
- Manual timeline corrections are possible.
- Search is filterable and source-linked.
- Attachments are easier to open, reveal, and copy.
- Parser coverage handles common incident text better.
- Incidents can be exported and imported locally.
- OCR remains optional unless the rest is stable.

Out of scope for `v0.2`:

- Auth
- Sync
- Cloud
- Teams
- AI RCA
- Live integrations
- Plugin system
- Agent loops
- Graph UI as a primary feature

## Priority Order

```txt
replayability > status visibility > manual correction > parser breadth > export > OCR
```

The core invariant remains: raw evidence stays immutable, and every derived fact remains explainable from source evidence.

## Milestone 1: v0.1-parser-replay

Goal: derived parser data can be safely regenerated from immutable evidence.

Scope:

- Add parse status per evidence: `unparsed`, `parsed`, and `failed` if existing jobs/errors support it cleanly.
- Add replay parsers action scoped to the selected incident.
- Keep frontend TypeScript parser execution.
- Keep raw evidence untouched.
- Regenerate parser outputs.
- Regenerate derived timeline and entity records.
- Distinguish parser-derived records from manual records before deleting anything.
- Preserve manual records.
- Add replay UI feedback: running, complete, and failed.
- Improve parser output display with parser name, parser version, created timestamp, and raw output viewer.

Exit criteria: replay parsers can be run repeatedly without corrupting evidence or deleting manual user work.

## Milestone 2: v0.1-ingestion-polish

Goal: evidence ingestion feels reliable and understandable.

Scope:

- Add ingestion status messaging: evidence saved, attachment saved, parser run started, parser succeeded, and parser failed.
- Use the existing `jobs` table lightly for parser job status and error text.
- Avoid building a full async worker unless already easy.
- Ensure failed parser output does not block evidence persistence.
- Ensure failed attachment preview does not break evidence detail.
- Allow replay to reprocess failed items.
- Improve evidence cards with parse status badge, attachment/file indicator, source/kind label, and created timestamp.
- Add evidence count/status summary per incident: total evidence, parsed/unparsed count, and failed parse count if supported.

Exit criteria: the user can tell what happened after dropping or pasting evidence and can recover by replaying parsers.

## Milestone 3: v0.1-manual-timeline

Goal: users can correct and supplement deterministic parsing.

Scope:

- Add manual timeline event creation.
- Add manual timeline event edit/delete.
- Visually distinguish parser-derived events from manual events.
- Allow manual events to optionally link to evidence.
- Require derived events to link to source evidence/parser output.
- Ensure parser replay does not delete manual events.
- Add confidence/source display for derived events.

Exit criteria: a user can build a useful timeline even when parsers miss context.

## Milestone 4: v0.1-search-and-navigation-polish

Goal: search becomes a practical navigation surface.

Scope:

- Add result filters for evidence, timeline, entity, and attachment/file name if indexed.
- Add result highlighting if simple.
- Ensure every search result opens the right detail.
- Evidence results open evidence detail.
- Timeline results open source evidence or highlight the event.
- Entity results open source evidence if available.
- Index attachment filename, evidence metadata, timeline title/description, and entity names/types.
- Add clear search behavior.
- Preserve sanitized FTS query behavior.

Exit criteria: search can be used as the main way to jump from a clue to its source evidence.

## Milestone 5: v0.1-attachment-polish

Goal: files and screenshots feel like first-class evidence.

Scope:

- Add `Open attachment`.
- Add `Reveal in Finder`.
- Keep `Copy image` for images.
- Keep `Copy text` for text evidence.
- For non-image files, support copy path, open, and reveal.
- Do not attempt complex clipboard file writes yet.
- Improve attachment preview states: image preview, unsupported preview, missing file, and failed load.

Exit criteria: a user can quickly inspect or locate every attached source artifact.

## Milestone 6: v0.2-parser-coverage

Goal: parser output becomes noticeably useful on real incident text.

Work order:

- Timestamp parser improvements: ISO, RFC-like logs, common syslog-ish formats, and timezone handling if low risk.
- HTTP/error parser: status codes, endpoints, methods, latency terms, timeout phrases, and error phrases.
- Deploy/reference parser: SHAs, image tags, semver versions, rollback terms, and deploy terms.
- Kubernetes parser: pods, namespaces, deployments, `CrashLoopBackOff`, `OOMKilled`, restarts, and node names.
- Slack snippet parser: usernames, timestamps, channel-ish references, and message blocks.
- Entity deduplication: normalize obvious duplicates, avoid over-merging, and preserve source evidence links.
- Source spans where practical: line number, character range, and matched text.

Exit criteria: a pasted real incident log or Slack snippet produces useful timeline events and entities with source links.

## Milestone 7: v0.2-local-export-import

Goal: users can back up, inspect, and move incidents without cloud sync.

Export structure:

```txt
incident-id/
  incident.json
  evidence.json
  timeline.json
  entities.json
  tags.json
  parser_outputs.json
  attachments/
```

Scope:

- Add export incident.
- Preserve evidence IDs, attachment references, content hashes, parser names/versions, and source links.
- Add import incident.
- Detect ID conflicts.
- Preserve IDs when safe, or remap IDs and source links carefully.
- Keep SQLite canonical.
- Do not dual-write during normal use.

Exit criteria: a whole incident can be exported, deleted from the app, imported again, and still retain evidence, attachments, parser outputs, timeline, entities, and source links.

## Milestone 8: v0.2-ocr-optional

Only do this if milestones 1-7 feel stable.

Goal: screenshots become searchable and parsable through local OCR.

Scope:

- Add OCR job type.
- Keep OCR local-only.
- Store OCR text as parser output or evidence-linked derived text.
- Feed OCR text into the same parser pipeline.
- Show OCR output in evidence detail.
- Index OCR text in FTS.
- Make OCR failure non-fatal.
- Avoid chart understanding/layout analysis.

Exit criteria: a screenshot with visible text can become searchable and can produce timeline/entities through the normal parser pipeline.

If OCR is too heavy, defer it to `v0.3`.

## Recommended v0.2 Cut Line

Required:

- Parser replay
- Parse status/ingestion polish
- Manual timeline events
- Search filters/navigation polish
- Attachment open/reveal polish
- Parser coverage improvements
- Local export/import

Optional:

- OCR
