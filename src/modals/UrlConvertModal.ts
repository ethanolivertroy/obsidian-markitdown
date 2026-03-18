import { App, Modal, Notice } from 'obsidian';
import * as path from 'path';
import type MarkitdownPlugin from '../../main';
import { getVaultBasePath, resolveOutputFolder } from '../utils/paths';

export class UrlConvertModal extends Modal {
	private plugin: MarkitdownPlugin;

	constructor(app: App, plugin: MarkitdownPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('markitdown-modal');
		contentEl.createEl('h2', { text: 'Convert URL to Markdown' });

		contentEl.createEl('p', { text: 'Enter a URL to convert (e.g. YouTube):' });

		const inputContainer = contentEl.createDiv('markitdown-url-input-container');
		const urlInput = inputContainer.createEl('input', {
			attr: { type: 'url', placeholder: 'https://www.youtube.com/watch?v=...' },
		});
		urlInput.style.width = '100%';

		const buttonContainer = contentEl.createDiv('markitdown-button-container');
		const convertButton = buttonContainer.createEl('button', {
			text: 'Convert',
			cls: 'mod-cta',
		});

		convertButton.addEventListener('click', async () => {
			const url = urlInput.value.trim();

			if (!url) {
				new Notice('Please enter a URL');
				return;
			}

			if (!url.startsWith('http://') && !url.startsWith('https://')) {
				new Notice('URL must start with http:// or https://');
				return;
			}

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

				// Derive a filename from the URL
				const baseName = this.deriveFilename(url);
				const outputPath = path.join(outputFolder, `${baseName}.md`);
				const options = this.plugin.buildConversionOptions(outputPath);

				const result = await this.plugin.converter.convertUrl(url, outputPath, options);

				if (result.success) {
					new Notice('URL converted successfully');
					this.close();
					await this.plugin.openConvertedFile(outputPath, vaultPath);
				} else {
					new Notice(`Conversion failed: ${result.error}`);
					convertButton.disabled = false;
					convertButton.setText('Convert');
				}
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				new Notice(`Error: ${msg}`);
				convertButton.disabled = false;
				convertButton.setText('Convert');
			}
		});
	}

	/**
	 * Derive a safe filename from a URL.
	 * For YouTube URLs, extracts the video ID. Otherwise uses the hostname + path.
	 */
	private deriveFilename(url: string): string {
		try {
			const parsed = new URL(url);

			// YouTube: use video ID
			if (
				parsed.hostname === 'www.youtube.com' ||
				parsed.hostname === 'youtube.com' ||
				parsed.hostname === 'm.youtube.com'
			) {
				const videoId = parsed.searchParams.get('v');
				if (videoId) {
					return `youtube-${videoId}`;
				}
			}
			if (parsed.hostname === 'youtu.be') {
				const videoId = parsed.pathname.slice(1);
				if (videoId) {
					return `youtube-${videoId}`;
				}
			}

			// Generic: hostname + sanitized path
			const safePart = `${parsed.hostname}${parsed.pathname}`
				.replace(/[^a-zA-Z0-9._-]/g, '_')
				.replace(/_+/g, '_')
				.replace(/^_|_$/g, '');
			return safePart || 'url-conversion';
		} catch {
			return `url-${Date.now()}`;
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
