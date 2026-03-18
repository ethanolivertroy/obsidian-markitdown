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

- Convert individual files or entire folders at once
- Easy installation of the Markitdown Python package directly from the plugin
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

1. Use the command palette to run "Convert folder contents to Markdown with Markitdown"
2. Select the folder containing the files you want to convert
3. Check the file types you want to include in the conversion
4. Click the "Convert" button
5. The converted Markdown files will be saved in your specified output folder

## Configuration

The plugin settings can be found in the Obsidian settings panel under "Markitdown":

- **Python Path**: Specify the path to your Python executable (default: "python")
- **Enable Markitdown Plugins**: Toggle to enable third-party Markitdown plugins
- **Azure Document Intelligence Endpoint**: Optionally add an Azure Document Intelligence endpoint for improved conversion quality
- **Output Folder**: Specify where the converted Markdown files should be saved (relative to vault root, default: "markitdown-output")

## How it works

This plugin acts as a bridge between Obsidian and Microsoft's Markitdown Python library. When you convert a file:

1. The plugin passes the file to the Markitdown Python library
2. Markitdown processes the file and extracts its content and structure
3. The content is converted to well-formatted Markdown
4. The resulting Markdown is saved as a new file in your Obsidian vault

## Troubleshooting

- **Python not found**: Make sure Python is installed on your system and the path is correctly set in the plugin settings
- **Conversion errors**: Check the console for error messages by pressing Ctrl+Shift+I (or Cmd+Opt+I on Mac)
- **Missing dependencies**: Some file formats may require additional Python dependencies. The plugin will try to install these automatically, but you may need to install them manually

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
