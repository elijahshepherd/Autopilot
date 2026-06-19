import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Shared helpers ──────────────────────────────────────────────

function httpJson<T>(method: string, url: string, headers: Record<string, string>, body?: string, timeout = 5000): Promise<{ statusCode: number; body: string; json: T | null }> {
	return new Promise((resolve, reject) => {
		const urlObj = new URL(url);
		const options: http.RequestOptions = {
			hostname: urlObj.hostname,
			port: urlObj.port,
			path: urlObj.pathname + urlObj.search,
			method,
			headers,
			timeout,
		};
		const req = http.request(options, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => {
				const bodyStr = Buffer.concat(chunks).toString('utf-8');
				let parsed: T | null = null;
				try { parsed = JSON.parse(bodyStr); } catch { /* not JSON */ }
				resolve({ statusCode: res.statusCode ?? 500, body: bodyStr, json: parsed });
			});
		});
		req.on('error', reject);
		req.on('timeout', () => { req.destroy(); reject(new Error(`Request timeout: ${url}`)); });
		if (body) req.write(body);
		req.end();
	});
}

function extractMessages(messages: readonly vscode.LanguageModelChatRequestMessage[]): Array<{ role: string; content: string }> {
	return messages.map(msg => ({
		role: msg.role === 1 ? 'user' : msg.role === 2 ? 'assistant' : 'user',
		content: msg.content.map(p => (p && typeof p === 'object' && 'value' in p) ? (p as vscode.LanguageModelTextPart).value : '').join(''),
	}));
}

/** Strip the local/{source}/ prefix to get the raw model name the API expects. */
function chatModelId(model: vscode.LanguageModelChatInformation): string {
	const parts: string[] = model.id.split('/');
	if (parts.length >= 3 && parts[0] === 'local') {
		return parts.slice(2).join('/');
	}
	if (parts.length >= 2) return parts.slice(1).join('/');
	return model.id;
}

function makeModelInfo(id: string, name: string, family: string, version: string, opts: { maxInputTokens?: number; maxOutputTokens?: number; vision?: boolean } = {}): vscode.LanguageModelChatInformation {
	return {
		id, name, family, version,
		maxInputTokens: opts.maxInputTokens ?? 128000,
		maxOutputTokens: opts.maxOutputTokens ?? 4096,
		capabilities: { toolCalling: true, imageInput: opts.vision ?? false },
		isUserSelectable: true,
	};
}

/** Read providers.json config from the user's home directory. */
interface ProviderConfig {
	name: string;
	type: 'openai';
	baseUrl: string;
	apiKey: string;
	apiType?: 'chat-completions' | 'responses';
	models?: Array<{ id: string; name?: string; maxInputTokens?: number; maxOutputTokens?: number; vision?: boolean }>;
}

interface AutopilotConfig {
	providers?: ProviderConfig[];
}

function readProvidersJson(): ProviderConfig[] {
	const candidates = [
		path.join(os.homedir(), '.autopilot', 'providers.json'),
		path.join(os.homedir(), '.config', 'autopilot', 'providers.json'),
	];
	for (const p of candidates) {
		try {
			if (fs.existsSync(p)) {
				const raw = fs.readFileSync(p, 'utf-8');
				const parsed: AutopilotConfig = JSON.parse(raw);
				return parsed.providers || [];
			}
		} catch { /* ignore parse errors */ }
	}
	return [];
}

// ── Source: Ollama ──────────────────────────────────────────────

interface OllamaModelEntry { name: string; modified_at: string; size: number; digest: string; details?: { family: string; parameter_size: string; quantization_level: string; families?: string[] }; }
interface OllamaTagsResponse { models: OllamaModelEntry[]; }

async function checkOllamaModels(): Promise<vscode.LanguageModelChatInformation[]> {
	try {
		const res = await httpJson('GET', 'http://localhost:11434/api/tags', {}, undefined, 2000);
		if (res.statusCode !== 200 || !res.json) return [];
		const data = res.json as OllamaTagsResponse;
		return (data.models || []).map(m => {
			const family = m.details?.family || m.name.split(':')[0] || 'unknown';
			return makeModelInfo(
				`local/ollama/${m.name}`, m.name, family,
				m.digest?.substring(0, 12) || m.modified_at || '1.0',
				{ vision: m.details?.families?.includes('vision') ?? false },
			);
		});
	} catch { return []; }
}

async function ollamaChatResponse(modelId: string, messages: Array<{ role: string; content: string }>, progress: vscode.Progress<vscode.LanguageModelResponsePart>, token: vscode.CancellationToken): Promise<void> {
	const urlObj = new URL('http://localhost:11434/v1/chat/completions');
	const body = JSON.stringify({ model: modelId, messages, stream: true });
	return streamOpenAI(urlObj, { 'Content-Type': 'application/json' }, body, progress, token);
}

// ── Source: OpenAI-compatible (env vars / providers.json / custom) ────────

interface OpenAIModelEntry { id: string; created?: number; owned_by?: string; }
interface OpenAIModelsResponse { data?: OpenAIModelEntry[]; }

async function checkOpenAIModels(baseUrl: string, apiKey: string): Promise<vscode.LanguageModelChatInformation[]> {
	try {
		const res = await httpJson('GET', `${baseUrl}/models`, { 'Authorization': `Bearer ${apiKey}` }, undefined, 5000);
		if (res.statusCode !== 200 || !res.json) return [];
		const data = res.json as OpenAIModelsResponse;
		return (data.data || []).map(m => makeModelInfo(
			`local/openai/${m.id}`, m.id, m.id.split('-')[0] || 'openai',
			String(m.created ?? Date.now()),
		));
	} catch { return []; }
}

async function openAIChatResponse(baseUrl: string, apiKey: string, modelId: string, messages: Array<{ role: string; content: string }>, progress: vscode.Progress<vscode.LanguageModelResponsePart>, token: vscode.CancellationToken): Promise<void> {
	const urlObj = new URL(`${baseUrl}/chat/completions`);
	const body = JSON.stringify({ model: modelId, messages, stream: true });
	return streamOpenAI(urlObj, { 'Authorization': `Bearer ${apiKey}` }, body, progress, token);
}

// ── Source: Anthropic (env vars / providers.json) ───────────────

async function checkAnthropicModels(baseUrl: string, apiKey: string): Promise<vscode.LanguageModelChatInformation[]> {
	try {
		const res = await httpJson('GET', `${baseUrl}/models`, { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, undefined, 5000);
		if (res.statusCode !== 200 || !res.json) return [];
		const data = res.json as { data?: Array<{ type: string; id: string; display_name?: string; created_at?: string }> };
		return (data.data || []).filter(m => m.type === 'model').map(m => makeModelInfo(
			`local/anthropic/${m.id}`, m.display_name || m.id, 'claude',
			m.created_at || '1.0', { vision: true },
		));
	} catch { return []; }
}

async function anthropicChatResponse(baseUrl: string, apiKey: string, modelId: string, messages: Array<{ role: string; content: string }>, progress: vscode.Progress<vscode.LanguageModelResponsePart>, token: vscode.CancellationToken): Promise<void> {
	const urlObj = new URL(`${baseUrl}/messages`);
	const body = JSON.stringify({
		model: modelId,
		max_tokens: 4096,
		messages,
		stream: true,
	});
	return streamAnthropic(urlObj, { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, body, progress, token);
}

// ── Source: Custom OpenAI-compatible (from providers.json) ─────

async function checkCustomModels(provider: ProviderConfig): Promise<vscode.LanguageModelChatInformation[]> {
	if (provider.models && provider.models.length > 0) {
		// Use statically configured models
		return provider.models.map(m => makeModelInfo(
			`local/custom/${m.id}`,
			m.name || m.id,
			m.id.split('-')[0] || provider.name,
			'1.0',
			{ maxInputTokens: m.maxInputTokens, maxOutputTokens: m.maxOutputTokens, vision: m.vision },
		));
	}
	// Otherwise try to discover from API
	try {
		const res = await httpJson('GET', `${provider.baseUrl}/models`, { 'Authorization': `Bearer ${provider.apiKey}` }, undefined, 5000);
		if (res.statusCode !== 200 || !res.json) return [];
		const data = res.json as OpenAIModelsResponse;
		return (data.data || []).map(m => makeModelInfo(
			`local/custom/${m.id}`, m.id, m.id.split('-')[0] || provider.name,
			String(m.created ?? Date.now()),
		));
	} catch { return []; }
}

async function customChatResponse(provider: ProviderConfig, modelId: string, messages: Array<{ role: string; content: string }>, progress: vscode.Progress<vscode.LanguageModelResponsePart>, token: vscode.CancellationToken): Promise<void> {
	if (provider.type === 'anthropic' || provider.apiType === 'messages') {
		return anthropicChatResponse(provider.baseUrl, provider.apiKey, modelId, messages, progress, token);
	}
	// Default: OpenAI-compatible (covers NVIDIA, custom endpoints, OpenAI itself)
	const urlObj = new URL(`${provider.baseUrl}/chat/completions`);
	const body = JSON.stringify({ model: modelId, messages, stream: true });
	return streamOpenAI(urlObj, { 'Authorization': `Bearer ${provider.apiKey}` }, body, progress, token);
}

// ── Streaming helpers ───────────────────────────────────────────

function streamOpenAI(urlObj: URL, headers: Record<string, string>, body: string, progress: vscode.Progress<vscode.LanguageModelResponsePart>, token: vscode.CancellationToken): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const allHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
		const options: http.RequestOptions = {
			hostname: urlObj.hostname, port: urlObj.port, path: urlObj.pathname,
			method: 'POST', headers: { ...allHeaders, 'Content-Length': Buffer.byteLength(body).toString() }, timeout: 120000,
		};
		const req = http.request(options, (res) => {
			if (res.statusCode && res.statusCode >= 400) {
				const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c));
				res.on('end', () => {
					const errBody = Buffer.concat(chunks).toString('utf-8');
					reject(new Error(`${urlObj.hostname} returned ${res.statusCode}: ${errBody.slice(0, 500)}`));
				});
				return;
			}
			let buffer = ''; res.setEncoding('utf-8');
			res.on('data', (chunk: string) => {
				if (token.isCancellationRequested) { req.destroy(); return; }
				buffer += chunk;
				const parts = buffer.split('\n'); buffer = parts.pop() || '';
				for (const line of parts) {
					const t = line.trim();
					if (!t || t === 'data: [DONE]') continue;
					if (t.startsWith('data: ')) {
						try {
							const parsed = JSON.parse(t.slice(6));
							const content = parsed?.choices?.[0]?.delta?.content;
							if (content) progress.report(new vscode.LanguageModelTextPart(content));
						} catch { /* skip malformed */ }
					}
				}
			});
			res.on('end', resolve);
			res.on('error', reject);
		});
		req.on('error', reject);
		req.on('timeout', () => { req.destroy(); reject(new Error(`Request to ${urlObj.hostname} timed out`)); });
		if (token) token.onCancellationRequested(() => req.destroy());
		req.write(body); req.end();
	});
}

function streamAnthropic(urlObj: URL, headers: Record<string, string>, body: string, progress: vscode.Progress<vscode.LanguageModelResponsePart>, token: vscode.CancellationToken): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const allHeaders: Record<string, string> = { ...headers };
		const options: http.RequestOptions = {
			hostname: urlObj.hostname, port: urlObj.port, path: urlObj.pathname,
			method: 'POST', headers: { ...allHeaders, 'Content-Length': Buffer.byteLength(body).toString() }, timeout: 120000,
		};
		const req = http.request(options, (res) => {
			if (res.statusCode && res.statusCode >= 400) {
				const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c));
				res.on('end', () => {
					const errBody = Buffer.concat(chunks).toString('utf-8');
					reject(new Error(`${urlObj.hostname} returned ${res.statusCode}: ${errBody.slice(0, 500)}`));
				});
				return;
			}
			let buffer = ''; res.setEncoding('utf-8');
			res.on('data', (chunk: string) => {
				if (token.isCancellationRequested) { req.destroy(); return; }
				buffer += chunk;
				const parts = buffer.split('\n'); buffer = parts.pop() || '';
				for (const line of parts) {
					const t = line.trim();
					if (!t || t === 'event: message_stop' || t === 'event: ping') continue;
					if (t.startsWith('data: ')) {
						try {
							const parsed = JSON.parse(t.slice(6));
							if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
								progress.report(new vscode.LanguageModelTextPart(parsed.delta.text));
							}
						} catch { /* skip */ }
					}
				}
			});
			res.on('end', resolve);
			res.on('error', reject);
		});
		req.on('error', reject);
		req.on('timeout', () => { req.destroy(); reject(new Error(`Anthropic request to ${urlObj.hostname} timed out`)); });
		if (token) token.onCancellationRequested(() => req.destroy());
		req.write(body); req.end();
	});
}

// ── Main provider ───────────────────────────────────────────────

type Listener<T> = (e: T) => unknown;

interface ModelSource {
	sourcePrefix: string;
	check(): Promise<vscode.LanguageModelChatInformation[]>;
	respond(model: vscode.LanguageModelChatInformation, messages: Array<{ role: string; content: string }>, progress: vscode.Progress<vscode.LanguageModelResponsePart>, token: vscode.CancellationToken): Promise<void>;
}

export class LocalLanguageModelProvider implements vscode.LanguageModelChatProvider {
	private _listeners: Array<Listener<void>> = [];
	readonly onDidChangeLanguageModelChatInformation: vscode.Event<void> = (listener) => {
		this._listeners.push(listener);
		return { dispose: () => { const i = this._listeners.indexOf(listener); if (i >= 0) this._listeners.splice(i, 1); } };
	};

	private _cachedModels: vscode.LanguageModelChatInformation[] = [];
	private _modelSourceMap = new Map<string, ModelSource>();
	private _pollTimer: ReturnType<typeof setInterval> | undefined;

	constructor() {
		this._initSources();
		void this._poll();
		this._pollTimer = setInterval(() => void this._poll(), 60000);
	}

	dispose(): void {
		if (this._pollTimer) clearInterval(this._pollTimer);
		this._listeners = [];
	}

	private _initSources(): void {
		// Ollama is always checked (zero-config local)
		this._modelSourceMap.set('ollama', {
			sourcePrefix: 'ollama',
			check: checkOllamaModels,
			respond: async (model, messages, progress, token) => ollamaChatResponse(chatModelId(model), messages, progress, token),
		});

		// OpenAI-compatible from env vars (also covers NVIDIA NIM, etc.)
		const openaiKey = process.env.OPENAI_API_KEY?.trim();
		if (openaiKey) {
			const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
			this._modelSourceMap.set('openai', {
				sourcePrefix: 'openai',
				check: () => checkOpenAIModels(baseUrl, openaiKey),
				respond: (model, messages, progress, token) => openAIChatResponse(baseUrl, openaiKey, chatModelId(model), messages, progress, token),
			});
		}

		// Anthropic from env vars
		const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
		if (anthropicKey) {
			const baseUrl = (process.env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
			this._modelSourceMap.set('anthropic', {
				sourcePrefix: 'anthropic',
				check: () => checkAnthropicModels(baseUrl, anthropicKey),
				respond: (model, messages, progress, token) => anthropicChatResponse(baseUrl, anthropicKey, chatModelId(model), messages, progress, token),
			});
		}

		// Custom providers from ~/.autopilot/providers.json
		const customProviders = readProvidersJson();
		let customIndex = 0;
		for (const provider of customProviders) {
			if (!provider.name || !provider.baseUrl || !provider.apiKey) continue;
			const id = `custom_${customIndex++}`;
			const proxiedProvider = provider;
			const proxiedId = id;
			this._modelSourceMap.set(proxiedId, {
				sourcePrefix: proxiedId,
				check: () => checkCustomModels(proxiedProvider),
				respond: (model, messages, progress, token) => customChatResponse(proxiedProvider, chatModelId(model), messages, progress, token),
			});
		}
	}

	private _fireChange(): void {
		for (const cb of this._listeners) cb(undefined);
	}

	private async _poll(): Promise<void> {
		let changed = false;
		const allModels: vscode.LanguageModelChatInformation[] = [];
		for (const source of this._modelSourceMap.values()) {
			try {
				const models = await source.check();
				allModels.push(...models);
			} catch { /* source unavailable, skip silently */ }
		}
		const ids = allModels.map(m => m.id).sort();
		const oldIds = this._cachedModels.map(m => m.id).sort();
		if (JSON.stringify(ids) !== JSON.stringify(oldIds)) {
			changed = true;
		}
		this._cachedModels = allModels;
		if (changed) this._fireChange();
	}

	async provideLanguageModelChatInformation(_options: vscode.PrepareLanguageModelChatModelOptions, _token: vscode.CancellationToken): Promise<vscode.LanguageModelChatInformation[]> {
		return this._cachedModels;
	}

	async provideLanguageModelChatResponse(
		model: vscode.LanguageModelChatInformation,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		_options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken
	): Promise<void> {
		const parts = model.id.split('/');
		const sourcePrefix = parts.length >= 2 ? parts[1] : '';

		const msgs = extractMessages(messages);
		const source = this._modelSourceMap.get(sourcePrefix);
		if (!source) throw new Error(`No provider for model: ${model.id}`);
		return source.respond(model, msgs, progress, token);
	}

	async provideTokenCount(
		_model: vscode.LanguageModelChatInformation,
		text: string | vscode.LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken
	): Promise<number> {
		const input = typeof text === 'string' ? text : text.content.map(p => (p && typeof p === 'object' && 'value' in p) ? (p as vscode.LanguageModelTextPart).value : '').join(' ');
		return Math.ceil(input.length / 4);
	}
}
