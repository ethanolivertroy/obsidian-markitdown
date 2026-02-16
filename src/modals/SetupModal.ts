import { App, Modal, Notice } from 'obsidian';
import type MarkitdownPlugin from '../../main';

export class SetupModal extends Modal {
	private plugin: MarkitdownPlugin;

	constructor(app: App, plugin: MarkitdownPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('markitdown-modal');
		contentEl.createEl('h2', { text: 'Markitdown setup' });

		if (!this.plugin.dependencyStatus.pythonInstalled) {
			this.showPythonNotFound(contentEl);
			return;
		}

		if (this.plugin.dependencyStatus.markitdownInstalled) {
			this.showAlreadyInstalled(contentEl);
			return;
		}

		this.showInstallPrompt(contentEl);
	}

	private showPythonNotFound(el: HTMLElement) {
		el.createEl('p', {
			text: 'Python is not installed or not found at the configured path.',
		});

		const detailsEl = el.createEl('div', { cls: 'markitdown-setup-details' });
		detailsEl.createEl('p', { text: 'To get started:' });
		const list = detailsEl.createEl('ol');
		list.createEl('li', { text: 'Install Python 3.8+ from python.org' });
		list.createEl('li', { text: 'Set the correct Python path in plugin settings' });
		list.createEl('li', { text: 'Restart Obsidian or re-run this setup' });

		const buttonContainer = el.createDiv('markitdown-button-container');
		const settingsBtn = buttonContainer.createEl('button', { text: 'Open settings' });
		settingsBtn.addEventListener('click', () => {
			this.close();
			// @ts-expect-error — Obsidian internal API for opening settings
			this.app.setting?.open();
			// @ts-expect-error
			this.app.setting?.openTabById(this.plugin.manifest.id);
		});
	}

	private showAlreadyInstalled(el: HTMLElement) {
		const ver = this.plugin.dependencyStatus.markitdownVersion;
		el.createEl('p', {
			text: `Markitdown is installed${ver ? ` (v${ver})` : ''}. You're ready to convert files.`,
		});
		const buttonContainer = el.createDiv('markitdown-button-container');
		const closeBtn = buttonContainer.createEl('button', { text: 'Close' });
		closeBtn.addEventListener('click', () => this.close());
	}

	private showInstallPrompt(el: HTMLElement) {
		el.createEl('p', {
			text: 'Markitdown is not installed. Would you like to install it now?',
		});
		el.createEl('p', {
			text: 'This will install the markitdown Python package using pip.',
			cls: 'setting-item-description',
		});

		// Progress log area
		const logEl = el.createDiv('markitdown-setup-log');
		logEl.style.display = 'none';

		const buttonContainer = el.createDiv('markitdown-button-container');

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const installBtn = buttonContainer.createEl('button', {
			text: 'Install Markitdown',
			cls: 'mod-cta',
		});

		installBtn.addEventListener('click', async () => {
			installBtn.disabled = true;
			installBtn.setText('Installing...');
			cancelBtn.disabled = true;
			logEl.style.display = 'block';
			logEl.empty();

			try {
				const success = await this.plugin.installMarkitdown((line) => {
					const lineEl = logEl.createEl('div', {
						text: line,
						cls: 'markitdown-setup-log-line',
					});
					lineEl.scrollIntoView();
				});

				if (success) {
					new Notice('Markitdown installed successfully!');
					await this.plugin.refreshDependencies();
					this.close();
				} else {
					logEl.createEl('div', {
						text: 'Installation failed. Check the log above for details.',
						cls: 'markitdown-setup-log-error',
					});
					installBtn.disabled = false;
					installBtn.setText('Try again');
					cancelBtn.disabled = false;
				}
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				logEl.createEl('div', {
					text: `Error: ${msg}`,
					cls: 'markitdown-setup-log-error',
				});
				installBtn.disabled = false;
				installBtn.setText('Try again');
				cancelBtn.disabled = false;
			}
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
