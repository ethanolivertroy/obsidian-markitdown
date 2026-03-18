import { spawn } from 'child_process';
import * as path from 'path';
import { DependencyStatus, TriedPath } from '../types/settings';

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
 * Returns the status and the resolved python path (which may differ from
 * the configured path if the python3 fallback was used).
 */
export async function checkDependencies(
	pythonPath: string,
	pluginDir: string
): Promise<{ status: DependencyStatus; resolvedPythonPath: string; triedPaths: TriedPath[] }> {
	const status: DependencyStatus = {
		pythonInstalled: false,
		pythonVersion: null,
		markitdownInstalled: false,
		markitdownVersion: null,
	};

	const triedPaths: TriedPath[] = [];

	// Guard against empty or whitespace-only paths
	const trimmed = pythonPath.trim();
	if (!trimmed) {
		triedPaths.push({ path: pythonPath || '(empty)', error: 'Path is empty or whitespace-only' });
		return { status, resolvedPythonPath: pythonPath, triedPaths };
	}

	const scriptPath = getPythonScriptPath('check_install.py', pluginDir);

	// Build candidate list: configured path first, then platform-specific fallbacks.
	// GUI apps (Obsidian/Electron) often don't inherit the user's shell PATH,
	// so we try well-known Python locations to find one with markitdown installed.
	const pathsToTry = [trimmed];
	if (trimmed === 'python' || trimmed === 'python3') {
		// Generic name — add common platform-specific locations
		const isWin = process.platform === 'win32';
		if (isWin) {
			// Windows: try python, python3, and common install locations
			if (trimmed === 'python') pathsToTry.push('python3');
			const localAppData = process.env.LOCALAPPDATA || '';
			if (localAppData) {
				// Standard Python installer locations
				for (const ver of ['313', '312', '311', '310', '39']) {
					pathsToTry.push(`${localAppData}\\Programs\\Python\\Python${ver}\\python.exe`);
				}
				// Microsoft Store Python
				pathsToTry.push(`${localAppData}\\Microsoft\\WindowsApps\\python3.exe`);
			}
		} else {
			// macOS / Linux: try python3, python, and common framework/brew/system locations
			if (trimmed === 'python') pathsToTry.push('python3');
			else pathsToTry.push('python');
			// Homebrew (Apple Silicon + Intel)
			pathsToTry.push('/opt/homebrew/bin/python3');
			pathsToTry.push('/usr/local/bin/python3');
			// Framework installs (python.org macOS installer)
			for (const ver of ['3.13', '3.12', '3.11', '3.10', '3.9']) {
				pathsToTry.push(`/Library/Frameworks/Python.framework/Versions/${ver}/bin/python3`);
			}
			// Linux common paths
			pathsToTry.push('/usr/bin/python3');
		}
	}

	// Deduplicate while preserving order
	const seen = new Set<string>();
	const uniquePaths = pathsToTry.filter(p => {
		if (seen.has(p)) return false;
		seen.add(p);
		return true;
	});

	// Try each candidate; prefer the first one that has markitdown installed.
	// If none has markitdown, fall back to the first working Python.
	let firstWorkingPython: { status: DependencyStatus; resolvedPythonPath: string } | null = null;

	for (const tryPath of uniquePaths) {
		try {
			const result = await runPythonScript(tryPath, scriptPath, ['--check', 'all']);

			if (result.exitCode === 0 && result.stdout) {
				const data = JSON.parse(result.stdout);
				const depStatus: DependencyStatus = {
					pythonInstalled: true,
					pythonVersion: data.python_version ?? null,
					markitdownInstalled: false,
					markitdownVersion: null,
				};

				if (data.packages?.markitdown) {
					depStatus.markitdownInstalled = data.packages.markitdown.installed;
					depStatus.markitdownVersion = data.packages.markitdown.version ?? null;
				}

				// If this Python has markitdown, use it immediately
				if (depStatus.markitdownInstalled) {
					triedPaths.push({ path: tryPath, error: '' });
					return { status: depStatus, resolvedPythonPath: tryPath, triedPaths };
				}

				// Otherwise, remember the first working Python as a fallback
				triedPaths.push({ path: tryPath, error: 'Python found but markitdown not installed' });
				if (!firstWorkingPython) {
					firstWorkingPython = { status: depStatus, resolvedPythonPath: tryPath };
				}
			} else {
				const detail = result.stderr || `exit code ${result.exitCode}`;
				triedPaths.push({ path: tryPath, error: `Check script failed: ${detail}` });
			}
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			triedPaths.push({ path: tryPath, error: errMsg });
			console.debug(`markitdown: ${tryPath} failed:`, err);
			continue;
		}
	}

	// No Python with markitdown found — return the first working Python (or the default)
	if (firstWorkingPython) {
		return { ...firstWorkingPython, triedPaths };
	}
	return { status, resolvedPythonPath: pythonPath, triedPaths };
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
	if (!pythonPath.trim()) return false;

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
