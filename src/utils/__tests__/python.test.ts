import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

// ---- mock child_process.spawn before importing the module under test ----
const spawnMock = jest.fn();
jest.mock('child_process', () => ({
	spawn: spawnMock,
}));

import { checkDependencies, runPythonScript, getPythonScriptPath } from '../python';
import type { DependencyStatus } from '../../types/settings';

// Helper: create a fake ChildProcess that emits events
function fakeChild(
	stdoutData: string,
	stderrData: string,
	exitCode: number,
	shouldError?: Error
): ChildProcess {
	const child = new EventEmitter() as ChildProcess & {
		stdout: EventEmitter;
		stderr: EventEmitter;
	};
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	// @ts-expect-error — minimal stub
	child.stdin = null;

	// Emit data and close on next tick so the caller can attach listeners first
	process.nextTick(() => {
		if (shouldError) {
			child.emit('error', shouldError);
			return;
		}
		if (stdoutData) child.stdout.emit('data', Buffer.from(stdoutData));
		if (stderrData) child.stderr.emit('data', Buffer.from(stderrData));
		child.emit('close', exitCode);
	});

	return child as ChildProcess;
}

// Helper: create stdout JSON that check_install.py would return
function checkOutput(opts: {
	pythonVersion?: string;
	markitdownInstalled?: boolean;
	markitdownVersion?: string | null;
}): string {
	return JSON.stringify({
		python_version: opts.pythonVersion ?? '3.12.0',
		packages: {
			markitdown: {
				installed: opts.markitdownInstalled ?? false,
				version: opts.markitdownVersion ?? null,
			},
		},
	});
}

afterEach(() => {
	jest.restoreAllMocks();
	spawnMock.mockReset();
});

// ---------- getPythonScriptPath ----------
describe('getPythonScriptPath', () => {
	it('joins pluginDir with python/ and the script name', () => {
		const result = getPythonScriptPath('check_install.py', '/home/user/.obsidian/plugins/markitdown');
		expect(result).toMatch(/check_install\.py$/);
		expect(result).toContain('python');
	});
});

// ---------- runPythonScript ----------
describe('runPythonScript', () => {
	it('resolves with stdout, stderr, and exitCode on success', async () => {
		spawnMock.mockReturnValue(fakeChild('hello world', '', 0));

		const result = await runPythonScript('/usr/bin/python3', 'script.py', ['--flag']);

		expect(spawnMock).toHaveBeenCalledWith(
			'/usr/bin/python3',
			['script.py', '--flag'],
			expect.objectContaining({ shell: false }),
		);
		expect(result).toEqual({
			stdout: 'hello world',
			stderr: '',
			exitCode: 0,
		});
	});

	it('rejects when spawn emits an error', async () => {
		spawnMock.mockReturnValue(fakeChild('', '', 1, new Error('ENOENT')));

		await expect(runPythonScript('/bad/path', 'script.py', []))
			.rejects.toThrow('ENOENT');
	});

	it('returns exitCode 1 when close code is null', async () => {
		const child = new EventEmitter() as ChildProcess & {
			stdout: EventEmitter;
			stderr: EventEmitter;
		};
		child.stdout = new EventEmitter();
		child.stderr = new EventEmitter();
		process.nextTick(() => child.emit('close', null));
		spawnMock.mockReturnValue(child);

		const result = await runPythonScript('python', 'script.py', []);
		expect(result.exitCode).toBe(1);
	});
});

// ---------- checkDependencies ----------
describe('checkDependencies', () => {
	const pluginDir = '/plugins/markitdown';

	it('returns empty status immediately for empty path', async () => {
		const { status, resolvedPythonPath } = await checkDependencies('', pluginDir);

		expect(spawnMock).not.toHaveBeenCalled();
		expect(status.pythonInstalled).toBe(false);
		expect(status.markitdownInstalled).toBe(false);
		expect(resolvedPythonPath).toBe('');
	});

	it('returns empty status immediately for whitespace-only path', async () => {
		const { status, resolvedPythonPath } = await checkDependencies('   ', pluginDir);

		expect(spawnMock).not.toHaveBeenCalled();
		expect(status.pythonInstalled).toBe(false);
		expect(resolvedPythonPath).toBe('   ');
	});

	it('returns immediately when the configured Python has markitdown', async () => {
		spawnMock.mockReturnValue(
			fakeChild(
				checkOutput({ markitdownInstalled: true, markitdownVersion: '0.1.0' }),
				'',
				0,
			),
		);

		const { status, resolvedPythonPath } = await checkDependencies('/usr/bin/python3', pluginDir);

		expect(status.pythonInstalled).toBe(true);
		expect(status.markitdownInstalled).toBe(true);
		expect(status.markitdownVersion).toBe('0.1.0');
		expect(resolvedPythonPath).toBe('/usr/bin/python3');
		// Should have spawned only once (no fallback needed)
		expect(spawnMock).toHaveBeenCalledTimes(1);
	});

	it('tries fallback paths when first Python lacks markitdown, prefers one with markitdown', async () => {
		// First call: python found but no markitdown
		// Second call: python3 found with markitdown
		let callCount = 0;
		spawnMock.mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				return fakeChild(
					checkOutput({ markitdownInstalled: false }),
					'',
					0,
				);
			}
			return fakeChild(
				checkOutput({ markitdownInstalled: true, markitdownVersion: '0.2.0' }),
				'',
				0,
			);
		});

		const { status, resolvedPythonPath } = await checkDependencies('python', pluginDir);

		expect(status.markitdownInstalled).toBe(true);
		expect(status.markitdownVersion).toBe('0.2.0');
		// The resolved path should be the second candidate (python3)
		expect(resolvedPythonPath).toBe('python3');
		expect(spawnMock).toHaveBeenCalledTimes(2);
	});

	it('falls back to first working Python when none has markitdown', async () => {
		// All candidates: Python works but no markitdown
		spawnMock.mockImplementation(() => {
			return fakeChild(
				checkOutput({ markitdownInstalled: false, pythonVersion: '3.11.0' }),
				'',
				0,
			);
		});

		const { status, resolvedPythonPath } = await checkDependencies('python', pluginDir);

		expect(status.pythonInstalled).toBe(true);
		expect(status.markitdownInstalled).toBe(false);
		// Resolved to the first candidate that worked
		expect(resolvedPythonPath).toBe('python');
	});

	it('returns default status when all candidates fail', async () => {
		spawnMock.mockImplementation(() => {
			return fakeChild('', '', 0, new Error('ENOENT'));
		});

		const { status, resolvedPythonPath } = await checkDependencies('python', pluginDir);

		expect(status.pythonInstalled).toBe(false);
		expect(status.markitdownInstalled).toBe(false);
		expect(resolvedPythonPath).toBe('python');
	});

	it('deduplicates paths (does not try the same path twice)', async () => {
		// Use a specific absolute path that won't generate fallbacks
		spawnMock.mockReturnValue(
			fakeChild(
				checkOutput({ markitdownInstalled: true, markitdownVersion: '1.0.0' }),
				'',
				0,
			),
		);

		await checkDependencies('/usr/bin/python3', pluginDir);

		// Absolute path doesn't match 'python' or 'python3' so no fallbacks are generated
		expect(spawnMock).toHaveBeenCalledTimes(1);
	});

	it('deduplicates when configured path equals a platform fallback', async () => {
		// Spy on calls to count unique candidates
		const paths: string[] = [];
		spawnMock.mockImplementation((...args: unknown[]) => {
			paths.push(args[0] as string);
			return fakeChild(
				checkOutput({ markitdownInstalled: false }),
				'',
				0,
			);
		});

		await checkDependencies('python3', pluginDir);

		// 'python3' is both the configured path and a common fallback — it should appear only once
		const python3Count = paths.filter(p => p === 'python3').length;
		expect(python3Count).toBe(1);
	});

	describe('platform-specific paths', () => {
		const originalPlatform = process.platform;

		afterEach(() => {
			Object.defineProperty(process, 'platform', { value: originalPlatform });
		});

		it('adds Windows-specific paths when platform is win32', async () => {
			Object.defineProperty(process, 'platform', { value: 'win32' });
			const origEnv = process.env.LOCALAPPDATA;
			process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';

			const paths: string[] = [];
			spawnMock.mockImplementation((...args: unknown[]) => {
				paths.push(args[0] as string);
				return fakeChild('', '', 1, new Error('ENOENT'));
			});

			await checkDependencies('python', pluginDir);

			// Should include Windows-style paths
			expect(paths.some(p => p.includes('Programs\\Python'))).toBe(true);
			expect(paths.some(p => p.includes('WindowsApps'))).toBe(true);

			if (origEnv === undefined) {
				delete process.env.LOCALAPPDATA;
			} else {
				process.env.LOCALAPPDATA = origEnv;
			}
		});

		it('adds macOS/Linux-specific paths when platform is darwin', async () => {
			Object.defineProperty(process, 'platform', { value: 'darwin' });

			const paths: string[] = [];
			spawnMock.mockImplementation((...args: unknown[]) => {
				paths.push(args[0] as string);
				return fakeChild('', '', 1, new Error('ENOENT'));
			});

			await checkDependencies('python', pluginDir);

			// Should include Homebrew and framework paths
			expect(paths).toContain('/opt/homebrew/bin/python3');
			expect(paths).toContain('/usr/local/bin/python3');
			expect(paths.some(p => p.includes('Python.framework'))).toBe(true);
			expect(paths).toContain('/usr/bin/python3');
		});

		it('adds Linux-specific paths when platform is linux', async () => {
			Object.defineProperty(process, 'platform', { value: 'linux' });

			const paths: string[] = [];
			spawnMock.mockImplementation((...args: unknown[]) => {
				paths.push(args[0] as string);
				return fakeChild('', '', 1, new Error('ENOENT'));
			});

			await checkDependencies('python3', pluginDir);

			expect(paths).toContain('/usr/bin/python3');
			expect(paths).toContain('/opt/homebrew/bin/python3');
		});
	});

	it('handles non-zero exit codes by skipping the candidate', async () => {
		let callCount = 0;
		spawnMock.mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				// First candidate returns non-zero exit code
				return fakeChild('', 'error', 1);
			}
			// Second candidate works
			return fakeChild(
				checkOutput({ markitdownInstalled: true, markitdownVersion: '1.0.0' }),
				'',
				0,
			);
		});

		const { status, resolvedPythonPath } = await checkDependencies('python', pluginDir);

		expect(status.markitdownInstalled).toBe(true);
		expect(resolvedPythonPath).toBe('python3');
	});

	it('handles invalid JSON output by skipping the candidate', async () => {
		let callCount = 0;
		spawnMock.mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				return fakeChild('not json', '', 0);
			}
			return fakeChild(
				checkOutput({ markitdownInstalled: true, markitdownVersion: '1.0.0' }),
				'',
				0,
			);
		});

		const { status } = await checkDependencies('python', pluginDir);

		expect(status.markitdownInstalled).toBe(true);
	});
});
