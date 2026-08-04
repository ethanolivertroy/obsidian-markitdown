import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { DependencyStatus, TriedPath } from '../types/settings';

interface PythonResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/** Plugin-local venv directory name (inside the plugin folder). */
export const PLUGIN_VENV_DIR = '.venv';

const PYTHON_MINOR_VERSIONS = ['3.14', '3.13', '3.12', '3.11', '3.10', '3.9'] as const;

/**
 * Build an env object with PATH entries Obsidian (GUI) often lacks, so bare
 * names like `python3` and tools in ~/.local/bin resolve correctly.
 */
export function buildSpawnEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
	const home = process.env.HOME || process.env.USERPROFILE || '';
	const isWin = process.platform === 'win32';
	const sep = isWin ? ';' : ':';

	const prefixes: string[] = [];
	if (!isWin) {
		prefixes.push('/opt/homebrew/bin', '/usr/local/bin');
	}
	if (home) {
		prefixes.push(path.join(home, '.local', 'bin'));
		if (!isWin) {
			prefixes.push(path.join(home, '.pyenv', 'shims'));
		}
	}

	const currentPath = process.env.PATH || '';
	const pathParts = [...prefixes, currentPath].filter(Boolean);
	// Deduplicate while preserving order
	const seen = new Set<string>();
	const deduped = pathParts.filter(p => {
		if (seen.has(p)) return false;
		seen.add(p);
		return true;
	});

	return {
		...process.env,
		PYTHONUTF8: '1',
		PATH: deduped.join(sep),
		...extra,
	};
}

/**
 * Absolute path to the plugin-managed virtualenv Python, if the layout matches.
 */
export function getPluginVenvPython(pluginDir: string): string {
	if (process.platform === 'win32') {
		return path.join(pluginDir, PLUGIN_VENV_DIR, 'Scripts', 'python.exe');
	}
	return path.join(pluginDir, PLUGIN_VENV_DIR, 'bin', 'python');
}

/**
 * True when we should attempt to spawn this candidate.
 * Bare names (PATH lookup) are always tried; absolute paths are skipped if missing
 * to avoid slow ENOENT spawns across dozens of versioned install locations.
 */
export function shouldProbeCandidate(candidate: string): boolean {
	const trimmed = candidate.trim();
	if (!trimmed) return false;
	if (!path.isAbsolute(trimmed)) return true;
	try {
		return fs.existsSync(trimmed);
	} catch {
		return false;
	}
}

/**
 * Build the ordered list of Python executables to probe for markitdown.
 * Always includes platform fallbacks (not only when the setting is `python`/`python3`)
 * so versioned Homebrew installs and pipx venvs are found under Obsidian's limited PATH.
 *
 * @param preferredPaths optional hot paths (e.g. cached last-good interpreter) tried
 *   immediately after the configured path.
 */
export function buildPythonCandidates(
	pythonPath: string,
	pluginDir: string,
	preferredPaths: string[] = []
): string[] {
	const trimmed = pythonPath.trim();
	const pathsToTry: string[] = [];
	if (trimmed) {
		pathsToTry.push(trimmed);
	}

	for (const preferred of preferredPaths) {
		const p = preferred.trim();
		if (p) pathsToTry.push(p);
	}

	// Prefer an existing plugin-managed venv (created by Install Markitdown)
	pathsToTry.push(getPluginVenvPython(pluginDir));

	const home = process.env.HOME || process.env.USERPROFILE || '';
	const isWin = process.platform === 'win32';

	// pipx-managed markitdown (isolated venv; system python3 cannot import it).
	// Probe PIPX_HOME plus legacy (~/.local/pipx) and current platformdirs defaults.
	const pipxHomes: string[] = [];
	if (process.env.PIPX_HOME) {
		pipxHomes.push(process.env.PIPX_HOME);
	}
	if (home) {
		pipxHomes.push(path.join(home, '.local', 'pipx'));
		if (isWin) {
			const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
			pipxHomes.push(path.join(localAppData, 'pipx'));
		} else if (process.platform === 'darwin') {
			pipxHomes.push(path.join(home, 'Library', 'Application Support', 'pipx'));
		} else {
			pipxHomes.push(path.join(home, '.local', 'share', 'pipx'));
		}
	}
	for (const pipxHome of pipxHomes) {
		if (isWin) {
			pathsToTry.push(path.join(pipxHome, 'venvs', 'markitdown', 'Scripts', 'python.exe'));
		} else {
			pathsToTry.push(path.join(pipxHome, 'venvs', 'markitdown', 'bin', 'python'));
		}
	}

	if (isWin) {
		if (trimmed === 'python') pathsToTry.push('python3');
		else if (trimmed === 'python3') pathsToTry.push('python');
		else {
			pathsToTry.push('python', 'python3');
		}

		const localAppData = process.env.LOCALAPPDATA || '';
		if (localAppData) {
			for (const ver of ['314', '313', '312', '311', '310', '39']) {
				pathsToTry.push(`${localAppData}\\Programs\\Python\\Python${ver}\\python.exe`);
			}
			pathsToTry.push(`${localAppData}\\Microsoft\\WindowsApps\\python3.exe`);
		}
	} else {
		// macOS / Linux — bare names plus common absolute locations
		if (trimmed === 'python') pathsToTry.push('python3');
		else if (trimmed === 'python3') pathsToTry.push('python');
		else {
			pathsToTry.push('python3', 'python');
		}

		// Generic Homebrew / system shims
		pathsToTry.push('/opt/homebrew/bin/python3');
		pathsToTry.push('/usr/local/bin/python3');

		// Versioned Homebrew Pythons (markitdown is often installed into one
		// specific minor version, e.g. python3.11, while `python3` points elsewhere)
		for (const ver of PYTHON_MINOR_VERSIONS) {
			pathsToTry.push(`/opt/homebrew/bin/python${ver}`);
			pathsToTry.push(`/usr/local/bin/python${ver}`);
			pathsToTry.push(`/opt/homebrew/opt/python@${ver}/bin/python3`);
			pathsToTry.push(`/usr/local/opt/python@${ver}/bin/python3`);
		}

		// Framework installs (python.org macOS installer)
		for (const ver of PYTHON_MINOR_VERSIONS) {
			pathsToTry.push(`/Library/Frameworks/Python.framework/Versions/${ver}/bin/python3`);
		}

		pathsToTry.push('/usr/bin/python3');
	}

	const seen = new Set<string>();
	return pathsToTry.filter(p => {
		if (!p || seen.has(p)) return false;
		seen.add(p);
		return true;
	});
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
			env: buildSpawnEnv(env),
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
 * the configured path if a fallback with markitdown was found).
 */
export async function checkDependencies(
	pythonPath: string,
	pluginDir: string,
	preferredPaths: string[] = []
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
	const uniquePaths = buildPythonCandidates(trimmed, pluginDir, preferredPaths);

	// Try each candidate; prefer the first one that has markitdown installed.
	// If none has markitdown, fall back to the first working Python.
	let firstWorkingPython: { status: DependencyStatus; resolvedPythonPath: string } | null = null;

	for (const tryPath of uniquePaths) {
		if (!shouldProbeCandidate(tryPath)) {
			triedPaths.push({ path: tryPath, error: 'Path does not exist (skipped)' });
			continue;
		}

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
 * Install a Python package using install_package.py into the plugin-managed venv.
 * Avoids PEP 668 externally-managed-environment errors from Homebrew Python.
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
		const venvDir = path.join(pluginDir, PLUGIN_VENV_DIR);
		const child = spawn(
			pythonPath,
			[scriptPath, '--package', packageSpec, '--venv-dir', venvDir],
			{
				shell: false,
				env: buildSpawnEnv(),
				stdio: ['ignore', 'pipe', 'pipe'],
			}
		);

		let stdoutBuf = '';
		let lastCompleteLine = '';

		child.stdout.on('data', (data: Buffer) => {
			stdoutBuf += data.toString();
			const lines = stdoutBuf.split('\n');
			stdoutBuf = lines.pop() ?? '';
			for (const line of lines) {
				if (line.trim()) {
					lastCompleteLine = line.trim();
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
			const trailing = stdoutBuf.trim();
			if (trailing) {
				lastCompleteLine = trailing;
				onProgress?.(trailing);
			}
			if (code === 0) {
				try {
					const result = JSON.parse(lastCompleteLine);
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
