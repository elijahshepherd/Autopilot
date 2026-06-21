/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../../base/browser/dom.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IChatErrorDetailsPart, IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { IChatContentPart } from './chatContentParts.js';

export class ChatAnonymousRateLimitedPart extends Disposable implements IChatContentPart {

	readonly domNode: HTMLElement;

	constructor(
		private readonly content: IChatErrorDetailsPart,
	) {
		super();

		this.domNode = $('.chat-rate-limited-widget');

		const icon = append(this.domNode, $('span'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));

		const messageContainer = append(this.domNode, $('.chat-rate-limited-message'));

		const message = append(messageContainer, $('div'));
		message.textContent = localize('anonymousRateLimited', "Rate limit reached. Please try again shortly.");
	}

	hasSameContent(other: IChatRendererContent): boolean {
		return other.kind === this.content.kind && !!other.errorDetails.isRateLimited;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
