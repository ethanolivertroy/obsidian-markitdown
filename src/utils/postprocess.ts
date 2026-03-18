import * as path from 'path';
import { MarkitdownSettings } from '../types/settings';

/**
 * Escape a string value for safe inclusion in YAML.
 * Wraps in double quotes if the value contains characters that could
 * break YAML parsing.
 */
function yamlEscape(value: string): string {
	if (/[:#\[\]{}&*!|>'"`,@%\\]/.test(value) || value.trim() !== value) {
		return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
	}
	return value;
}

/**
 * Build frontmatter fields based on settings and input file.
 */
function buildFrontmatterFields(
	inputPath: string,
	settings: MarkitdownSettings
): Record<string, string | string[]> {
	const fields: Record<string, string | string[]> = {};

	if (settings.enableAutoFrontmatter) {
		const filename = path.basename(inputPath);
		const now = new Date();
		const yyyy = now.getFullYear();
		const mm = String(now.getMonth() + 1).padStart(2, '0');
		const dd = String(now.getDate()).padStart(2, '0');

		fields['source'] = filename;
		fields['converted'] = `${yyyy}-${mm}-${dd}`;
		fields['converter'] = 'markitdown';
	}

	if (settings.autoTags.trim()) {
		const tags = settings.autoTags
			.split(',')
			.map(t => t.trim())
			.filter(t => t.length > 0);
		if (tags.length > 0) {
			fields['tags'] = tags;
		}
	}

	return fields;
}

/**
 * Serialize a record of fields into YAML frontmatter lines (without delimiters).
 */
function serializeFields(fields: Record<string, string | string[]>): string {
	const lines: string[] = [];
	for (const [key, value] of Object.entries(fields)) {
		if (Array.isArray(value)) {
			lines.push(`${key}:`);
			for (const item of value) {
				lines.push(`  - ${yamlEscape(item)}`);
			}
		} else {
			lines.push(`${key}: ${yamlEscape(value)}`);
		}
	}
	return lines.join('\n');
}

/**
 * Parse an existing YAML frontmatter block.
 * Returns the raw YAML body (without delimiters) and the rest of the content.
 * Returns null if no frontmatter is found.
 */
function parseExistingFrontmatter(content: string): {
	yaml: string;
	body: string;
} | null {
	// Frontmatter must start at the very beginning of the file
	if (!content.startsWith('---')) return null;

	// Find the closing delimiter — skip the first line
	const closingIndex = content.indexOf('\n---', 3);
	if (closingIndex === -1) return null;

	const yaml = content.substring(4, closingIndex).trim(); // after "---\n"
	// Body starts after the closing "---" line
	const afterClosing = closingIndex + 4; // skip "\n---"
	const body = content.substring(afterClosing);

	return { yaml, body };
}

/**
 * Merge new fields into existing YAML frontmatter text.
 * Only adds fields that don't already exist (to avoid overwriting user edits).
 */
function mergeIntoYaml(
	existingYaml: string,
	fields: Record<string, string | string[]>
): string {
	const existingKeys = new Set<string>();
	for (const line of existingYaml.split('\n')) {
		const match = line.match(/^(\w[\w-]*)\s*:/);
		if (match) {
			existingKeys.add(match[1]);
		}
	}

	const newFields: Record<string, string | string[]> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (!existingKeys.has(key)) {
			newFields[key] = value;
		}
	}

	if (Object.keys(newFields).length === 0) {
		return existingYaml;
	}

	const additional = serializeFields(newFields);
	return existingYaml + '\n' + additional;
}

/**
 * Apply post-conversion hooks to the converted Markdown content.
 *
 * - Adds/merges YAML frontmatter with source metadata if enabled.
 * - Adds tags to frontmatter if configured.
 *
 * Returns the (possibly modified) content string.
 */
export function applyPostConversionHooks(
	content: string,
	inputPath: string,
	settings: MarkitdownSettings
): string {
	const fields = buildFrontmatterFields(inputPath, settings);

	// Nothing to add
	if (Object.keys(fields).length === 0) {
		return content;
	}

	const existing = parseExistingFrontmatter(content);

	if (existing) {
		// Merge into existing frontmatter
		const merged = mergeIntoYaml(existing.yaml, fields);
		return `---\n${merged}\n---${existing.body}`;
	}

	// Prepend new frontmatter block
	const yaml = serializeFields(fields);
	return `---\n${yaml}\n---\n\n${content}`;
}
