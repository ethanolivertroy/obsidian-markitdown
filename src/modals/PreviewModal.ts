import { App, Modal } from 'obsidian';

const MAX_PREVIEW_LINES = 500;

export class PreviewModal extends Modal {
	private content: string;
	private outputPath: string;
	private processingTime: number;
	private onSave: () => Promise<void> | void;
	private onCancel: () => Promise<void> | void;

	constructor(
		app: App,
		opts: {
			content: string;
			outputPath: string;
			processingTime: number;
			onSave: () => Promise<void> | void;
			onCancel: () => Promise<void> | void;
		}
	) {
		super(app);
		this.content = opts.content;
		this.outputPath = opts.outputPath;
		this.processingTime = opts.processingTime;
		this.onSave = opts.onSave;
		this.onCancel = opts.onCancel;
	}

	onOpen() {
		const { contentEl, modalEl } = this;
		contentEl.addClass('markitdown-modal');
		contentEl.addClass('markitdown-preview-modal');

		// Force the Obsidian modal container to constrain its height
		modalEl.style.maxHeight = '80vh';
		modalEl.style.display = 'flex';
		modalEl.style.flexDirection = 'column';
		contentEl.style.display = 'flex';
		contentEl.style.flexDirection = 'column';
		contentEl.style.overflow = 'hidden';
		contentEl.style.flex = '1';
		contentEl.style.minHeight = '0';

		contentEl.createEl('h2', { text: 'Conversion preview' });

		// Metadata section
		const metaEl = contentEl.createDiv('markitdown-preview-meta');
		const outputBasename = this.outputPath.split('/').pop() || this.outputPath;
		metaEl.createEl('div', {
			text: `Output: ${outputBasename}`,
			cls: 'markitdown-preview-meta-item',
		});
		metaEl.createEl('div', {
			text: `Processing time: ${(this.processingTime / 1000).toFixed(1)}s`,
			cls: 'markitdown-preview-meta-item',
		});
		metaEl.createEl('div', {
			text: `Content length: ${this.content.length.toLocaleString()} characters`,
			cls: 'markitdown-preview-meta-item',
		});

		// Determine if content should be truncated
		const lines = this.content.split('\n');
		const truncated = lines.length > MAX_PREVIEW_LINES;
		const displayContent = truncated
			? lines.slice(0, MAX_PREVIEW_LINES).join('\n')
			: this.content;

		if (truncated) {
			contentEl.createEl('div', {
				text: `Showing first ${MAX_PREVIEW_LINES} of ${lines.length} lines`,
				cls: 'markitdown-preview-truncation-note',
			});
		}

		// Scrollable preview area — takes remaining space
		const previewContainer = contentEl.createDiv('markitdown-preview-content');
		previewContainer.createEl('pre', { text: displayContent });

		// Buttons — pinned at bottom
		const buttonContainer = contentEl.createDiv('markitdown-button-container');

		const saveBtn = buttonContainer.createEl('button', {
			text: 'Save',
			cls: 'mod-cta',
		});
		saveBtn.addEventListener('click', async () => {
			saveBtn.disabled = true;
			saveBtn.setText('Saving...');
			cancelBtn.disabled = true;
			try {
				await this.onSave();
			} finally {
				this.close();
			}
		});

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', async () => {
			await this.onCancel();
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
