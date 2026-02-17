import { spawn } from 'child_process';
import * as path from 'path';
import { DependencyStatus } from '../types/settings';

interface PythonResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/**
 * Execute a Python script using spawn() with argument arrays.
 * NEVER uses exec(). NEVER interpolates user data into shell strings.
 * shell: false (the default) prevents shell interpretation of arguments.
 */
export function runPythonScript(
	pythonPath: string,
	scriptPath: string,
	args: string[],
	env?: Record<string, string>
): Promise<PythonResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(pythonPath, [scriptPath, ...args], {
			shell: false,
			env: {
				...process.env,
				PYTHONUTF8: '1',
				...env,
			},
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (data: Buffer) => {
			stdout += data.toString();
		});

		child.stderr.on('data', (data: Buffer) => {
			stderr += data.toString();
		});

		child.on('error', (err: Error) => {
			reject(err);
		});

		child.on('close', (code: number | null) => {
			resolve({
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				exitCode: code ?? 1,
			});
		});
	});
}

/**
 * Get the absolute path to a bundled Python wrapper script.
 */
export function getPythonScriptPath(scriptName: string, pluginDir: string): string {
	return path.join(pluginDir, 'python', scriptName);
}

/**
 * Check Python installation and package versions using check_install.py.
 */
/**
 * Check Python installation and package versions using check_install.py.
 * Returns the status and the resolved python path (which may differ from
 * the configured path if the python3 fallback was used).
 */
export async function checkDependencies(
	pythonPath: string,
	pluginDir: string
): Promise<{ status: DependencyStatus; resolvedPythonPath: string }> {
	const status: DependencyStatus = {
		pythonInstalled: false,
		pythonVersion: null,
		markitdownInstalled: false,
		markitdownVersion: null,
	};

	const scriptPath = getPythonScriptPath('check_install.py', pluginDir);

	// Try configured path first, then python3 fallback
	const pathsToTry = [pythonPath];
	if (pythonPath === 'python') {
		pathsToTry.push('python3');
	}

	for (const tryPath of pathsToTry) {
		try {
			const result = await runPythonScript(tryPath, scriptPath, ['--check', 'all']);

			if (result.exitCode === 0 && result.stdout) {
				const data = JSON.parse(result.stdout);
				status.pythonInstalled = true;
				status.pythonVersion = data.python_version ?? null;

				if (data.packages?.markitdown) {
					status.markitdownInstalled = data.packages.markitdown.installed;
					status.markitdownVersion = data.packages.markitdown.version ?? null;
				}

				return { status, resolvedPythonPath: tryPath };
			}
		} catch {
			// This path didn't work, try next
			continue;
		}
	}

	return { status, resolvedPythonPath: pythonPath };
}

/**
 * Install a Python package using install_package.py.
 */
export async function installPackage(
	pythonPath: string,
	pluginDir: string,
	packageSpec: string,
	onProgress?: (line: string) => void
): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const scriptPath = getPythonScriptPath('install_package.py', pluginDir);
		const child = spawn(pythonPath, [scriptPath, '--package', packageSpec], {
			shell: false,
			env: {
				...process.env,
				PYTHONUTF8: '1',
			},
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let lastLine = '';

		child.stdout.on('data', (data: Buffer) => {
			const lines = data.toString().split('\n');
			for (const line of lines) {
				if (line.trim()) {
					lastLine = line.trim();
					onProgress?.(line.trim());
				}
			}
		});

		child.stderr.on('data', (data: Buffer) => {
			const lines = data.toString().split('\n');
			for (const line of lines) {
				if (line.trim()) {
					onProgress?.(line.trim());
				}
			}
		});

		child.on('error', (err: Error) => {
			reject(err);
		});

		child.on('close', (code: number | null) => {
			if (code === 0) {
				// Check if the last line is a success JSON
				try {
					const result = JSON.parse(lastLine);
					resolve(result.success === true);
				} catch {
					resolve(true);
				}
			} else {
				resolve(false);
			}
		});
	});
}
