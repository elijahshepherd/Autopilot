import * as vscode from 'vscode';
import * as http from 'http';

interface OllamaModelEntry {
	name: string;
	modified_at: string;
	size: number;
	digest: string;
	details?: {
		family: string;
		parameter_size: string;
		quantization_level: string;
		families?: string[];
	};
}

interface OllamaTagsResponse {
	models: OllamaModelEntry[];
}

function httpRequest(method: string, url: string, body?: string, signal?: AbortSignal): Promise<{ statusCode: number; body: string }> {
	return new Promise((resolve, reject) => {
		const urlObj = new URL(url);
		const options: http.RequestOptions = {
			hostname: urlObj.hostname,
			port: urlObj.port,
			path: urlObj.pathname + urlObj.search,
			method,
			headers: body ? { 'Content-Type': 'application/json' } : undefined,
			timeout: 5000,
		};

		const req = http.request(options, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => {
				resolve({
					statusCode: res.statusCode ?? 500,
					body: Buffer.concat(chunks).toString('utf-8'),
				});
			});
		});

		req.on('error', reject);
		req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

		if (signal) {
			signal.addEventListener('abort', () => req.destroy());
		}

		if (body) {
			req.write(body);
		}
		req.end();
	});
}

type Listener<T> = (e: T) => unknown;

export class LocalLanguageModelProvider implements vscode.LanguageModelChatProvider {
	private _listeners: Array<Listener<void>> = [];

	readonly onDidChangeLanguageModelChatInformation: vscode.Event<void> = (listener) => {
		this._listeners.push(listener);
		return { dispose: () => { const i = this._listeners.indexOf(listener); if (i >= 0) this._listeners.splice(i, 1); } };
	};

	private _baseUrl = 'http://localhost:11434';
	private _ollamaAvailable = false;
	private _cachedModels: vscode.LanguageModelChatInformation[] = [];
	private _checkPromise: Promise<void> | undefined;
	private _checkInterval: ReturnType<typeof setInterval> | undefined;

	constructor() {
		void this._checkOllama();
		this._checkInterval = setInterval(() => void this._checkOllama(), 30000);
	}

	dispose(): void {
		if (this._checkInterval) {
			clearInterval(this._checkInterval);
		}
		this._listeners = [];
	}

	private _fireChange(): void {
		for (const cb of this._listeners) {
			cb(undefined);
		}
	}

	private async _checkOllama(): Promise<void> {
		if (this._checkPromise) {
			return this._checkPromise;
		}
		this._checkPromise = this._doCheck().finally(() => {
			this._checkPromise = undefined;
		});
		return this._checkPromise;
	}

	private async _doCheck(): Promise<void> {
		try {
			const res = await httpRequest('GET', `${this._baseUrl}/api/tags`);
			if (res.statusCode !== 200) {
				if (this._ollamaAvailable) {
					this._ollamaAvailable = false;
					this._cachedModels = [];
					this._fireChange();
				}
				return;
			}
			const data: OllamaTagsResponse = JSON.parse(res.body);
			const models = (data.models || []).map(m => this._toModelInfo(m));
			const changed = JSON.stringify(models.map(m => m.id).sort()) !== JSON.stringify(this._cachedModels.map(m => m.id).sort());
			this._cachedModels = models;
			if (!this._ollamaAvailable || changed) {
				this._ollamaAvailable = true;
				this._fireChange();
			}
		} catch {
			if (this._ollamaAvailable) {
				this._ollamaAvailable = false;
				this._cachedModels = [];
				this._fireChange();
			}
		}
	}

	private _toModelInfo(model: OllamaModelEntry): vscode.LanguageModelChatInformation {
		const name = model.name;
		const family = model.details?.family || name.split(':')[0] || 'unknown';
		return {
			id: `local/${name}`,
			name,
			family,
			version: model.digest?.substring(0, 12) || model.modified_at || '1.0',
			maxInputTokens: 32768,
			maxOutputTokens: 4096,
			capabilities: {
				toolCalling: true,
				imageInput: model.details?.families?.includes('vision') ?? false,
			},
			isUserSelectable: true,
		};
	}

	async provideLanguageModelChatInformation(
		_options: vscode.PrepareLanguageModelChatModelOptions,
		_token: vscode.CancellationToken
	): Promise<vscode.LanguageModelChatInformation[]> {
		await this._checkOllama();
		return this._cachedModels;
	}

	async provideLanguageModelChatResponse(
		model: vscode.LanguageModelChatInformation,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		_options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken
	): Promise<void> {
		const ollamaMessages = messages.map(msg => ({
			role: msg.role === 1 ? 'user' : 'assistant',
			content: msg.content.map(part => {
				if (part && typeof part === 'object' && 'value' in part) {
					return (part as vscode.LanguageModelTextPart).value;
				}
				return '';
			}).join(''),
		}));

		const modelId = model.id.startsWith('local/') ? model.id.slice(6) : model.id;

		return new Promise<void>((resolve, reject) => {
			const urlObj = new URL(`${this._baseUrl}/v1/chat/completions`);
			const body = JSON.stringify({
				model: modelId,
				messages: ollamaMessages,
				stream: true,
			});

			const options: http.RequestOptions = {
				hostname: urlObj.hostname,
				port: urlObj.port,
				path: urlObj.pathname,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(body).toString(),
				},
				timeout: 120000,
			};

			const req = http.request(options, (res) => {
				if (res.statusCode && res.statusCode >= 400) {
					const chunks: Buffer[] = [];
					res.on('data', (chunk: Buffer) => chunks.push(chunk));
					res.on('end', () => {
						const errBody = Buffer.concat(chunks).toString('utf-8');
						reject(new Error(`Ollama returned ${res.statusCode}: ${errBody}`));
					});
					return;
				}

				let buffer = '';
				res.setEncoding('utf-8');
				res.on('data', (chunk: string) => {
					if (token.isCancellationRequested) {
						req.destroy();
						return;
					}
					buffer += chunk;
					const parts = buffer.split('\n');
					buffer = parts.pop() || '';
					for (const line of parts) {
						const trimmed = line.trim();
						if (!trimmed || trimmed === 'data: [DONE]') continue;
						if (trimmed.startsWith('data: ')) {
							try {
								const parsed = JSON.parse(trimmed.slice(6));
								const content = parsed?.choices?.[0]?.delta?.content;
								if (content !== undefined && content !== null) {
									progress.report(new vscode.LanguageModelTextPart(content));
								}
							} catch {
								// skip malformed JSON
							}
						}
					}
				});

				res.on('end', () => {
					resolve();
				});

				res.on('error', reject);
			});

			req.on('error', reject);
			req.on('timeout', () => { req.destroy(); reject(new Error('Ollama request timed out')); });

			if (token) {
				token.onCancellationRequested(() => req.destroy());
			}

			req.write(body);
			req.end();
		});
	}

	async provideTokenCount(
		_model: vscode.LanguageModelChatInformation,
		text: string | vscode.LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken
	): Promise<number> {
		const input = typeof text === 'string' ? text : text.content.map(p => {
			if (p && typeof p === 'object' && 'value' in p) {
				return (p as vscode.LanguageModelTextPart).value;
			}
			return '';
		}).join(' ');
		return Math.ceil(input.length / 4);
	}
}
