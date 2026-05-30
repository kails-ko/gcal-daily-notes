import { App, Modal, Setting } from 'obsidian';

export class EventNoteModal extends Modal {
	private title: string;
	private onSubmit: (title: string) => void;

	constructor(app: App, defaultTitle: string, onSubmit: (title: string) => void) {
		super(app);
		this.title = defaultTitle;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: 'Create event note', cls: 'gcal-modal-heading' });

		new Setting(contentEl)
			.setName('Note title')
			.addText((text) => {
				text.setValue(this.title).onChange((value) => {
					this.title = value;
				});
				// Select all text so the user can immediately retype
				setTimeout(() => {
					text.inputEl.select();
					text.inputEl.addClass('gcal-modal-input');
				}, 0);

				// Submit on Enter
				text.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						this.submit();
					}
				});
			});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('Create')
					.setCta()
					.onClick(() => this.submit()),
			)
			.addButton((btn) =>
				btn.setButtonText('Cancel').onClick(() => this.close()),
			);
	}

	private submit() {
		const trimmed = this.title.trim();
		if (!trimmed) return;
		this.close();
		this.onSubmit(trimmed);
	}

	onClose() {
		this.contentEl.empty();
	}
}
