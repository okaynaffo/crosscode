---
"crosscode": patch
---

Fix Apple Terminal QR codes failing to scan. Replace half-block glyph rendering with full-cell ANSI background rendering plus spec quiet zone, so the code scans regardless of terminal line spacing, font, or light/dark theme. Adds `--no-qr` and `--small-qr` options.
