export const SUPPORTED_EXTENSIONS = [
	'pdf', 'docx', 'pptx', 'xlsx', 'xls',
	'html', 'htm', 'txt', 'csv', 'json', 'xml',
	'jpg', 'jpeg', 'png', 'gif',
	'wav', 'mp3',
	'zip', 'epub',
];

/** File accept string for HTML file input elements. */
export const FILE_INPUT_ACCEPT = SUPPORTED_EXTENSIONS
	.map(ext => `.${ext}`)
	.join(',');

interface ExtensionGroup {
	name: string;
	extensions: string;
}

/** Extension groups for batch conversion checkbox UI. */
export const EXTENSION_GROUPS: ExtensionGroup[] = [
	{ name: 'PDF files', extensions: '.pdf' },
	{ name: 'Word documents', extensions: '.docx' },
	{ name: 'PowerPoint presentations', extensions: '.pptx' },
	{ name: 'Excel spreadsheets', extensions: '.xlsx,.xls' },
	{ name: 'Web pages', extensions: '.html,.htm' },
	{ name: 'Text files', extensions: '.txt' },
	{ name: 'Data files', extensions: '.csv,.json,.xml' },
	{ name: 'Images', extensions: '.jpg,.jpeg,.png,.gif' },
	{ name: 'Audio files', extensions: '.wav,.mp3' },
	{ name: 'Archives & eBooks', extensions: '.zip,.epub' },
];

export function isConvertible(extension: string): boolean {
	return SUPPORTED_EXTENSIONS.includes(extension.toLowerCase());
}
