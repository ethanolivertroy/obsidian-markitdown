import { App, Modal, Notice } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';
import type MarkitdownPlugin from '../../main';
import { EXTENSION_GROUPS } from '../utils/fileTypes';
import { getVaultBasePath, resolveOutputFolder, resolveFilenameTemplate } from '../utils/paths';
import { BatchProgressModal } from './BatchProgressModal';

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

			// Filter matching files
			const filesToConvert: File[] = [];
			for (let i = 0; i < folderInput.files.length; i++) {
				const file = folderInput.files[i];
				const ext = path.extname(file.name).toLowerCase();
				if (selectedExtensions.includes(ext)) {
					filesToConvert.push(file);
				}
			}

			if (filesToConvert.length === 0) {
				new Notice('No matching files found in the selected folder');
				return;
			}

			this.close();
			await this.runBatchConversion(filesToConvert);
		});
	}

	private async runBatchConversion(files: File[]) {
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
			const file = files[i];
			progressModal?.updateProgress(i, file.name, success, failed);

			const resolvedName = resolveFilenameTemplate(
				this.plugin.settings.outputFilenameTemplate || '{filename}',
				file.name
			);
			const outputPath = path.join(outputFolder, `${resolvedName}.md`);
			const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
			const tempFilePath = path.join(outputFolder, `tmp_${Date.now()}_${i}_${safeName}`);

			try {
				const buffer = await file.arrayBuffer();
				await fs.promises.writeFile(tempFilePath, Buffer.from(buffer));

				const result = await this.plugin.convertExternalFile(tempFilePath, outputPath);

				if (result.success) {
					success++;
				} else {
					failed++;
					errors.push(`${file.name}: ${result.error}`);
				}
			} catch (error) {
				failed++;
				const msg = error instanceof Error ? error.message : String(error);
				errors.push(`${file.name}: ${msg}`);
			} finally {
				await fs.promises.unlink(tempFilePath).catch(() => {});
			}

			// Update progress after conversion completes so counts are accurate
			progressModal?.updateProgress(i + 1, file.name, success, failed);
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
