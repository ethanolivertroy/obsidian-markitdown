import { App, Modal } from 'obsidian';

export class BatchProgressModal extends Modal {
	private progressFill!: HTMLElement;
	private statusEl!: HTMLElement;
	private currentFileEl!: HTMLElement;
	private totalFiles: number;

	constructor(app: App, totalFiles: number) {
		super(app);
		this.totalFiles = totalFiles;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('markitdown-modal');
		contentEl.createEl('h2', { text: 'Converting files' });

		// Progress bar
		const progressBar = contentEl.createDiv('markitdown-progress-bar');
		this.progressFill = progressBar.createDiv('markitdown-progress-fill');
		this.progressFill.style.width = '0%';

		// Status text
		this.statusEl = contentEl.createDiv('markitdown-progress-status');
		this.statusEl.setText(`0 / ${this.totalFiles} files converted`);

		// Current file
		this.currentFileEl = contentEl.createDiv('markitdown-progress-current');
		this.currentFileEl.setText('Preparing...');
	}

	updateProgress(current: number, currentFile: string, success: number, failed: number) {
		const pct = Math.round((current / this.totalFiles) * 100);
		this.progressFill.style.width = `${pct}%`;
		this.statusEl.setText(
			`${current} / ${this.totalFiles} files converted (${success} successful, ${failed} failed)`
		);
		this.currentFileEl.setText(`Converting: ${currentFile}`);
	}

	complete(success: number, failed: number) {
		this.progressFill.style.width = '100%';
		this.statusEl.setText(
			`Conversion complete: ${success} successful, ${failed} failed`
		);
		this.currentFileEl.setText('Done!');
		setTimeout(() => this.close(), 2000);
	}

	onClose() {
		this.contentEl.empty();
	}
}
