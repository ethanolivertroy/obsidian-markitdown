import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type MarkitdownPlugin from '../../main';
import { PluginArgsEditor } from './PluginArgsEditor';

export class SettingsTab extends PluginSettingTab {
	plugin: MarkitdownPlugin;
	private pythonPathDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(app: App, plugin: MarkitdownPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	hide(): void {
		if (this.pythonPathDebounceTimer) {
			clearTimeout(this.pythonPathDebounceTimer);
			this.pythonPathDebounceTimer = null;
			// Settings were already saved on keystroke; fire the dependency
			// refresh so status is current when the user reopens settings.
			this.plugin.refreshDependencies().catch(console.error);
		}
	}

	private cancelPythonPathDebounce(): void {
		if (this.pythonPathDebounceTimer) {
			clearTimeout(this.pythonPathDebounceTimer);
			this.pythonPathDebounceTimer = null;
		}
	}

	display(): void {
		this.cancelPythonPathDebounce();
		const { containerEl } = this;
		containerEl.empty();

		// ── Python ──────────────────────────────
		new Setting(containerEl)
			.setName('Python')
			.setHeading();

		new Setting(containerEl)
			.setName('Python path')
			.setDesc('Path to Python executable (e.g., python, python3, or a full path like C:\\Python311\\python.exe)')
			.addText(text => text
				.setPlaceholder('python')
				.setValue(this.plugin.settings.pythonPath)
				.onChange(async (value) => {
					this.plugin.settings.pythonPath = value;
					await this.plugin.saveSettings();
					// Debounce: wait for user to stop typing before checking
					if (this.pythonPathDebounceTimer) {
						clearTimeout(this.pythonPathDebounceTimer);
					}
					this.pythonPathDebounceTimer = setTimeout(async () => {
						this.pythonPathDebounceTimer = null;
						await this.plugin.refreshDependencies();
						if (this.containerEl.isConnected) {
							this.display();
						}
					}, 1500);
				}));

		// ── Conversion ──────────────────────────
		new Setting(containerEl)
			.setName('Conversion')
			.setHeading();

		new Setting(containerEl)
			.setName('Output folder')
			.setDesc('Folder for converted files (relative to vault root). Leave empty for "markitdown-output".')
			.addText(text => text
				.setPlaceholder('markitdown-output')
				.setValue(this.plugin.settings.outputPath)
				.onChange(async (value) => {
					this.plugin.settings.outputPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Extract images')
			.setDesc('Extract embedded images from PDFs and save as separate files')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.imageExtractionEnabled)
				.onChange(async (value) => {
					this.plugin.settings.imageExtractionEnabled = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.imageExtractionEnabled) {
			new Setting(containerEl)
				.setName('Image subfolder')
				.setDesc('Subfolder name template for extracted images. Use {filename} as placeholder.')
				.addText(text => text
					.setPlaceholder('{filename}-images')
					.setValue(this.plugin.settings.imageSubfolderTemplate)
					.onChange(async (value) => {
						this.plugin.settings.imageSubfolderTemplate = value || '{filename}-images';
						await this.plugin.saveSettings();
					}));
		}

		new Setting(containerEl)
			.setName('Show batch progress')
			.setDesc('Display a progress bar during batch folder conversions')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableBatchProgress)
				.onChange(async (value) => {
					this.plugin.settings.enableBatchProgress = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Context menu')
			.setDesc('Show "Convert to Markdown" in the file explorer right-click menu (requires restart)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableContextMenu)
				.onChange(async (value) => {
					this.plugin.settings.enableContextMenu = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Drag and drop')
			.setDesc('Convert supported files automatically when dropped into the editor')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDragDrop)
				.onChange(async (value) => {
					this.plugin.settings.enableDragDrop = value;
					await this.plugin.saveSettings();
				}));

		// ── Advanced ─────────────────────────────
		new Setting(containerEl)
			.setName('Advanced')
			.setHeading();

		new Setting(containerEl)
			.setName('Enable Markitdown plugins')
			.setDesc('Enable third-party Markitdown plugins (e.g., markitdown-pdf-separators)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enablePlugins)
				.onChange(async (value) => {
					this.plugin.settings.enablePlugins = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.enablePlugins) {
			const pluginArgsSetting = new Setting(containerEl)
				.setName('Plugin arguments')
				.setDesc('Key-value arguments passed to Markitdown plugins');

			const editorContainer = containerEl.createDiv('markitdown-plugin-args-container');
			const editor = new PluginArgsEditor(
				editorContainer,
				this.plugin.settings.pluginArgs,
				async (entries) => {
					this.plugin.settings.pluginArgs = entries;
					await this.plugin.saveSettings();
				}
			);
			editor.render();
		}

		new Setting(containerEl)
			.setName('Azure Document Intelligence endpoint')
			.setDesc('Optional: Azure endpoint URL for enhanced PDF conversion')
			.addText(text => text
				.setPlaceholder('https://your-resource.cognitiveservices.azure.com/')
				.setValue(this.plugin.settings.docintelEndpoint)
				.onChange(async (value) => {
					this.plugin.settings.docintelEndpoint = value;
					await this.plugin.saveSettings();
				}));

		// ── Status ───────────────────────────────
		new Setting(containerEl)
			.setName('Status')
			.setHeading();

		const statusContainer = containerEl.createDiv('markitdown-status-container');
		const dep = this.plugin.dependencyStatus;

		// Python status
		this.renderStatusItem(
			statusContainer,
			'Python',
			dep.pythonInstalled,
			dep.pythonVersion ? `v${dep.pythonVersion}` : undefined
		);

		// Markitdown status
		this.renderStatusItem(
			statusContainer,
			'Markitdown',
			dep.markitdownInstalled,
			dep.markitdownVersion ? `v${dep.markitdownVersion}` : undefined
		);

		// Install button
		if (!dep.markitdownInstalled && dep.pythonInstalled) {
			const installBtn = containerEl.createEl('button', {
				text: 'Install Markitdown',
				cls: 'markitdown-install-button',
			});

			installBtn.addEventListener('click', async () => {
				installBtn.disabled = true;
				installBtn.setText('Installing...');

				try {
					const success = await this.plugin.installMarkitdown();
					if (success) {
						new Notice('Markitdown installed successfully!');
						await this.plugin.refreshDependencies();
						this.display();
					} else {
						new Notice('Failed to install Markitdown. Check the console for errors.');
						installBtn.disabled = false;
						installBtn.setText('Try again');
					}
				} catch (error) {
					const msg = error instanceof Error ? error.message : String(error);
					new Notice(`Error: ${msg}`);
					installBtn.disabled = false;
					installBtn.setText('Try again');
				}
			});
		}

		// Refresh button
		const refreshBtn = containerEl.createEl('button', {
			text: 'Refresh status',
			cls: 'markitdown-install-button',
		});
		refreshBtn.addEventListener('click', async () => {
			refreshBtn.disabled = true;
			refreshBtn.setText('Checking...');
			await this.plugin.refreshDependencies();
			this.display();
		});
	}

	private renderStatusItem(
		container: HTMLElement,
		label: string,
		installed: boolean,
		version?: string
	) {
		const item = container.createDiv('markitdown-status-item');
		const icon = item.createSpan('markitdown-status-icon');
		icon.addClass(installed ? 'success' : 'error');
		icon.setText(installed ? '\u2713' : '\u2717');

		let text = `${label}: ${installed ? 'Installed' : 'Not installed'}`;
		if (version) text += ` (${version})`;
		item.createSpan().setText(text);
	}
}
