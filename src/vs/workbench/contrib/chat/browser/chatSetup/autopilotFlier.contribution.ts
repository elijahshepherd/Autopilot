/*---------------------------------------------------------------------------------------------
 *  Copyright (c) elijahshepherd.
 *  Autopilot: Command palette integration for setting the active Flier.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';

export const AUTOPILOT_FLIER_SETTING_PATH = ['.autopilot', 'flier.json'];

async function writeActiveFlier(name: string | undefined, fileService: IFileService): Promise<void> {
	const cwd = URI.from({ scheme: 'file', path: process.env.VSCODE_CWD ?? process.cwd?.() ?? process.cwd() });
	const target = URI.joinPath(cwd, ...AUTOPILOT_FLIER_SETTING_PATH);
	const json = name ? { id: name } : {};
	await fileService.createFolder(URI.joinPath(cwd, '.autopilot'));
	await fileService.writeFile(target, VSBuffer.fromString(JSON.stringify(json, null, 2)));
}

async function readActiveFlier(): Promise<string | undefined> {
	try {
		const cwd = process.env.VSCODE_CWD ?? process.cwd?.() ?? process.cwd();
		const p = path.join(cwd, ...AUTOPILOT_FLIER_SETTING_PATH);
		if (!fs.existsSync(p)) return undefined;
		const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
		if (typeof (raw as { id?: unknown }).id === 'string') return (raw as { id: string }).id;
	} catch { /* ignore */ }
	return undefined;
}

export class SetAutopilotFlierAction extends Action2 {
	static readonly ID = 'autopilot.setFlier';

	constructor() {
		super({
			id: SetAutopilotFlierAction.ID,
			title: localize2('autopilot.setFlier', "Set Autopilot flier"),
			f1: true,
			category: localize2('autopilot.category', "Autopilot"),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const fileService = accessor.get(IFileService);
		const current = (await readActiveFlier()) ?? '';
		const next = await new Promise<string | undefined>(resolve => {
			const input = quickInputService.createInputBox();
			input.placeholder = localize('autopilot.setFlier.prompt', "Flier id (e.g. 'roblox' or 'none')");
			input.value = current;
			input.onDidAccept(() => {
				const v = input.value.trim();
				resolve(v.length === 0 ? undefined : v);
				input.dispose();
			});
			input.onDidHide(() => resolve(undefined));
			input.show();
		});
		const flier = !next || next.toLowerCase() === 'none' ? undefined : next;
		await writeActiveFlier(flier, fileService);
	}
}

registerAction2(SetAutopilotFlierAction);
