---
name: PDF processing runtime
description: Runtime assumptions and persistence boundary for the RH PDF pipeline.
---

The PDF pipeline relies on Node PDF manipulation plus command-line Poppler text extraction, with Tesseract attempted only as an OCR fallback. Generated outputs are held in process memory for the current job lifecycle.

**Why:** The supplied Python projects depend on desktop-only libraries and bundled Windows binaries that are not available in the server runtime, while Poppler is available and keeps normal text PDFs functional.

**How to apply:** Keep the processing API authenticated and validate PDF bytes server-side. If jobs must survive restarts or scale across workers, move inputs and outputs to private object storage and run OCR in a dedicated worker before changing the frontend contract.