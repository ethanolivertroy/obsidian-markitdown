import * as path from 'path';
import * as fs from 'fs';
import { resolveOutputFolder, resolveImageDir, toVaultRelative } from '../paths';

// Mock fs to avoid touching the filesystem
jest.mock('fs');

const mockedFs = jest.mocked(fs);

beforeEach(() => {
	mockedFs.existsSync.mockReturnValue(true);
	mockedFs.mkdirSync.mockReturnValue(undefined);
});

afterEach(() => {
	jest.clearAllMocks();
});

// ---------- resolveOutputFolder ----------
describe('resolveOutputFolder', () => {
	it('uses the provided output setting when given', () => {
		const result = resolveOutputFolder('/vault', 'my-output');
		expect(result).toBe(path.resolve('/vault', 'my-output'));
	});

	it('defaults to markitdown-output when output setting is empty', () => {
		const result = resolveOutputFolder('/vault', '');
		expect(result).toBe(path.join('/vault', 'markitdown-output'));
	});

	it('prevents path traversal outside the vault', () => {
		const result = resolveOutputFolder('/vault', '../../outside');
		// Should fall back to default folder inside the vault
		expect(result).toBe(path.join('/vault', 'markitdown-output'));
	});

	it('creates the directory if it does not exist', () => {
		mockedFs.existsSync.mockReturnValue(false);

		resolveOutputFolder('/vault', 'output');

		expect(mockedFs.mkdirSync).toHaveBeenCalledWith(
			expect.any(String),
			{ recursive: true },
		);
	});

	it('does not create the directory if it already exists', () => {
		mockedFs.existsSync.mockReturnValue(true);

		resolveOutputFolder('/vault', 'output');

		expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
	});

	it('allows output folder equal to the vault root', () => {
		const result = resolveOutputFolder('/vault', '.');
		expect(result).toBe(path.resolve('/vault'));
	});
});

// ---------- resolveImageDir ----------
describe('resolveImageDir', () => {
	it('replaces {filename} with the markdown file base name', () => {
		const result = resolveImageDir('/vault/output/report.md', '{filename}-images');
		expect(result).toBe(path.join('/vault/output', 'report-images'));
	});

	it('handles templates without {filename} placeholder', () => {
		const result = resolveImageDir('/vault/output/report.md', 'all-images');
		expect(result).toBe(path.join('/vault/output', 'all-images'));
	});

	it('strips path separators from the template to prevent traversal', () => {
		const result = resolveImageDir('/vault/output/report.md', '../{filename}-images');
		// Path separators replaced with dashes
		expect(result).toBe(path.join('/vault/output', '..-report-images'));
	});

	it('handles backslash separators in template', () => {
		const result = resolveImageDir('/vault/output/report.md', '..\\{filename}-images');
		expect(result).toBe(path.join('/vault/output', '..-report-images'));
	});
});

// ---------- toVaultRelative ----------
describe('toVaultRelative', () => {
	it('returns a vault-relative path with forward slashes', () => {
		const result = toVaultRelative('/vault/subdir/file.md', '/vault');
		expect(result).toBe('subdir/file.md');
	});

	it('returns just the filename for files at vault root', () => {
		const result = toVaultRelative('/vault/file.md', '/vault');
		expect(result).toBe('file.md');
	});

	it('handles deeply nested paths', () => {
		const result = toVaultRelative('/vault/a/b/c/d.md', '/vault');
		expect(result).toBe('a/b/c/d.md');
	});
});
