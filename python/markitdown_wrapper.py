#!/usr/bin/env python3
"""Convert files or URLs to Markdown using Microsoft's Markitdown.

All arguments are passed via argparse — no string interpolation of user input.
This script is called from TypeScript via child_process.spawn() with shell=false.

Usage:
    python markitdown_wrapper.py \
        --input /path/to/file.pdf \
        --output /path/to/output.md \
        [--enable-plugins] \
        [--plugin-args '{"key": "value"}'] \
        [--docintel-endpoint https://...] \
        [--extract-images] \
        [--image-dir /path/to/images/]

    python markitdown_wrapper.py \
        --url https://www.youtube.com/watch?v=... \
        --output /path/to/output.md \
        [--enable-plugins] \
        [--plugin-args '{"key": "value"}']

stdout: JSON {"success": true, "images_extracted": N}
stderr: JSON {"error": "message"} on failure
Exit code: 0 = success, 1 = failure
"""

import argparse
import base64
import json
import os
import re
import sys
import time


def extract_images_from_markdown(markdown_text: str, image_dir: str) -> tuple[str, int]:
    """Scan markdown for base64 data URIs, decode them to files, and rewrite links.

    Returns (updated_markdown, images_extracted_count).
    """
    os.makedirs(image_dir, exist_ok=True)

    count = 0
    image_dir_name = os.path.basename(image_dir)

    # Match base64 data URIs in markdown image syntax: ![alt](data:image/png;base64,...)
    pattern = r'(!\[[^\]]*\])\(data:image/([^;]+);base64,([A-Za-z0-9+/=\s]+)\)'

    def replace_data_uri(match):
        nonlocal count
        next_index = count + 1
        alt_text = match.group(1)
        img_format = match.group(2)
        b64_data = match.group(3).replace("\n", "").replace("\r", "").replace(" ", "")

        # Normalize and sanitize format — only allow known image extensions
        ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "bmp", "tiff", "tif", "webp", "svg", "ico"}
        ext = img_format.lower()
        if ext == "jpeg":
            ext = "jpg"
        elif ext == "svg+xml":
            ext = "svg"
        # Strip anything that isn't alphanumeric to prevent path traversal
        ext = re.sub(r'[^a-z0-9]', '', ext)
        if ext not in ALLOWED_EXTENSIONS:
            ext = "png"  # safe fallback

        filename = f"image_{next_index:03d}.{ext}"
        filepath = os.path.join(image_dir, filename)

        try:
            image_bytes = base64.b64decode(b64_data)
            with open(filepath, "wb") as f:
                f.write(image_bytes)
        except Exception as e:
            # If decoding fails, leave the original data URI
            print(
                json.dumps({"warning": f"Failed to decode image {next_index}: {e}"}),
                file=sys.stderr,
            )
            return match.group(0)

        count = next_index
        return f"{alt_text}(./{image_dir_name}/{filename})"

    updated_markdown = re.sub(pattern, replace_data_uri, markdown_text)
    return updated_markdown, count


def main():
    parser = argparse.ArgumentParser(
        description="Convert files to Markdown using Markitdown"
    )
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument("--input", help="Input file path")
    source_group.add_argument("--url", help="URL to convert (e.g. YouTube URL)")
    parser.add_argument("--output", required=True, help="Output markdown file path")
    parser.add_argument(
        "--enable-plugins",
        action="store_true",
        help="Enable third-party Markitdown plugins",
    )
    parser.add_argument(
        "--plugin-args",
        default="{}",
        help="JSON string of plugin arguments",
    )
    parser.add_argument(
        "--docintel-endpoint",
        help="Azure Document Intelligence endpoint URL",
    )
    parser.add_argument(
        "--extract-images",
        action="store_true",
        help="Extract base64 images to files",
    )
    parser.add_argument(
        "--image-dir",
        help="Directory to save extracted images",
    )
    args = parser.parse_args()

    if args.extract_images and not args.image_dir:
        parser.error("--image-dir is required when --extract-images is specified")

    start_time = time.time()

    try:
        # Determine source: file or URL
        source = args.url if args.url else args.input

        # Validate input file exists and is readable (file mode only)
        if args.input:
            if not os.path.isfile(args.input):
                print(
                    json.dumps(
                        {
                            "error": f"Input file does not exist: {os.path.basename(args.input)}",
                            "type": "FileError",
                        }
                    ),
                    file=sys.stderr,
                )
                sys.exit(1)

            if not os.access(args.input, os.R_OK):
                print(
                    json.dumps(
                        {
                            "error": f"Input file is not readable: {os.path.basename(args.input)}",
                            "type": "FileError",
                        }
                    ),
                    file=sys.stderr,
                )
                sys.exit(1)

        # Validate URL (URL mode only)
        if args.url:
            if not args.url.startswith(("http://", "https://")):
                print(
                    json.dumps(
                        {
                            "error": "URL must start with http:// or https://",
                            "type": "ValueError",
                        }
                    ),
                    file=sys.stderr,
                )
                sys.exit(1)

        # Set Azure endpoint if provided
        if args.docintel_endpoint:
            os.environ["AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"] = args.docintel_endpoint

        # Import markitdown
        try:
            from markitdown import MarkItDown
        except ImportError:
            print(
                json.dumps(
                    {
                        "error": "markitdown package is not installed. Run: pip install 'markitdown[all]'",
                        "type": "ImportError",
                    }
                ),
                file=sys.stderr,
            )
            sys.exit(1)

        # Parse plugin args
        plugin_kwargs = {}
        if args.plugin_args and args.plugin_args != "{}":
            try:
                plugin_kwargs = json.loads(args.plugin_args)
            except json.JSONDecodeError as e:
                print(
                    json.dumps(
                        {
                            "error": f"Invalid plugin-args JSON: {e}",
                            "type": "ValueError",
                        }
                    ),
                    file=sys.stderr,
                )
                sys.exit(1)
            if not isinstance(plugin_kwargs, dict):
                print(
                    json.dumps(
                        {
                            "error": "plugin-args must be a JSON object (key-value map)",
                            "type": "ValueError",
                        }
                    ),
                    file=sys.stderr,
                )
                sys.exit(1)

        # Create converter
        converter_kwargs = {}
        if args.enable_plugins:
            converter_kwargs["enable_plugins"] = True

        converter = MarkItDown(**converter_kwargs)

        # Convert the file or URL
        result = converter.convert(source, **plugin_kwargs)
        markdown_text = result.text_content

        if not markdown_text:
            print(
                json.dumps(
                    {
                        "error": "Conversion produced empty output",
                        "type": "ConversionError",
                    }
                ),
                file=sys.stderr,
            )
            sys.exit(1)

        # Extract images if requested
        images_extracted = 0
        if args.extract_images and args.image_dir:
            markdown_text, images_extracted = extract_images_from_markdown(
                markdown_text, args.image_dir
            )

        # Write output
        output_dir = os.path.dirname(os.path.abspath(args.output))
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(markdown_text)

        elapsed_ms = int((time.time() - start_time) * 1000)
        print(
            json.dumps(
                {
                    "success": True,
                    "images_extracted": images_extracted,
                    "processing_time_ms": elapsed_ms,
                }
            )
        )

    except Exception as e:
        print(
            json.dumps({"error": str(e), "type": type(e).__name__}),
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
