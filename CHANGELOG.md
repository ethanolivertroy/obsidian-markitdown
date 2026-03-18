# Changelog

## 2.1.0

Feature release with 11 new capabilities and a critical Python detection fix.

### Fixed

- **Python detection on macOS/Windows** (#13) — GUI apps (Obsidian/Electron) don't inherit shell PATH, so the plugin now searches well-known Python paths: Homebrew, Python.org Framework installs, Windows AppData, and Microsoft Store locations
- **Settings field focus loss** — Python path input no longer triggers dependency checks on every keystroke (debounced to 1.5s)
- **Empty path crash** — clearing the Python path field no longer crashes `spawn()` with an empty string
- **Stale metadata detection** — `check_install.py` now verifies `from markitdown import MarkItDown` actually works, not just that package metadata exists

### Added

- **Drag-and-drop conversion** — drop supported files directly into the editor to auto-convert and insert a wiki-link
- **URL/YouTube conversion** — new "Convert URL to Markdown" command for YouTube transcripts and web pages
- **Conversion preview** — preview converted markdown in a modal before saving (Save/Cancel)
- **Post-conversion hooks** — auto-add YAML frontmatter (source, date, converter) and custom tags
- **Custom filename template** — configure output names with `{filename}`, `{ext}`, `{date}`, `{datetime}` variables
- **Recursive folder conversion** — "Include subfolders" toggle preserves directory structure in output
- **Conversion history** — "View conversion history" command shows past conversions with success/fail badges
- **Resolved path hint** — settings now show which Python path is actually being used
- **Troubleshooting UI** — when Python/markitdown isn't found, shows tried paths, download links, and pip install commands with a copy button
- **Unit tests** — 30 Jest tests covering Python discovery, path utilities, and edge cases
- **BRAT beta channel** — GitHub Actions release workflow with `manifest-beta.json` for early access

### Changed

- Python discovery prefers the first Python where markitdown actually imports over one where it's absent
- Settings UI reorganized with new "Post-conversion" section
- `check_install.py` validates against an allowlist of package names

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
