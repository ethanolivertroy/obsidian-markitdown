export interface PluginArgEntry {
	key: string;
	value: string;
}

export interface MarkitdownSettings {
	pythonPath: string;
	enablePlugins: boolean;
	pluginArgs: PluginArgEntry[];
	docintelEndpoint: string;
	outputPath: string;
	imageExtractionEnabled: boolean;
	imageSubfolderTemplate: string;
	enableBatchProgress: boolean;
	enableContextMenu: boolean;
	enableAutoFrontmatter: boolean;
	autoTags: string;
}

export const DEFAULT_SETTINGS: MarkitdownSettings = {
	pythonPath: 'python',
	enablePlugins: false,
	pluginArgs: [],
	docintelEndpoint: '',
	outputPath: '',
	imageExtractionEnabled: false,
	imageSubfolderTemplate: '{filename}-images',
	enableBatchProgress: true,
	enableContextMenu: true,
	enableAutoFrontmatter: false,
	autoTags: '',
};

export interface ConversionOptions {
	enablePlugins?: boolean;
	pluginArgs?: Record<string, unknown>;
	docintelEndpoint?: string;
	extractImages?: boolean;
	imageDir?: string;
	postProcess?: {
		settings: MarkitdownSettings;
		inputPath: string;
	};
}

export interface ConversionResult {
	success: boolean;
	outputPath?: string;
	error?: string;
	processingTime?: number;
	imagesExtracted?: number;
}

export interface DependencyStatus {
	pythonInstalled: boolean;
	pythonVersion: string | null;
	markitdownInstalled: boolean;
	markitdownVersion: string | null;
}
