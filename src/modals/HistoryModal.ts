import { App, Modal, Notice } from 'obsidian';
import type MarkitdownPlugin from '../../main';
import { ConversionLogEntry } from '../types/settings';

export class HistoryModal extends Modal {
	private plugin: MarkitdownPlugin;

	constructor(app: App, plugin: MarkitdownPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('markitdown-modal');
		contentEl.createEl('h2', { text: 'Conversion history' });

		const history = this.plugin.settings.conversionHistory;

		if (history.length === 0) {
			contentEl.createEl('p', {
				text: 'No conversions have been recorded yet.',
				cls: 'markitdown-history-empty',
			});
			return;
		}

		const listContainer = contentEl.createDiv('markitdown-history-list');

		for (const entry of history) {
			this.renderEntry(listContainer, entry);
		}

		// Clear history button
		const buttonContainer = contentEl.createDiv('markitdown-button-container');
		const clearButton = buttonContainer.createEl('button', {
			text: 'Clear history',
			cls: 'markitdown-history-clear-btn',
		});
		clearButton.addEventListener('click', async () => {
			this.plugin.settings.conversionHistory = [];
			await this.plugin.saveSettings();
			new Notice('Conversion history cleared');
			this.close();
		});
	}

	private renderEntry(container: HTMLElement, entry: ConversionLogEntry) {
		const entryEl = container.createDiv('markitdown-history-entry');

		// Header row: timestamp + badge
		const headerEl = entryEl.createDiv('markitdown-history-entry-header');

		const timestamp = new Date(entry.timestamp);
		headerEl.createSpan({
			text: timestamp.toLocaleString(),
			cls: 'markitdown-history-timestamp',
		});

		const badgeCls = entry.success
			? 'markitdown-history-badge-success'
			: 'markitdown-history-badge-fail';
		headerEl.createSpan({
			text: entry.success ? 'Success' : 'Failed',
			cls: `markitdown-history-badge ${badgeCls}`,
		});

		// File name (show only basename for privacy)
		const inputName =
			entry.inputFile.split('/').pop()?.split('\\').pop() ?? entry.inputFile;
		entryEl.createDiv({
			text: inputName,
			cls: 'markitdown-history-filename',
		});

		// Details row: processing time, images extracted
		const details: string[] = [];
		if (entry.processingTimeMs !== undefined) {
			details.push(`${entry.processingTimeMs}ms`);
		}
		if (entry.imagesExtracted !== undefined && entry.imagesExtracted > 0) {
			details.push(
				`${entry.imagesExtracted} image${entry.imagesExtracted !== 1 ? 's' : ''} extracted`
			);
		}
		if (details.length > 0) {
			entryEl.createDiv({
				text: details.join(' \u00B7 '),
				cls: 'markitdown-history-details',
			});
		}

		// Error message for failed entries
		if (!entry.success && entry.error) {
			entryEl.createDiv({
				text: entry.error,
				cls: 'markitdown-history-error',
			});
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
