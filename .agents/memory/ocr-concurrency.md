---
name: OCR concurrency
description: Operational constraint for scanned PDF processing in the RH API.
---

Scanned PDF jobs must be processed through a single in-process queue, with a timeout on each external OCR invocation.

**Why:** Concurrent Tesseract processes saturated the available CPU and left several user-visible jobs in “processing” for many minutes without useful progress.

**How to apply:** Preserve serialized OCR execution when changing upload handling or adding workers. If parallel processing is needed later, move OCR to bounded worker capacity with persistent job state rather than starting one process per upload.