import { 
	App, 
	Editor, 
	MarkdownView, 
	Modal, 
	Notice, 
	Plugin, 
	PluginSettingTab, 
	Setting, 
	TFile, 
	TFolder, 
	normalizePath,
	FileSystemAdapter,
	requestUrl,
	WorkspaceLeaf
} from 'obsidian';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

// Add type for the app with setting property
interface AppWithSetting extends App {
	setting: {
		open: () => void;
		openTabById: (id: string) => void;
	}
}

interface MarkitdownSettings {
	pythonPath: string;
	enablePlugins: boolean;
	docintelEndpoint: string;
	outputPath: string;
}

const DEFAULT_SETTINGS: MarkitdownSettings = {
	pythonPath: 'python',
	enablePlugins: false,
	docintelEndpoint: '',
	outputPath: ''
}

export default class MarkitdownPlugin extends Plugin {
	settings: MarkitdownSettings;
	pythonInstalled: boolean = false;
	markitdownInstalled: boolean = false;

	async onload() {
		await this.loadSettings();

		// Check for Python and Markitdown installation
		await this.checkDependencies();

		// Add ribbon icon
		const ribbonIconEl = this.addRibbonIcon(
			'file-text', 
			'Convert to Markdown with Markitdown', 
			() => {
				new MarkitdownFileModal(this.app, this).open();
			}
		);
		
		// Add command to convert selected file
		this.addCommand({
			id: 'convert-file-markitdown',
			name: 'Convert file to Markdown with Markitdown',
			callback: () => {
				if (!this.markitdownInstalled) {
					new MarkitdownSetupModal(this.app, this).open();
					return;
				}
				new MarkitdownFileModal(this.app, this).open();
			}
		});

		// Add command to convert folder
		this.addCommand({
			id: 'convert-folder-markitdown',
			name: 'Convert folder contents to Markdown with Markitdown',
			callback: () => {
				if (!this.markitdownInstalled) {
					new MarkitdownSetupModal(this.app, this).open();
					return;
				}
				new MarkitdownFolderModal(this.app, this).open();
			}
		});

		
    // Register file menu event handler for context menu
    this.registerEvent(
		this.app.workspace.on('file-menu', (menu, file) => {
			 // Only show for files, not folders
			 if (!(file instanceof TFile)) return;
			 
			 // Get file extension
			 const extension = file.extension.toLowerCase();
			 
			 // List of supported extensions
			 const supportedExtensions = ['pdf', 'docx', 'pptx', 'xlsx', 'xls', 
				  'html', 'htm', 'txt', 'csv', 'json', 'xml', 
				  'jpg', 'jpeg', 'png', 'gif', 'wav', 'mp3', 'zip'];
			 
			 // Only show for supported file types
			 if (!supportedExtensions.includes(extension)) return;
			 
			 menu.addItem((item) => {
				  item
						.setTitle('Convert to Markdown with Markitdown')
						.setIcon('file-text')
						.onClick(async () => {
							 if (!this.markitdownInstalled) {
								  new MarkitdownSetupModal(this.app, this).open();
								  return;
							 }
							 
							 try {
								  // Get vault path
								  let vaultPath = '';
								  if (this.app.vault.adapter instanceof FileSystemAdapter) {
										vaultPath = this.app.vault.adapter.getBasePath();
								  }
								  
								  if (!vaultPath) {
										new Notice('Could not determine vault path. This plugin requires a local vault.');
										return;
								  }
								  
								  // Get file path
								  const filePath = path.join(vaultPath, file.path);
								  
								  // Determine output path
								  let outputFolder = this.settings.outputPath || '';
								  if (!outputFolder) {
										outputFolder = path.join(vaultPath, 'markitdown-output');
										if (!fs.existsSync(outputFolder)) {
											 fs.mkdirSync(outputFolder, { recursive: true });
										}
								  } else {
										outputFolder = path.join(vaultPath, outputFolder);
										if (!fs.existsSync(outputFolder)) {
											 fs.mkdirSync(outputFolder, { recursive: true });
										}
								  }
								  
								  // Create output filename
								  const baseName = path.basename(file.path, path.extname(file.path));
								  const outputPath = path.join(outputFolder, `${baseName}.md`);
								  
								  new Notice('Converting file...');
								  
								  // Convert the file
								  await this.convertFile(filePath, outputPath);
								  
								  // Refresh the vault to see the new file
								  await this.app.vault.adapter.exists(outputPath);
								  
								  new Notice(`File converted and saved to ${outputPath}`);
								  
								  // Try to open the converted file
								  const relativePath = path.relative(vaultPath, outputPath).replace(/\\/g, '/');
								  const existingFile = this.app.vault.getAbstractFileByPath(relativePath);
								  if (existingFile instanceof TFile) {
										this.app.workspace.getLeaf().openFile(existingFile);
								  }
							 } catch (error) {
								  console.error('Error during conversion:', error);
								  new Notice(`Error: ${error.message}`);
							 }
						});
				});
			})
		);

		// Add settings tab
		this.addSettingTab(new MarkitdownSettingTab(this.app, this));
	}

	async checkDependencies() {
		try {
			// Check for Python
			await this.execCommand(`${this.settings.pythonPath} --version`);
			this.pythonInstalled = true;

			// Check for Markitdown
			try {
				await this.execCommand(`${this.settings.pythonPath} -m pip show markitdown`);
				this.markitdownInstalled = true;
			} catch (error) {
				this.markitdownInstalled = false;
			}
		} catch (error) {
			this.pythonInstalled = false;
			this.markitdownInstalled = false;
			console.error("Failed to check Python installation", error);
		}
	}

	async execCommand(command: string): Promise<string> {
		return new Promise((resolve, reject) => {
			exec(command, (error, stdout, stderr) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(stdout);
			});
		});
	}

	async installMarkitdown(): Promise<boolean> {
		try {
			await this.execCommand(`${this.settings.pythonPath} -m pip install 'markitdown[all]'`);
			this.markitdownInstalled = true;
			return true;
		} catch (error) {
			console.error("Failed to install Markitdown", error);
			return false;
		}
	}

	async convertFile(filePath: string, outputPath: string): Promise<string> {
		return new Promise((resolve, reject) => {
			// Build a command that uses the markitdown CLI syntax
			// According to the error message, markitdown just takes a filename as argument
			let command = `markitdown "${filePath}" > "${outputPath}"`;
			
			// Execute as a shell command
			exec(command, (error, stdout, stderr) => {
				if (error) {
					// Try alternative approach with Python module if the first method fails
					const moduleCommand = `${this.settings.pythonPath} -c "from markitdown import convert; convert('${filePath}', output_file='${outputPath}')"`;
					
					exec(moduleCommand, (moduleError, moduleStdout, moduleStderr) => {
						if (moduleError) {
							// One last attempt with just a basic command
							const basicCommand = `${this.settings.pythonPath} -m markitdown "${filePath}" > "${outputPath}"`;
							
							exec(basicCommand, (basicError, basicStdout, basicStderr) => {
								if (basicError) {
									reject(new Error(`Markitdown failed to convert the file: ${basicError.message}\n${basicStderr}`));
									return;
								}
								resolve(basicStdout);
							});
							return;
						}
						resolve(moduleStdout);
					});
					return;
				}
				resolve(stdout);
			});
		});
	}

	onunload() {
		// Nothing special to clean up
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class MarkitdownFileModal extends Modal {
	plugin: MarkitdownPlugin;
	
	constructor(app: App, plugin: MarkitdownPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.addClass('markitdown-modal');
		contentEl.createEl('h2', {text: 'Convert file to markdown'});
		
		if (!this.plugin.markitdownInstalled) {
			contentEl.createEl('p', {
				text: 'Markitdown is not installed. Please install it in the settings tab.'
			});
			
			const buttonEl = contentEl.createEl('button', {
				text: 'Go to settings'
			});
			
			buttonEl.addEventListener('click', () => {
				this.close();
				// Open settings with proper typing
				if ('setting' in this.app) {
					const appWithSetting = this.app as AppWithSetting;
					appWithSetting.setting.open();
					appWithSetting.setting.openTabById('obsidian-markitdown');
				}
			});
			
			return;
		}
		
		// Create file selector
		contentEl.createEl('p', {text: 'Select a file to convert:'});
		
		const fileInputContainer = contentEl.createDiv('markitdown-file-input-container');
		
		const fileInput = fileInputContainer.createEl('input', {
			attr: {
				type: 'file',
				accept: '.pdf,.docx,.pptx,.xlsx,.xls,.html,.htm,.txt,.csv,.json,.xml,.jpg,.jpeg,.png,.gif,.wav,.mp3,.zip'
			}
		});
		
		// Create convert button
		const buttonContainer = contentEl.createDiv('markitdown-button-container');
		
		const convertButton = buttonContainer.createEl('button', {
			text: 'Convert'
		});
		
		convertButton.addEventListener('click', async () => {
			if (fileInput.files && fileInput.files.length > 0) {
				const file = fileInput.files[0];
				
				try {
					// Get vault path if using FileSystemAdapter
					let vaultPath = '';
					if (this.app.vault.adapter instanceof FileSystemAdapter) {
						vaultPath = this.app.vault.adapter.getBasePath();
					}
					
					if (!vaultPath) {
						new Notice('Could not determine vault path. This plugin requires a local vault.');
						return;
					}
					
					// Determine output path
					let outputFolder = this.plugin.settings.outputPath || '';
					if (!outputFolder) {
						outputFolder = path.join(vaultPath, 'markitdown-output');
						if (!fs.existsSync(outputFolder)) {
							fs.mkdirSync(outputFolder, { recursive: true });
						}
					} else {
						outputFolder = path.join(vaultPath, outputFolder);
						if (!fs.existsSync(outputFolder)) {
							fs.mkdirSync(outputFolder, { recursive: true });
						}
					}
					
					// Create output filename
					const baseName = path.basename(file.name, path.extname(file.name));
					const outputPath = path.join(outputFolder, `${baseName}.md`);
					
					new Notice('Converting file...');
					
					// Convert the file - file.path is not available in the DOM File interface
					// Instead we need to create a temporary file
					const tempFilePath = path.join(outputFolder, `${Date.now()}_${file.name}`);
					
					// Write the file to disk first
					const buffer = await file.arrayBuffer();
					fs.writeFileSync(tempFilePath, Buffer.from(buffer));

					// Then convert it
					await this.plugin.convertFile(tempFilePath, outputPath);
					
					// Clean up temp file
					if (fs.existsSync(tempFilePath)) {
						fs.unlinkSync(tempFilePath);
					}
					
					// Refresh the vault to see the new file
					await this.app.vault.adapter.exists(outputPath);
					
					new Notice(`File converted and saved to ${outputPath}`);
					this.close();
					
					// Try to open the converted file
					const relativePath = path.relative(vaultPath, outputPath).replace(/\\/g, '/');
					const existingFile = this.app.vault.getAbstractFileByPath(relativePath);
					if (existingFile instanceof TFile) {
						this.app.workspace.getLeaf().openFile(existingFile);
					}
				} catch (error) {
					console.error('Error during conversion:', error);
					new Notice(`Error: ${error.message}`);
				}
			} else {
				new Notice('Please select a file first');
			}
		});
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class MarkitdownFolderModal extends Modal {
	plugin: MarkitdownPlugin;
	
	constructor(app: App, plugin: MarkitdownPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.addClass('markitdown-modal');
		contentEl.createEl('h2', {text: 'Convert folder contents to markdown'});
		
		if (!this.plugin.markitdownInstalled) {
			contentEl.createEl('p', {
				text: 'Markitdown is not installed. Please install it in the settings tab.'
			});
			
			const buttonEl = contentEl.createEl('button', {
				text: 'Go to settings'
			});
			
			buttonEl.addEventListener('click', () => {
				this.close();
				// Open settings with proper typing
				if ('setting' in this.app) {
					const appWithSetting = this.app as AppWithSetting;
					appWithSetting.setting.open();
					appWithSetting.setting.openTabById('obsidian-markitdown');
				}
			});
			
			return;
		}
		
		// Create folder selector
		contentEl.createEl('p', {text: 'Select a folder to process:'});
		
		const folderInputContainer = contentEl.createDiv('markitdown-file-input-container');
		
		const folderInput = folderInputContainer.createEl('input', {
			attr: {
				type: 'file',
				webkitdirectory: '',
				directory: ''
			}
		});
		
		// File extensions filter
		contentEl.createEl('p', {text: 'Select file types to convert:'});
		
		const extensions = [
			{name: 'PDF files', ext: '.pdf'},
			{name: 'Word documents', ext: '.docx'},
			{name: 'PowerPoint presentations', ext: '.pptx'},
			{name: 'Excel spreadsheets', ext: '.xlsx,.xls'},
			{name: 'Web pages', ext: '.html,.htm'},
			{name: 'Text files', ext: '.txt'},
			{name: 'Data files', ext: '.csv,.json,.xml'},
			{name: 'Images', ext: '.jpg,.jpeg,.png,.gif'},
			{name: 'Audio files', ext: '.wav,.mp3'},
			{name: 'Archives', ext: '.zip'}
		];
		
		const checkboxContainer = contentEl.createDiv('markitdown-checkbox-grid');
		
		const selectedExtensions: string[] = [];
		
		extensions.forEach(ext => {
			const checkboxLabel = checkboxContainer.createEl('label', {cls: 'markitdown-checkbox-label'});
			
			const checkbox = checkboxLabel.createEl('input', {
				attr: {
					type: 'checkbox',
					value: ext.ext
				}
			});
			
			checkbox.addEventListener('change', () => {
				const exts = ext.ext.split(',');
				if (checkbox.checked) {
					exts.forEach(e => {
						if (!selectedExtensions.includes(e)) {
							selectedExtensions.push(e);
						}
					});
				} else {
					exts.forEach(e => {
						const index = selectedExtensions.indexOf(e);
						if (index > -1) {
							selectedExtensions.splice(index, 1);
						}
					});
				}
			});
			
			checkboxLabel.appendText(ext.name);
		});
		
		// Create convert button
		const buttonContainer = contentEl.createDiv('markitdown-button-container');
		
		const convertButton = buttonContainer.createEl('button', {
			text: 'Convert'
		});
		
		convertButton.addEventListener('click', async () => {
			if (folderInput.files && folderInput.files.length > 0) {
				if (selectedExtensions.length === 0) {
					new Notice('Please select at least one file type');
					return;
				}
				
				try {
					// Get vault path if using FileSystemAdapter
					let vaultPath = '';
					if (this.app.vault.adapter instanceof FileSystemAdapter) {
						vaultPath = this.app.vault.adapter.getBasePath();
					}
					
					if (!vaultPath) {
						new Notice('Could not determine vault path. This plugin requires a local vault.');
						return;
					}
					
					// Determine output path
					let outputFolder = this.plugin.settings.outputPath || '';
					if (!outputFolder) {
						outputFolder = path.join(vaultPath, 'markitdown-output');
						if (!fs.existsSync(outputFolder)) {
							fs.mkdirSync(outputFolder, { recursive: true });
						}
					} else {
						outputFolder = path.join(vaultPath, outputFolder);
						if (!fs.existsSync(outputFolder)) {
							fs.mkdirSync(outputFolder, { recursive: true });
						}
					}
					
					// Get files to convert
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
					
					new Notice(`Converting ${filesToConvert.length} files...`);
					this.close();
					
					// Convert each file
					let successCount = 0;
					let failCount = 0;
					
					for (const file of filesToConvert) {
						try {
							// Create output filename
							const baseName = path.basename(file.name, path.extname(file.name));
							const outputPath = path.join(outputFolder, `${baseName}.md`);
							
							// Write the file to disk first since file.path is not available
							const tempFilePath = path.join(outputFolder, `${Date.now()}_${file.name}`);
							const buffer = await file.arrayBuffer();
							fs.writeFileSync(tempFilePath, Buffer.from(buffer));
							
							// Convert the file
							await this.plugin.convertFile(tempFilePath, outputPath);
							
							// Clean up temp file
							if (fs.existsSync(tempFilePath)) {
								fs.unlinkSync(tempFilePath);
							}
							
							successCount++;
						} catch (error) {
							console.error(`Error converting ${file.name}:`, error);
							failCount++;
						}
					}
					
					// Refresh the vault to see the new files
					await this.app.vault.adapter.list(outputFolder);
					
					new Notice(`Conversion complete: ${successCount} successful, ${failCount} failed`);
				} catch (error) {
					console.error('Error during folder conversion:', error);
					new Notice(`Error: ${error.message}`);
				}
			} else {
				new Notice('Please select a folder first');
			}
		});
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class MarkitdownSetupModal extends Modal {
	plugin: MarkitdownPlugin;
	
	constructor(app: App, plugin: MarkitdownPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.addClass('markitdown-modal');
		contentEl.createEl('h2', {text: 'Markitdown Setup'});
		
		if (!this.plugin.pythonInstalled) {
			contentEl.createEl('p', {
				text: 'Python is not installed or not found at the specified path. Please install Python and configure the path in settings.'
			});
			
			const buttonEl = contentEl.createEl('button', {
				text: 'Go to settings'
			});
			
			buttonEl.addEventListener('click', () => {
				this.close();
				// Open settings with proper typing
				if ('setting' in this.app) {
					const appWithSetting = this.app as AppWithSetting;
					appWithSetting.setting.open();
					appWithSetting.setting.openTabById('obsidian-markitdown');
				}
			});
			
			return;
		}
		
		contentEl.createEl('p', {
			text: 'Markitdown is not installed. Would you like to install it now?'
		});
		
		contentEl.createEl('p', {
			text: 'This will install the Markitdown Python package using pip.'
		});
		
		const buttonContainer = contentEl.createDiv('markitdown-button-container');
		
		const cancelButton = buttonContainer.createEl('button', {
			text: 'Cancel'
		});
		
		cancelButton.addEventListener('click', () => {
			this.close();
		});
		
		const installButton = buttonContainer.createEl('button', {
			text: 'Install Markitdown'
		});
		
		installButton.addEventListener('click', async () => {
			installButton.disabled = true;
			installButton.setText('Installing...');
			
			try {
				const success = await this.plugin.installMarkitdown();
				
				if (success) {
					new Notice('Markitdown installed successfully!');
					this.close();
				} else {
					contentEl.createEl('p', {
						text: 'Failed to install Markitdown. Please check the console for errors.'
					});
					installButton.disabled = false;
					installButton.setText('Try Again');
				}
			} catch (error) {
				console.error('Error installing Markitdown:', error);
				contentEl.createEl('p', {
					text: `Error: ${error.message}`
				});
				installButton.disabled = false;
				installButton.setText('Try Again');
			}
		});
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class MarkitdownSettingTab extends PluginSettingTab {
	plugin: MarkitdownPlugin;

	constructor(app: App, plugin: MarkitdownPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Python path')
			.setDesc('Path to python executable (e.g., python, python3, or full path)')
			.addText(text => text
				.setPlaceholder('python')
				.setValue(this.plugin.settings.pythonPath)
				.onChange(async (value) => {
					this.plugin.settings.pythonPath = value;
					await this.plugin.saveSettings();
					this.plugin.checkDependencies();
				}));

		new Setting(containerEl)
			.setName('Enable Markitdown plugins')
			.setDesc('Enable third-party plugins for markitdown')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enablePlugins)
				.onChange(async (value) => {
					this.plugin.settings.enablePlugins = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Azure Document Intelligence endpoint')
			.setDesc('Optional: Use Azure Document Intelligence for better conversion (requires API key setup)')
			.addText(text => text
				.setPlaceholder('https://your-resource.cognitiveservices.azure.com/')
				.setValue(this.plugin.settings.docintelEndpoint)
				.onChange(async (value) => {
					this.plugin.settings.docintelEndpoint = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Output folder')
			.setDesc('Folder path for converted files (relative to vault root, leave empty for default "markitdown-output")')
			.addText(text => text
				.setPlaceholder('markitdown-output')
				.setValue(this.plugin.settings.outputPath)
				.onChange(async (value) => {
					this.plugin.settings.outputPath = value;
					await this.plugin.saveSettings();
				}));

		// Status section
		new Setting(containerEl)
			.setName('Status')
			.setHeading();
		
		const statusContainer = containerEl.createDiv('markitdown-status-container');
		
		// Python status
		const pythonStatus = statusContainer.createDiv('markitdown-status-item');
		
		const pythonIcon = pythonStatus.createSpan();
		pythonIcon.addClass('markitdown-status-icon');
		pythonIcon.addClass(this.plugin.pythonInstalled ? 'success' : 'error');
		pythonIcon.setText(this.plugin.pythonInstalled ? '✓' : '✗');
		
		pythonStatus.createSpan().setText(`Python: ${this.plugin.pythonInstalled ? 'Installed' : 'Not installed'}`);
		
		// Markitdown status
		const markitdownStatus = statusContainer.createDiv('markitdown-status-item');
		
		const markitdownIcon = markitdownStatus.createSpan();
		markitdownIcon.addClass('markitdown-status-icon');
		markitdownIcon.addClass(this.plugin.markitdownInstalled ? 'success' : 'error');
		markitdownIcon.setText(this.plugin.markitdownInstalled ? '✓' : '✗');
		
		markitdownStatus.createSpan().setText(`Markitdown: ${this.plugin.markitdownInstalled ? 'Installed' : 'Not installed'}`);
		
		// Install button if Markitdown is not installed
		if (!this.plugin.markitdownInstalled && this.plugin.pythonInstalled) {
			const installButton = containerEl.createEl('button', {
				text: 'Install Markitdown',
				cls: 'markitdown-install-button'
			});
			
			installButton.addEventListener('click', async () => {
				installButton.disabled = true;
				installButton.setText('Installing...');
				
				try {
					const success = await this.plugin.installMarkitdown();
					
					if (success) {
						new Notice('Markitdown installed successfully!');
						this.display(); // Refresh the settings panel
					} else {
						new Notice('Failed to install Markitdown. Please check the console for errors.');
						installButton.disabled = false;
						installButton.setText('Try Again');
					}
				} catch (error) {
					console.error('Error installing Markitdown:', error);
					new Notice(`Error: ${error.message}`);
					installButton.disabled = false;
					installButton.setText('Try Again');
				}
			});
		}
	}
}