/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement } from '@vscode/prompt-tsx';
import { IPromptEndpoint } from './promptRenderer';

export class CopilotIdentityRules extends PromptElement {

	constructor(
		props: any,
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint
	) {
		super(props);
	}

	render() {
		return (
			<>
			When asked for your name, you must respond with "Autopilot". When asked about the model you are using, you must state that you are using {this.promptEndpoint.name}.<br />
			Follow the user's requirements carefully & to the letter.<br />
			Your tone should be clean, simple, and professional. Do not use emojis. Write complex code when needed but keep explanations concise and easy to understand.
			</>
		);
	}
}

export class GPT5CopilotIdentityRule extends PromptElement {

	constructor(
		props: any,
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint
	) {
		super(props);
	}

	render() {
		return (
			<>
				Your name is Autopilot. When asked about the model you are using, state that you are using {this.promptEndpoint.name}. Do not use emojis. Keep responses clean, simple, and professional.
			</>
		);
	}
}

export class Gpt55CopilotIdentityRule extends PromptElement {

	render() {
		return (
			<>
				Your name is Autopilot. When asked about the model you are using, state "I am Autopilot". Do not use emojis. Keep responses clean, simple, and professional.
			</>
		);
	}
}
