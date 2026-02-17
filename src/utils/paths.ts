import { App, FileSystemAdapter } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Get the absolute vault base path. Returns null if not a local vault.
 */
export function getVaultBasePath(app: App): string | null {
	if (app.vault.adapter instanceof FileSystemAdapter) {
		return app.vault.adapter.getBasePath();
	}
	return null;
}

/**
 * Resolve the output folder path, creating it if needed.
 */
export function resolveOutputFolder(vaultPath: string, outputSetting: string): string {
	let outputFolder: string;

	if (outputSetting) {
		outputFolder = path.join(vaultPath, outputSetting);
	} else {
		outputFolder = path.join(vaultPath, 'markitdown-output');
	}

	if (!fs.existsSync(outputFolder)) {
		fs.mkdirSync(outputFolder, { recursive: true });
	}

	return outputFolder;
}

/**
 * Compute the image extraction directory for a given output markdown file.
 * Applies the template (e.g., "{filename}-images") to generate the folder name.
 */
export function resolveImageDir(outputMdPath: string, template: string): string {
	const dir = path.dirname(outputMdPath);
	const baseName = path.basename(outputMdPath, '.md');
	// Strip path separators from template to prevent path traversal
	const sanitizedTemplate = template.replace(/[/\\]/g, '-');
	const folderName = sanitizedTemplate.replace('{filename}', baseName);
	return path.join(dir, folderName);
}

/**
 * Given an absolute path and the vault base path, return the vault-relative path.
 * Normalizes separators to forward slashes for Obsidian compatibility.
 */
export function toVaultRelative(absolutePath: string, vaultPath: string): string {
	return path.relative(vaultPath, absolutePath).replace(/\\/g, '/');
}
