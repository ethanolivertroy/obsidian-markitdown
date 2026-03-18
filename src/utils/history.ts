import { ConversionLogEntry, MarkitdownSettings } from '../types/settings';

const MAX_HISTORY_ENTRIES = 100;

/**
 * Prepend a history entry to settings.conversionHistory, capping at
 * MAX_HISTORY_ENTRIES to avoid bloating data.json.
 * Returns the updated array (also mutates settings in-place).
 */
export function addHistoryEntry(
	settings: MarkitdownSettings,
	entry: ConversionLogEntry
): ConversionLogEntry[] {
	settings.conversionHistory = [
		entry,
		...settings.conversionHistory,
	].slice(0, MAX_HISTORY_ENTRIES);
	return settings.conversionHistory;
}

/**
 * Format a ConversionLogEntry for display as a single-line summary.
 */
export function formatHistoryEntry(entry: ConversionLogEntry): string {
	const date = new Date(entry.timestamp);
	const ts = date.toLocaleString();
	const status = entry.success ? 'OK' : 'FAIL';
	const inputName = entry.inputFile.split('/').pop()?.split('\\').pop() ?? entry.inputFile;
	let line = `[${ts}] ${status} - ${inputName}`;
	if (entry.processingTimeMs !== undefined) {
		line += ` (${entry.processingTimeMs}ms)`;
	}
	if (!entry.success && entry.error) {
		line += ` - ${entry.error}`;
	}
	return line;
}
