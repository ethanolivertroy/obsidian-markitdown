# Markitdown File Converter

Integrate Microsoft's [Markitdown](https://github.com/microsoft/markitdown) tool to convert various file formats to Markdown for your vault.

## Features

- Convert various file formats to Markdown:
  - PDF
  - PowerPoint (PPTX)
  - Word (DOCX)
  - Excel (XLSX, XLS)
  - Images (with EXIF metadata and OCR)
  - Audio (with EXIF metadata and speech transcription)
  - HTML
  - Text-based formats (CSV, JSON, XML)
  - ZIP files
  - Youtube URLs
  - And more!

- Convert individual files or entire folders (with recursive subfolder support)
- **Drag-and-drop** — drop files into the editor to auto-convert
- **URL/YouTube conversion** — convert web pages and YouTube transcripts to Markdown
- **Conversion preview** — preview output before saving
- **Post-conversion hooks** — auto-add YAML frontmatter and tags
- **Custom filename templates** — use `{filename}`, `{date}`, `{ext}`, `{datetime}` variables
- **Conversion history** — browse past conversions with success/fail tracking
- Easy installation of the Markitdown Python package directly from the plugin
- Smart Python detection across macOS, Windows, and Linux (Homebrew, Framework, AppData paths)
- Optional use of Azure Document Intelligence for improved conversion quality
- Support for third-party Markitdown plugins

## Installation

1. Install the plugin from the Obsidian Community Plugins browser
2. Enable the plugin in Obsidian's settings
3. The plugin will guide you through installing the Markitdown Python package

## Beta Testing

You can get early access to new features by installing beta releases via [BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewers Auto-update Tester):

1. Install the BRAT plugin from the Obsidian Community Plugins browser
2. Enable BRAT in your Obsidian settings
3. In BRAT settings, click **Add Beta Plugin**
4. Enter: `ethanolivertroy/obsidian-markitdown`
5. BRAT will install the latest beta release and keep it updated automatically

## Requirements

- Obsidian v0.15.0 or higher
- Python 3.7 or higher installed on your system
- Internet connection for initial Markitdown installation

## Usage

### Converting a single file

1. Click the "Convert to Markdown with Markitdown" ribbon icon in the left sidebar, or use the command palette to run "Convert file to Markdown with Markitdown"
2. Select the file you want to convert
3. Click the "Convert" button
4. The converted Markdown file will be saved in your specified output folder and automatically opened

### Converting multiple files in a folder

1. Use the command palette to run "Convert folder to Markdown"
2. Select the folder containing the files you want to convert
3. Toggle "Include subfolders" for recursive conversion
4. Check the file types you want to include
5. Click "Convert" — folder structure is preserved in the output

### Converting a URL or YouTube video

1. Use the command palette to run "Convert URL to Markdown"
2. Paste any URL (YouTube, web pages, etc.)
3. Click "Convert" — the transcript or page content is saved as Markdown

### Drag-and-drop

Simply drag a supported file from Finder/Explorer directly into an open note. The plugin will convert it and insert a link at the drop position.

### Viewing conversion history

Use the command palette to run "View conversion history" to see all past conversions with timestamps, success/fail status, and processing times.

## Configuration

The plugin settings can be found in the Obsidian settings panel under "Markitdown":

- **Python Path**: Path to your Python executable — the plugin auto-detects common locations if left as "python"
- **Output Folder**: Where converted files are saved (relative to vault root, default: "markitdown-output")
- **Output Filename Template**: Customize output names with `{filename}`, `{ext}`, `{date}`, `{datetime}`
- **Extract Images**: Extract embedded images from PDFs to separate files
- **Recursive Folder Conversion**: Include subfolders when converting folders
- **Drag and Drop**: Auto-convert supported files dropped into the editor
- **Context Menu**: Right-click "Convert to Markdown" in the file explorer
- **Auto Frontmatter**: Automatically add YAML frontmatter with source file, date, and converter
- **Auto Tags**: Comma-separated tags added to converted files' frontmatter
- **Enable Markitdown Plugins**: Toggle third-party Markitdown plugins with key-value argument editor
- **Azure Document Intelligence Endpoint**: Optional Azure endpoint for enhanced PDF conversion

## How it works

This plugin acts as a bridge between Obsidian and Microsoft's Markitdown Python library. When you convert a file:

1. The plugin passes the file to the Markitdown Python library
2. Markitdown processes the file and extracts its content and structure
3. The content is converted to well-formatted Markdown
4. The resulting Markdown is saved as a new file in your Obsidian vault

## Troubleshooting

- **Python not found**: The plugin searches common paths automatically. If it still can't find Python, set the full path in settings (e.g., `C:\Users\You\AppData\Local\Programs\Python\Python313\python.exe` on Windows or `/Library/Frameworks/Python.framework/Versions/3.11/bin/python3` on macOS). Check the Troubleshooting section in settings for details on which paths were tried.
- **Markitdown not installed**: Run `pip install markitdown[all]` in your terminal using the same Python shown in settings. Or click the "Install Markitdown" button in the settings panel.
- **Conversion errors**: Check the console (Ctrl+Shift+I / Cmd+Opt+I) or the conversion history (command palette → "View conversion history")
- **Missing dependencies**: Some file formats may require additional Python packages. The plugin will try to install these automatically.

## Development

- Clone this repo
- Make sure your NodeJS is at least v16 (`node --version`)
- `npm i` or `yarn` to install dependencies
- `npm run dev` to start compilation in watch mode

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json`, and the `python/` directory to your vault `VaultFolder/.obsidian/plugins/markitdown/`

## Credits

- This plugin integrates [Microsoft's Markitdown](https://github.com/microsoft/markitdown) Python library
- Built on the [Obsidian Plugin System](https://github.com/obsidianmd/obsidian-api)
- Created by Ethan Troy

## License

This project is licensed under the [MIT License](LICENSE) - see the [LICENSE](LICENSE) file for details.
