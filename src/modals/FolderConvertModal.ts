import { App, Modal, Notice } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';
import type MarkitdownPlugin from '../../main';
import { EXTENSION_GROUPS } from '../utils/fileTypes';
import { getVaultBasePath, resolveOutputFolder } from '../utils/paths';
import { BatchProgressModal } from './BatchProgressModal';

/**
 * Represents a file to convert, with its path relative to the selected root folder.
 * For files picked via the HTML directory input, `file` is the browser File object and
 * `relativePath` is derived from `webkitRelativePath`. For files discovered via
 * recursive filesystem walk, `absolutePath` is set instead and `file` is null.
 */
interface ConvertibleFile {
	/** Browser File object (present when picked via HTML input) */
	file: File | null;
	/** Absolute path on disk (present when found via recursive walk) */
	absolutePath: string | null;
	/** Display name */
	name: string;
	/** Path relative to the selected root folder (e.g. "sub/dir/file.pdf") */
	relativePath: string;
}

export class FolderConvertModal extends Modal {
	private plugin: MarkitdownPlugin;

	constructor(app: App, plugin: MarkitdownPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('markitdown-modal');
		contentEl.createEl('h2', { text: 'Convert folder contents to Markdown' });

		// Folder picker
		contentEl.createEl('p', { text: 'Select a folder to process:' });
		const folderInputContainer = contentEl.createDiv('markitdown-file-input-container');
		const folderInput = folderInputContainer.createEl('input', {
			attr: { type: 'file', webkitdirectory: '', directory: '' },
		});

		// Recursive toggle
		let includeSubfolders = this.plugin.settings.enableRecursiveConversion;
		const recursiveContainer = contentEl.createDiv('markitdown-setting-row');
		const recursiveLabel = recursiveContainer.createEl('label', {
			cls: 'markitdown-checkbox-label',
		});
		const recursiveCheckbox = recursiveLabel.createEl('input', {
			attr: { type: 'checkbox' },
		});
		recursiveCheckbox.checked = includeSubfolders;
		recursiveCheckbox.addEventListener('change', () => {
			includeSubfolders = recursiveCheckbox.checked;
		});
		recursiveLabel.appendText(' Include subfolders (recursive)');

		// File type checkboxes
		contentEl.createEl('p', { text: 'Select file types to convert:' });
		const checkboxContainer = contentEl.createDiv('markitdown-checkbox-grid');
		const selectedExtensions: string[] = [];

		for (const group of EXTENSION_GROUPS) {
			const label = checkboxContainer.createEl('label', { cls: 'markitdown-checkbox-label' });
			const checkbox = label.createEl('input', {
				attr: { type: 'checkbox', value: group.extensions },
			});

			checkbox.addEventListener('change', () => {
				const exts = group.extensions.split(',');
				if (checkbox.checked) {
					for (const ext of exts) {
						if (!selectedExtensions.includes(ext)) {
							selectedExtensions.push(ext);
						}
					}
				} else {
					for (const ext of exts) {
						const idx = selectedExtensions.indexOf(ext);
						if (idx > -1) selectedExtensions.splice(idx, 1);
					}
				}
			});

			label.appendText(group.name);
		}

		// Convert button
		const buttonContainer = contentEl.createDiv('markitdown-button-container');
		const convertButton = buttonContainer.createEl('button', {
			text: 'Convert',
			cls: 'mod-cta',
		});

		convertButton.addEventListener('click', async () => {
			if (!folderInput.files || folderInput.files.length === 0) {
				new Notice('Please select a folder first');
				return;
			}
			if (selectedExtensions.length === 0) {
				new Notice('Please select at least one file type');
				return;
			}

			// Determine the root folder path from the first file's webkitRelativePath
			const firstFile = folderInput.files[0];
			const rootFolderName = firstFile.webkitRelativePath.split('/')[0];

			// Collect files from the HTML file input (these always include subfolders
			// because webkitdirectory returns all descendants). We filter based on the
			// recursive toggle.
			const filesToConvert: ConvertibleFile[] = [];
			for (let i = 0; i < folderInput.files.length; i++) {
				const file = folderInput.files[i];
				const ext = path.extname(file.name).toLowerCase();
				if (!selectedExtensions.includes(ext)) continue;

				// webkitRelativePath looks like "FolderName/sub/file.pdf"
				const relativePath = file.webkitRelativePath;
				const parts = relativePath.split('/');

				// If not recursive, only include files directly in the root folder
				// (i.e., exactly 2 parts: "FolderName/file.ext")
				if (!includeSubfolders && parts.length > 2) {
					continue;
				}

				// Relative path within the selected folder (strip the root folder name)
				const relativeToRoot = parts.slice(1).join('/');

				filesToConvert.push({
					file,
					absolutePath: null,
					name: file.name,
					relativePath: relativeToRoot,
				});
			}

			if (filesToConvert.length === 0) {
				new Notice('No matching files found in the selected folder');
				return;
			}

			this.close();
			await this.runBatchConversion(filesToConvert);
		});
	}

	private async runBatchConversion(files: ConvertibleFile[]) {
		const vaultPath = getVaultBasePath(this.app);
		if (!vaultPath) {
			new Notice('Could not determine vault path. This plugin requires a local vault.');
			return;
		}

		const outputFolder = resolveOutputFolder(vaultPath, this.plugin.settings.outputPath);

		// Progress modal
		let progressModal: BatchProgressModal | null = null;
		if (this.plugin.settings.enableBatchProgress) {
			progressModal = new BatchProgressModal(this.app, files.length);
			progressModal.open();
		} else {
			new Notice(`Converting ${files.length} files...`);
		}

		let success = 0;
		let failed = 0;
		const errors: string[] = [];

		for (let i = 0; i < files.length; i++) {
			const entry = files[i];
			progressModal?.updateProgress(i, entry.name, success, failed);

			// Determine the output path, preserving subfolder structure
			const baseName = path.basename(entry.name, path.extname(entry.name));
			const relativeDir = path.dirname(entry.relativePath);
			const entryOutputFolder = relativeDir && relativeDir !== '.'
				? path.join(outputFolder, relativeDir)
				: outputFolder;

			// Ensure the output subdirectory exists
			await fs.promises.mkdir(entryOutputFolder, { recursive: true });

			const outputPath = path.join(entryOutputFolder, `${baseName}.md`);
			const safeName = entry.name.replace(/[^a-zA-Z0-9._-]/g, '_');
			const tempFilePath = path.join(entryOutputFolder, `tmp_${Date.now()}_${i}_${safeName}`);

			try {
				// Read the file content from the browser File object
				if (entry.file) {
					const buffer = await entry.file.arrayBuffer();
					await fs.promises.writeFile(tempFilePath, Buffer.from(buffer));
				} else if (entry.absolutePath) {
					await fs.promises.copyFile(entry.absolutePath, tempFilePath);
				}

				const result = await this.plugin.convertExternalFile(tempFilePath, outputPath);

				if (result.success) {
					success++;
				} else {
					failed++;
					errors.push(`${entry.relativePath}: ${result.error}`);
				}
			} catch (error) {
				failed++;
				const msg = error instanceof Error ? error.message : String(error);
				errors.push(`${entry.relativePath}: ${msg}`);
			} finally {
				await fs.promises.unlink(tempFilePath).catch(() => {});
			}

			// Update progress after conversion completes so counts are accurate
			progressModal?.updateProgress(i + 1, entry.name, success, failed);
		}

		if (progressModal) {
			progressModal.complete(success, failed);
		} else {
			let msg = `Conversion complete: ${success} successful, ${failed} failed`;
			if (errors.length > 0 && errors.length <= 3) {
				msg += '\n' + errors.join('\n');
			}
			new Notice(msg);
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
