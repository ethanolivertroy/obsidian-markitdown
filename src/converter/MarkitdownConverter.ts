import * as path from 'path';
import * as fs from 'fs';
import { ConversionOptions, ConversionResult, MarkitdownSettings } from '../types/settings';
import { runPythonScript, getPythonScriptPath } from '../utils/python';
import { SUPPORTED_EXTENSIONS } from '../utils/fileTypes';
import { applyPostConversionHooks } from '../utils/postprocess';

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
				let errorMsg = 'Unknown error';
				try {
					const errJson = JSON.parse(result.stderr);
					// Use the error type/message from Python, but strip absolute paths
					errorMsg = errJson.error || 'Unknown error';
				} catch {
					errorMsg = result.stderr || 'Unknown error';
				}
				// Strip absolute paths from error messages to avoid leaking internal paths
				errorMsg = errorMsg.replace(/(?:\/[\w.-]+)+\//g, '…/');

				return {
					success: false,
					error: `Conversion failed: ${errorMsg}`,
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

			// Apply post-conversion hooks (frontmatter, tags)
			if (options?.postProcess) {
				try {
					const raw = fs.readFileSync(outputPath, 'utf-8');
					const processed = applyPostConversionHooks(
						raw,
						options.postProcess.inputPath,
						options.postProcess.settings
					);
					if (processed !== raw) {
						fs.writeFileSync(outputPath, processed, 'utf-8');
					}
				} catch (hookError: unknown) {
					// Log but don't fail the conversion for a post-processing error
					console.warn('markitdown: post-conversion hook error:', hookError);
				}
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
			const rawMessage = error instanceof Error ? error.message : String(error);
			// Strip absolute paths to avoid leaking internal directory structure
			const message = rawMessage.replace(/(?:\/[\w.-]+)+\//g, '…/');
			return {
				success: false,
				error: `Conversion error: ${message}`,
				processingTime: Date.now() - startTime,
			};
		}
	}
}
