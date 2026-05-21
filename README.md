# Atlas

Atlas is a local-first incident evidence workspace. Raw evidence stays local and immutable while parser outputs, timeline events, entities, search indexes, exports, and OCR output are derived from that evidence.

## Local OCR

Screenshot OCR is optional and local-only. Atlas uses the `tesseract` command if it is installed on the machine.

On macOS:

```sh
brew install tesseract
```

If `tesseract` is unavailable, image evidence still saves normally. OCR jobs fail non-fatally and can be retried from the evidence detail drawer after installing the dependency.
