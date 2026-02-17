# Changelog

## 2.0.0

Ground-up rewrite addressing security, architecture, and feature gaps.

### Security

- Eliminated shell injection vulnerabilities — replaced `exec()` with `spawn()` using argument arrays and `shell: false`
- Bundled Python wrapper scripts use `argparse` with no string interpolation of user input
- Path traversal prevention in output folder, image directory, and image format handling
- Prototype pollution protection in plugin arguments
- Error messages sanitized to strip absolute paths before display

### Added

- **Image extraction** from PDFs and EPUBs — base64 data URIs decoded to `{filename}-images/` subfolder
- **Plugin arguments editor** — key-value pair UI in settings for third-party Markitdown plugins
- **Context menu** — right-click "Convert to Markdown" on supported file types in the file explorer
- **Setup wizard** — guided modal for Python detection and Markitdown installation
- **Batch progress bar** — visual progress indicator for folder conversions
- **Python path fallback** — automatic `python3` detection on macOS/Linux when `python` is unavailable
- **Live settings refresh** — changing Python path immediately re-checks dependencies

### Changed

- Decomposed monolithic `main.ts` (735 lines) into 12 focused modules under `src/` and `python/`
- Unicode support via `PYTHONUTF8=1` environment variable
- Async file I/O in modals (replaced `writeFileSync`/`unlinkSync` with `fs.promises`)
- Updated build target to ES2020, TypeScript 5.x strict mode
- Minimum Obsidian version remains 0.15.0

### Removed

- Docling converter (deferred to a separate plugin)
- `child_process.exec()` — zero imports remaining in codebase

## 1.0.1

- Fix diacritics/Unicode support
- UI text updates to follow Obsidian conventions

## 1.0.0

- Initial release
- Convert files to Markdown using Microsoft's Markitdown
- Support for PDF, DOCX, PPTX, XLSX, HTML, images, audio, and more
- Single file and batch folder conversion
- Azure Document Intelligence integration
