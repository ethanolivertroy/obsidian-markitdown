/**
 * Bundled Python scripts as string constants.
 * These are written to disk on first load so the plugin works
 * when installed via the Obsidian Community Plugins browser
 * (which only downloads main.js, manifest.json, styles.css).
 */
import * as fs from 'fs';
import * as path from 'path';

const CHECK_INSTALL_PY = `#!/usr/bin/env python3
"""Check Python environment and installed packages."""
import argparse
import json
import sys

ALLOWED_PACKAGES = {"markitdown"}

def check_package(name):
    if name not in ALLOWED_PACKAGES:
        return {"installed": False, "version": None}
    if name == "markitdown":
        try:
            from markitdown import MarkItDown
        except (ImportError, AttributeError, TypeError):
            return {"installed": False, "version": None}
    try:
        from importlib.metadata import version, PackageNotFoundError
        try:
            ver = version(name)
            return {"installed": True, "version": ver}
        except PackageNotFoundError:
            return {"installed": False, "version": None}
    except ImportError:
        try:
            import pkg_resources
            ver = pkg_resources.get_distribution(name).version
            return {"installed": True, "version": ver}
        except Exception:
            return {"installed": False, "version": None}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", required=True)
    args = parser.parse_args()
    packages = ["markitdown"] if args.check == "all" else [args.check]
    result = {"python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}", "packages": {}}
    for pkg in packages:
        result["packages"][pkg] = check_package(pkg)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
`;

const INSTALL_PACKAGE_PY = `#!/usr/bin/env python3
"""Install a Python package using pip."""
import argparse
import json
import subprocess
import sys

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", required=True)
    args = parser.parse_args()
    try:
        process = subprocess.Popen(
            [sys.executable, "-m", "pip", "install", args.package],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        for line in process.stdout:
            print(line, end="", flush=True)
        process.wait()
        if process.returncode == 0:
            print(json.dumps({"success": True}))
        else:
            print(json.dumps({"success": False, "error": f"pip exited with code {process.returncode}"}))
            sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
`;

const MARKITDOWN_WRAPPER_PY = `#!/usr/bin/env python3
"""Convert files to Markdown using Microsoft's Markitdown."""
import argparse
import base64
import json
import os
import re
import sys
import time

def extract_images_from_markdown(markdown_text, image_dir):
    os.makedirs(image_dir, exist_ok=True)
    count = 0
    image_dir_name = os.path.basename(image_dir)
    pattern = r'(!\\[[^\\]]*\\])\\(data:image/([^;]+);base64,([A-Za-z0-9+/=\\s]+)\\)'
    def replace_data_uri(match):
        nonlocal count
        next_index = count + 1
        alt_text = match.group(1)
        img_format = match.group(2)
        b64_data = match.group(3).replace("\\n", "").replace("\\r", "").replace(" ", "")
        ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "bmp", "tiff", "tif", "webp", "svg", "ico"}
        ext = img_format.lower()
        if ext == "jpeg": ext = "jpg"
        elif ext == "svg+xml": ext = "svg"
        ext = re.sub(r'[^a-z0-9]', '', ext)
        if ext not in ALLOWED_EXTENSIONS: ext = "png"
        filename = f"image_{next_index:03d}.{ext}"
        filepath = os.path.join(image_dir, filename)
        try:
            image_bytes = base64.b64decode(b64_data)
            with open(filepath, "wb") as f:
                f.write(image_bytes)
        except Exception as e:
            print(json.dumps({"warning": f"Failed to decode image {next_index}: {e}"}), file=sys.stderr)
            return match.group(0)
        count = next_index
        return f"{alt_text}(./{image_dir_name}/{filename})"
    updated_markdown = re.sub(pattern, replace_data_uri, markdown_text)
    return updated_markdown, count

def main():
    parser = argparse.ArgumentParser(description="Convert files to Markdown using Markitdown")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--input", help="Input file path")
    group.add_argument("--url", help="URL to convert")
    parser.add_argument("--output", required=True, help="Output markdown file path")
    parser.add_argument("--enable-plugins", action="store_true")
    parser.add_argument("--plugin-args", default="{}")
    parser.add_argument("--docintel-endpoint")
    parser.add_argument("--extract-images", action="store_true")
    parser.add_argument("--image-dir")
    args = parser.parse_args()
    if args.extract_images and not args.image_dir:
        parser.error("--image-dir is required when --extract-images is specified")
    start_time = time.time()
    try:
        source = args.url if args.url else args.input
        if args.input:
            if not os.path.isfile(args.input):
                print(json.dumps({"error": f"Input file does not exist: {os.path.basename(args.input)}", "type": "FileError"}), file=sys.stderr)
                sys.exit(1)
            if not os.access(args.input, os.R_OK):
                print(json.dumps({"error": f"Input file is not readable: {os.path.basename(args.input)}", "type": "FileError"}), file=sys.stderr)
                sys.exit(1)
        if args.url:
            if not args.url.startswith(("http://", "https://")):
                print(json.dumps({"error": "URL must start with http:// or https://", "type": "ValueError"}), file=sys.stderr)
                sys.exit(1)
        if args.docintel_endpoint:
            os.environ["AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"] = args.docintel_endpoint
        try:
            from markitdown import MarkItDown
        except ImportError:
            print(json.dumps({"error": "markitdown package is not installed. Run: pip install 'markitdown[all]'", "type": "ImportError"}), file=sys.stderr)
            sys.exit(1)
        plugin_kwargs = {}
        if args.plugin_args and args.plugin_args != "{}":
            try:
                plugin_kwargs = json.loads(args.plugin_args)
            except json.JSONDecodeError as e:
                print(json.dumps({"error": f"Invalid plugin-args JSON: {e}", "type": "ValueError"}), file=sys.stderr)
                sys.exit(1)
            if not isinstance(plugin_kwargs, dict):
                print(json.dumps({"error": "plugin-args must be a JSON object", "type": "ValueError"}), file=sys.stderr)
                sys.exit(1)
        converter_kwargs = {}
        if args.enable_plugins:
            converter_kwargs["enable_plugins"] = True
        converter = MarkItDown(**converter_kwargs)
        result = converter.convert(source, **plugin_kwargs)
        markdown_text = result.text_content
        if not markdown_text:
            print(json.dumps({"error": "Conversion produced empty output", "type": "ConversionError"}), file=sys.stderr)
            sys.exit(1)
        images_extracted = 0
        if args.extract_images and args.image_dir:
            markdown_text, images_extracted = extract_images_from_markdown(markdown_text, args.image_dir)
        output_dir = os.path.dirname(os.path.abspath(args.output))
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(markdown_text)
        elapsed_ms = int((time.time() - start_time) * 1000)
        print(json.dumps({"success": True, "images_extracted": images_extracted, "processing_time_ms": elapsed_ms}))
    except Exception as e:
        print(json.dumps({"error": str(e), "type": type(e).__name__}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
`;

const SCRIPTS: Record<string, string> = {
	'check_install.py': CHECK_INSTALL_PY,
	'install_package.py': INSTALL_PACKAGE_PY,
	'markitdown_wrapper.py': MARKITDOWN_WRAPPER_PY,
};

/**
 * Ensure all bundled Python scripts exist in the plugin's python/ directory.
 * Creates them if missing (e.g., after a community plugin install).
 */
export async function ensurePythonScripts(pluginDir: string): Promise<void> {
	const pythonDir = path.join(pluginDir, 'python');
	try {
		await fs.promises.mkdir(pythonDir, { recursive: true });
	} catch {
		// Directory may already exist
	}

	for (const [filename, content] of Object.entries(SCRIPTS)) {
		const filePath = path.join(pythonDir, filename);
		try {
			await fs.promises.access(filePath);
			// File exists — skip
		} catch {
			// File doesn't exist — write it
			await fs.promises.writeFile(filePath, content, 'utf-8');
		}
	}
}
