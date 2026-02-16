import * as path from 'path';
import * as fs from 'fs';
import { ConversionOptions, ConversionResult } from '../types/settings';
import { runPythonScript, getPythonScriptPath } from '../utils/python';
import { SUPPORTED_EXTENSIONS } from '../utils/fileTypes';

export class MarkitdownConverter {
	constructor(
		private pythonPath: string,
		private pluginDir: string
	) {}

	getSupportedExtensions(): string[] {
		return SUPPORTED_EXTENSIONS.map(ext => `.${ext}`);
	}

	canConvert(ext: string): boolean {
		const normalized = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
		return this.getSupportedExtensions().includes(normalized);
	}

	async convert(
		inputPath: string,
		outputPath: string,
		options?: ConversionOptions
	): Promise<ConversionResult> {
		const startTime = Date.now();
		const scriptPath = getPythonScriptPath('markitdown_wrapper.py', this.pluginDir);

		// Build argument array — never string interpolation
		const args: string[] = ['--input', inputPath, '--output', outputPath];

		if (options?.enablePlugins) {
			args.push('--enable-plugins');
		}

		if (options?.pluginArgs && Object.keys(options.pluginArgs).length > 0) {
			args.push('--plugin-args', JSON.stringify(options.pluginArgs));
		}

		if (options?.docintelEndpoint) {
			args.push('--docintel-endpoint', options.docintelEndpoint);
		}

		if (options?.extractImages && options?.imageDir) {
			args.push('--extract-images', '--image-dir', options.imageDir);
		}

		try {
			const result = await runPythonScript(this.pythonPath, scriptPath, args);

			if (result.exitCode !== 0) {
				let errorMsg = result.stderr;
				try {
					const errJson = JSON.parse(result.stderr);
					errorMsg = errJson.error || result.stderr;
				} catch {
					// Use raw stderr
				}

				return {
					success: false,
					error: `Markitdown conversion failed: ${errorMsg}`,
					processingTime: Date.now() - startTime,
				};
			}

			// Verify output file exists
			if (!fs.existsSync(outputPath)) {
				return {
					success: false,
					error: 'Output file was not created',
					processingTime: Date.now() - startTime,
				};
			}

			// Parse success response
			let imagesExtracted = 0;
			try {
				const response = JSON.parse(result.stdout);
				imagesExtracted = response.images_extracted ?? 0;
			} catch {
				// stdout might be empty or non-JSON
			}

			return {
				success: true,
				outputPath,
				processingTime: Date.now() - startTime,
				imagesExtracted,
			};
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				error: `Markitdown conversion error: ${message}`,
				processingTime: Date.now() - startTime,
			};
		}
	}
}
