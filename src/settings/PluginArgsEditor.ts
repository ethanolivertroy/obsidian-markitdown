import { PluginArgEntry } from '../types/settings';

/**
 * Renders a dynamic list of key-value pair inputs for configuring
 * third-party Markitdown plugin arguments.
 */
export class PluginArgsEditor {
	constructor(
		private containerEl: HTMLElement,
		private entries: PluginArgEntry[],
		private onChange: (entries: PluginArgEntry[]) => void,
	) {}

	render() {
		this.containerEl.empty();

		for (let i = 0; i < this.entries.length; i++) {
			const row = this.containerEl.createDiv('markitdown-plugin-arg-row');

			const keyInput = row.createEl('input', {
				attr: { type: 'text', placeholder: 'Argument name' },
				cls: 'markitdown-plugin-arg-key',
			});
			keyInput.value = this.entries[i].key;
			keyInput.addEventListener('input', () => {
				this.entries[i].key = keyInput.value;
				this.onChange(this.entries);
			});

			const valueInput = row.createEl('input', {
				attr: { type: 'text', placeholder: 'Value' },
				cls: 'markitdown-plugin-arg-value',
			});
			valueInput.value = this.entries[i].value;
			valueInput.addEventListener('input', () => {
				this.entries[i].value = valueInput.value;
				this.onChange(this.entries);
			});

			const deleteBtn = row.createEl('button', {
				text: '\u00D7',
				cls: 'markitdown-plugin-arg-delete',
				attr: { 'aria-label': 'Remove argument' },
			});
			deleteBtn.addEventListener('click', () => {
				this.entries.splice(i, 1);
				this.onChange(this.entries);
				this.render();
			});
		}

		const addBtn = this.containerEl.createEl('button', {
			text: '+ Add argument',
			cls: 'markitdown-plugin-arg-add',
		});
		addBtn.addEventListener('click', () => {
			this.entries.push({ key: '', value: '' });
			this.onChange(this.entries);
			this.render();
		});
	}
}
