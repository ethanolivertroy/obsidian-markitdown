import { Notice, Plugin, TFile } from 'obsidian';
import * as path from 'path';
import {
	MarkitdownSettings,
	DEFAULT_SETTINGS,
	ConversionOptions,
	ConversionResult,
	DependencyStatus,
	PluginArgEntry,
	TriedPath,
} from './src/types/settings';
import { MarkitdownConverter } from './src/converter/MarkitdownConverter';
import { checkDependencies, installPackage } from './src/utils/python';
import {
	getVaultBasePath,
	resolveOutputFolder,
	resolveImageDir,
	toVaultRelative,
} from './src/utils/paths';
import { isConvertible } from './src/utils/fileTypes';
import { SettingsTab } from './src/settings/SettingsTab';
import { FileConvertModal } from './src/modals/FileConvertModal';
import { FolderConvertModal } from './src/modals/FolderConvertModal';
import { SetupModal } from './src/modals/SetupModal';

export default class MarkitdownPlugin extends Plugin {
	settings: MarkitdownSettings = DEFAULT_SETTINGS;
	dependencyStatus: DependencyStatus = {
		pythonInstalled: false,
		pythonVersion: null,
		markitdownInstalled: false,
		markitdownVersion: null,
	};
	converter: MarkitdownConverter = new MarkitdownConverter('python', '.');
	pythonDiscoveryLog: TriedPath[] = [];
	private _resolvedPythonPath = 'python';

	get resolvedPythonPath(): string {
		return this._resolvedPythonPath;
	}

	async onload() {
		await this.loadSettings();

		const pluginDir = this.getPluginDir();
		const depCheck = await checkDependencies(this.settings.pythonPath, pluginDir);
		this.dependencyStatus = depCheck.status;
		this.pythonDiscoveryLog = depCheck.triedPaths;
		// Use the resolved python path (handles python→python3 fallback)
		this._resolvedPythonPath = depCheck.resolvedPythonPath;
		this.converter = new MarkitdownConverter(this._resolvedPythonPath, pluginDir);

		// Ribbon icon
		this.addRibbonIcon('file-text', 'Convert to Markdown', () => {
			this.openConvertModal();
		});

		// Commands
		this.addCommand({
			id: 'convert-file',
			name: 'Convert file to Markdown',
			callback: () => this.openConvertModal(),
		});

		this.addCommand({
			id: 'convert-folder',
			name: 'Convert folder to Markdown',
			callback: () => this.openFolderModal(),
		});

		// Context menu
		if (this.settings.enableContextMenu) {
			this.registerFileMenu();
		}

		// Settings tab
		this.addSettingTab(new SettingsTab(this.app, this));
	}

	onunload() {
		// registerEvent handles cleanup automatically
	}

	/** Open file conversion modal, or setup modal if not installed. */
	private openConvertModal() {
		if (!this.dependencyStatus.markitdownInstalled) {
			new SetupModal(this.app, this).open();
			return;
		}
		new FileConvertModal(this.app, this).open();
	}

	/** Open folder conversion modal, or setup modal if not installed. */
	private openFolderModal() {
		if (!this.dependencyStatus.markitdownInstalled) {
			new SetupModal(this.app, this).open();
			return;
		}
		new FolderConvertModal(this.app, this).open();
	}

	/** Register right-click context menu on supported file types. */
	private registerFileMenu() {
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFile)) return;
				if (!isConvertible(file.extension)) return;

				menu.addItem((item) => {
					item.setTitle('Convert to Markdown')
						.setIcon('file-text')
						.onClick(() => this.convertVaultFile(file));
				});
			})
		);
	}

	/** Convert a file that already exists in the vault (from context menu). */
	async convertVaultFile(file: TFile): Promise<void> {
		const vaultPath = getVaultBasePath(this.app);
		if (!vaultPath) {
			new Notice('Could not determine vault path. This plugin requires a local vault.');
			return;
		}

		if (!this.dependencyStatus.markitdownInstalled) {
			new SetupModal(this.app, this).open();
			return;
		}

		const inputPath = path.join(vaultPath, file.path);
		const outputFolder = resolveOutputFolder(vaultPath, this.settings.outputPath);
		const baseName = file.basename;
		const outputPath = path.join(outputFolder, `${baseName}.md`);
		const options = this.buildConversionOptions(outputPath);

		new Notice('Converting file...');
		const result = await this.converter.convert(inputPath, outputPath, options);

		if (result.success) {
			const msg = result.imagesExtracted
				? `Converted successfully (${result.imagesExtracted} images extracted)`
				: 'Converted successfully';
			new Notice(msg);
			await this.openConvertedFile(outputPath, vaultPath);
		} else {
			new Notice(`Conversion failed: ${result.error}`);
		}
	}

	/**
	 * Convert an external file (from file input dialog, not in vault).
	 * Used by FileConvertModal and FolderConvertModal.
	 */
	async convertExternalFile(
		inputPath: string,
		outputPath: string
	): Promise<ConversionResult> {
		const options = this.buildConversionOptions(outputPath);
		return this.converter.convert(inputPath, outputPath, options);
	}

	/** Build ConversionOptions from current settings. */
	buildConversionOptions(outputPath: string): ConversionOptions {
		const options: ConversionOptions = {
			enablePlugins: this.settings.enablePlugins,
			docintelEndpoint: this.settings.docintelEndpoint || undefined,
		};

		if (this.settings.pluginArgs.length > 0) {
			options.pluginArgs = this.pluginArgsToRecord(this.settings.pluginArgs);
		}

		if (this.settings.imageExtractionEnabled) {
			options.extractImages = true;
			options.imageDir = resolveImageDir(
				outputPath,
				this.settings.imageSubfolderTemplate
			);
		}

		return options;
	}

	/** Convert PluginArgEntry[] to Record for Python. */
	private pluginArgsToRecord(entries: PluginArgEntry[]): Record<string, unknown> {
		const record: Record<string, unknown> = Object.create(null);
		for (const entry of entries) {
			if (!entry.key.trim()) continue;
			// Reject prototype pollution keys
			if (entry.key === '__proto__' || entry.key === 'constructor' || entry.key === 'prototype') continue;
			// Try to parse as JSON value, fall back to string
			try {
				record[entry.key] = JSON.parse(entry.value);
			} catch {
				record[entry.key] = entry.value;
			}
		}
		return record;
	}

	/** Open a converted file in the workspace. */
	async openConvertedFile(outputPath: string, vaultPath: string): Promise<void> {
		const relativePath = toVaultRelative(outputPath, vaultPath);
		const existingFile = this.app.vault.getAbstractFileByPath(relativePath);
		if (existingFile instanceof TFile) {
			await this.app.workspace.getLeaf().openFile(existingFile);
		}
	}

	/** Get the absolute path to the plugin directory. */
	getPluginDir(): string {
		const vaultPath = getVaultBasePath(this.app);
		if (vaultPath && this.manifest.dir) {
			return path.join(vaultPath, this.manifest.dir);
		}
		// Non-local vaults (e.g., Obsidian Sync without local adapter) cannot resolve plugin dir
		console.warn('markitdown: Could not resolve vault base path. Plugin features may not work correctly.');
		return path.resolve(this.manifest.dir ?? '.');
	}

	/** Install markitdown package using the resolved Python path. */
	async installMarkitdown(onProgress?: (line: string) => void): Promise<boolean> {
		const pluginDir = this.getPluginDir();
		const success = await installPackage(
			this._resolvedPythonPath,
			pluginDir,
			'markitdown[all]',
			onProgress
		);
		if (success) {
			this.dependencyStatus.markitdownInstalled = true;
		}
		return success;
	}

	/** Refresh dependency status and resolved Python path. */
	async refreshDependencies(): Promise<void> {
		const pluginDir = this.getPluginDir();
		const depCheck = await checkDependencies(this.settings.pythonPath, pluginDir);
		this.dependencyStatus = depCheck.status;
		this.pythonDiscoveryLog = depCheck.triedPaths;
		this._resolvedPythonPath = depCheck.resolvedPythonPath;
		this.converter = new MarkitdownConverter(this._resolvedPythonPath, pluginDir);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
