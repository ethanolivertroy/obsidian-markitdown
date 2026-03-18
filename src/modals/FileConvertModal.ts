import { App, Modal, Notice, TFile } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';
import type MarkitdownPlugin from '../../main';
import { FILE_INPUT_ACCEPT } from '../utils/fileTypes';
import { getVaultBasePath, resolveOutputFolder, toVaultRelative } from '../utils/paths';
import { PreviewModal } from './PreviewModal';

export class FileConvertModal extends Modal {
	private plugin: MarkitdownPlugin;

	constructor(app: App, plugin: MarkitdownPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('markitdown-modal');
		contentEl.createEl('h2', { text: 'Convert file to Markdown' });

		contentEl.createEl('p', { text: 'Select a file to convert:' });

		const fileInputContainer = contentEl.createDiv('markitdown-file-input-container');
		const fileInput = fileInputContainer.createEl('input', {
			attr: { type: 'file', accept: FILE_INPUT_ACCEPT },
		});

		const buttonContainer = contentEl.createDiv('markitdown-button-container');
		const convertButton = buttonContainer.createEl('button', {
			text: 'Convert',
			cls: 'mod-cta',
		});

		convertButton.addEventListener('click', async () => {
			if (!fileInput.files || fileInput.files.length === 0) {
				new Notice('Please select a file first');
				return;
			}

			const file = fileInput.files[0];
			convertButton.disabled = true;
			convertButton.setText('Converting...');

			try {
				const vaultPath = getVaultBasePath(this.app);
				if (!vaultPath) {
					new Notice('Could not determine vault path. This plugin requires a local vault.');
					convertButton.disabled = false;
					convertButton.setText('Convert');
					return;
				}

				const outputFolder = resolveOutputFolder(vaultPath, this.plugin.settings.outputPath);
				const baseName = path.basename(file.name, path.extname(file.name));
				const outputPath = path.join(outputFolder, `${baseName}.md`);

				// Write the DOM File to a temp file on disk
				const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
				const tempFilePath = path.join(outputFolder, `tmp_${Date.now()}_${safeName}`);
				const buffer = await file.arrayBuffer();
				await fs.promises.writeFile(tempFilePath, Buffer.from(buffer));

				try {
					const result = await this.plugin.convertExternalFile(tempFilePath, outputPath);

					if (result.success) {
						// Read the converted output for preview
						let content: string;
						try {
							content = await fs.promises.readFile(outputPath, 'utf-8');
						} catch {
							new Notice('Conversion succeeded but could not read output file');
							convertButton.disabled = false;
							convertButton.setText('Convert');
							return;
						}

						this.close();

						new PreviewModal(this.app, {
							content,
							outputPath,
							processingTime: result.processingTime ?? 0,
							onSave: async () => {
								const msg = result.imagesExtracted
									? `Converted successfully (${result.imagesExtracted} images extracted)`
									: 'Converted successfully';
								new Notice(msg);
								await this.plugin.openConvertedFile(outputPath, vaultPath);
							},
							onCancel: async () => {
								// Discard the converted output file
								await fs.promises.unlink(outputPath).catch(() => {});
								new Notice('Conversion discarded');
							},
						}).open();
					} else {
						new Notice(`Conversion failed: ${result.error}`);
						convertButton.disabled = false;
						convertButton.setText('Convert');
					}
				} finally {
					// Clean up temp file
					await fs.promises.unlink(tempFilePath).catch(() => {});
				}
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				new Notice(`Error: ${msg}`);
				convertButton.disabled = false;
				convertButton.setText('Convert');
			}
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
