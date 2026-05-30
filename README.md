# Atlas

Atlas is a local-first incident evidence workspace. Raw evidence stays local and immutable while parser outputs, timeline events, entities, search indexes, exports, and OCR output are derived from that evidence.

## Day-to-Day On-Call Workflow

1. Create an incident when you are paged or begin investigating a production issue.
2. Keep the on-call snapshot current:
   - Status: `investigating`, `mitigating`, `monitoring`, or `resolved`.
   - Severity: `unknown`, `sev1`, `sev2`, `sev3`, or `sev4`.
   - Impact: who or what is affected.
   - Mitigation: rollback, workaround, fix, or monitoring state.
   - Pending actions: next checks, owners, comms, and handoff notes.
3. Paste or drop evidence as you work: logs, Slack snippets, screenshots, files, notes, deploy messages, and command output.
4. Use the timeline panel to add manual milestones that parsers cannot infer, such as detection, mitigation start, customer update, and resolution.
5. Use search to jump from a clue to source evidence, derived timeline events, parser output, or entities.
6. Export a Slack message for live updates or handoff. Export a Markdown document or raw incident folder for post-incident review and backup.

Atlas is intended to reduce context loss during an incident. Keep the snapshot short and operational; keep raw details as evidence.

## Development

Install dependencies:

```sh
pnpm install
```

Run the desktop app:

```sh
pnpm desktop
```

Run TypeScript checks:

```sh
pnpm check
```

Build all packages:

```sh
pnpm build
```

## Local OCR

Screenshot OCR is optional and local-only. Atlas uses the `tesseract` command if it is installed on the machine.

On macOS:

```sh
brew install tesseract
```

If `tesseract` is unavailable, image evidence still saves normally. OCR jobs fail non-fatally and can be retried from the evidence detail drawer after installing the dependency.
