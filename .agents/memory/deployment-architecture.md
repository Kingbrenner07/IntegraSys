---
name: Deployment architecture
description: Durable hosting and service-boundary decisions for Dashboard RH IntegraSys.
---

The intended production architecture is a static frontend on GitHub Pages, Supabase for authentication and application data, and a separate backend service for PDF processing and OCR.

**Why:** GitHub Pages cannot safely run authentication, authorization, databases, Python, Tesseract, Poppler, or long-running document jobs.

**How to apply:** Keep the frontend deployable as static assets. Treat Supabase as the future identity/data authority, and keep document binaries and processing behind an authenticated backend rather than in the public repository.