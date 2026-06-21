import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Shared helpers ──────────────────────────────────────────────

function defaultPort(url: URL): string | undefined {
	if (url.port) return url.port;
	if (url.protocol === 'https:') return '443';
	if (url.protocol === 'http:') return '80';
	return undefined;
}

function httpJson<T>(method: string, url: string, headers: Record<string, string>, body?: string, timeout = 5000): Promise<{ statusCode: number; body: string; json: T | null }> {
	return new Promise((resolve, reject) => {
		const urlObj = new URL(url);
		const isHttps = urlObj.protocol === 'https:';
		const lib = isHttps ? https : http;
		const options: http.RequestOptions = {
			hostname: urlObj.hostname,
			port: urlObj.port || defaultPort(urlObj),
			path: urlObj.pathname + urlObj.search,
			method,
			headers,
			timeout,
		};
		const req = lib.request(options, (res) => {
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
	return messages.map(msg => {
		const role = msg.role === vscode.LanguageModelChatMessageRole.User ? 'user'
			: msg.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant'
			: 'system';
		const content = msg.content.map(p => {
			if (p instanceof vscode.LanguageModelTextPart) return p.value;
			if (p && typeof p === 'object' && 'value' in p) return String((p as any).value);
			return '';
		}).join('');
		return { role, content };
	});
}

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

// Add a startup message that documents this runtime to the AI so it can
// accurately understand which tools, terminal, and editing capabilities are
// available — and stop telling users that features don't exist when they do.
function prependCapabilityManifest(
	messages: Array<{ role: string; content: string }>,
	_options?: vscode.ProvideLanguageModelChatResponseOptions
): Array<{ role: string; content: string }> {
	const platform = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux';
	const elevated = process.platform === 'win32' ? isProcessElevated() : (process.getuid?.() === 0);
	const tools = _options?.tools ?? [];
	const toolNames = tools.map(t => t.name).filter(Boolean);
	const toolList = toolNames.length > 0
		? toolNames.join(', ')
		: 'edit_files, run_in_terminal, runCommands, search_codebase, list_dir, read_file, get_file_contents, replace_string_in_file, multi_replace_string_in_file, create_file, fetch_webpage, todos, workspace_search';
	const manifest = [
		'You are running inside Autopilot on ' + platform + '.',
		elevated ? 'The current process is running with administrator/root privileges.' : 'The current process is running with normal user privileges.',
		'Autopilot tools exposed to you in this session: ' + toolList + '.',
		"When the user asks you to run a command, edit a file, or perform any workspace operation, prefer the matching Autopilot tool from this list. Do not claim a feature is unavailable unless the matching tool name is not present here.",
		'All reasoning, planning, tool-call envelopes, and intermediate state must stay internal and never appear in your final message text. Only the user message, any startup notice, and the final response are visible to the user.',
		'When asked to reply, produce only that output — no hidden prelude.',
		'',
		'--- BEGIN SESSION ---',
	].join('\n');
	const systemIndex = messages.findIndex(m => m.role === 'system');
	const next = messages.slice();
	if (systemIndex >= 0) {
		next[systemIndex] = { role: 'system', content: manifest + '\n\n' + next[systemIndex].content };
	} else {
		next.unshift({ role: 'system', content: manifest });
	}
	return next;
}

function isProcessElevated(): boolean {
	if (process.platform !== 'win32') return false;
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const cp = require('child_process');
		cp.execSync('net session 1>nul 2>nul', { stdio: 'ignore' });
		return true;
	} catch { return false; }
}

interface ProviderConfig {
	name: string;
	type: 'openai' | 'anthropic';
	baseUrl: string;
	apiKey: string;
	apiType?: 'chat-completions' | 'responses' | 'messages';
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

function normalizeBaseUrl(url: string): string {
	return url.replace(/\/+$/, '');
}

function resolveModelsUrl(baseUrl: string): string {
	const base = normalizeBaseUrl(baseUrl);
	if (/\/v\d+$/.test(base) || base.endsWith('/v1') || base.endsWith('/v2')) {
		return `${base}/models`;
	}
	if (base.endsWith('/models')) return base;
	if (base.includes('/v1/') || base.includes('/v2/')) return `${base}/models`;
	return `${base}/v1/models`;
}

function resolveChatUrl(baseUrl: string): string {
	const base = normalizeBaseUrl(baseUrl);
	if (/\/v\d+$/.test(base)) return `${base}/chat/completions`;
	if (base.endsWith('/chat/completions')) return base;
	if (base.includes('/v1/') || base.includes('/v2/')) return `${base}/chat/completions`;
	return `${base}/v1/chat/completions`;
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
	const url = 'http://localhost:11434/v1/chat/completions';
	const body = JSON.stringify({ model: modelId, messages, stream: true, reasoning_effort: 'high' });
	return streamOpenAI(url, { 'Content-Type': 'application/json' }, body, progress, token);
}

// ── Source: OpenAI-compatible (env vars / providers.json / custom) ────────

interface OpenAIModelEntry { id: string; created?: number; owned_by?: string; }
interface OpenAIModelsResponse { data?: OpenAIModelEntry[]; }

async function checkOpenAIModels(baseUrl: string, apiKey: string): Promise<vscode.LanguageModelChatInformation[]> {
	try {
		const modelsUrl = resolveModelsUrl(baseUrl);
		const res = await httpJson('GET', modelsUrl, { 'Authorization': `Bearer ${apiKey}` }, undefined, 5000);
		if (res.statusCode !== 200 || !res.json) return [];
		const data = res.json as OpenAIModelsResponse;
		return (data.data || []).map(m => makeModelInfo(
			`local/openai/${m.id}`, m.id, m.id.split('-')[0] || 'openai',
			String(m.created ?? Date.now()),
		));
	} catch { return []; }
}

async function openAIChatResponse(baseUrl: string, apiKey: string, modelId: string, messages: Array<{ role: string; content: string }>, progress: vscode.Progress<vscode.LanguageModelResponsePart>, token: vscode.CancellationToken): Promise<void> {
	const url = resolveChatUrl(baseUrl);
	const body = JSON.stringify({ model: modelId, messages, stream: true, reasoning_effort: 'high' });
	return streamOpenAI(url, { 'Authorization': `Bearer ${apiKey}` }, body, progress, token);
}

// ── Source: Anthropic (env vars / providers.json) ───────────────

async function checkAnthropicModels(baseUrl: string, apiKey: string): Promise<vscode.LanguageModelChatInformation[]> {
	try {
		const base = normalizeBaseUrl(baseUrl);
		const res = await httpJson('GET', `${base}/models`, { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, undefined, 5000);
		if (res.statusCode !== 200 || !res.json) return [];
		const data = res.json as { data?: Array<{ type: string; id: string; display_name?: string; created_at?: string }> };
		return (data.data || []).filter(m => m.type === 'model').map(m => makeModelInfo(
			`local/anthropic/${m.id}`, m.display_name || m.id, 'claude',
			m.created_at || '1.0', { vision: true },
		));
	} catch { return []; }
}

async function anthropicChatResponse(baseUrl: string, apiKey: string, modelId: string, messages: Array<{ role: string; content: string }>, progress: vscode.Progress<vscode.LanguageModelResponsePart>, token: vscode.CancellationToken): Promise<void> {
	const base = normalizeBaseUrl(baseUrl);
	const url = `${base}/messages`;
	const body = JSON.stringify({
		model: modelId,
		max_tokens: 16384,
		thinking: { type: 'enabled', budget_tokens: 10000 },
		messages,
		stream: true,
	});
	return streamAnthropic(url, { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, body, progress, token);
}

// ── Source: Custom OpenAI-compatible (from providers.json) ─────

async function checkCustomModels(provider: ProviderConfig): Promise<vscode.LanguageModelChatInformation[]> {
	const prefix = 'custom';
	if (provider.models && provider.models.length > 0) {
		return provider.models.map(m => makeModelInfo(
			`local/${prefix}/${m.id}`,
			m.name || m.id,
			m.id.split('-')[0] || provider.name,
			'1.0',
			{ maxInputTokens: m.maxInputTokens, maxOutputTokens: m.maxOutputTokens, vision: m.vision },
		));
	}
	if (provider.type === 'anthropic' || provider.apiType === 'messages') {
		return checkAnthropicModels(provider.baseUrl, provider.apiKey);
	}
	try {
		const modelsUrl = resolveModelsUrl(provider.baseUrl);
		const res = await httpJson('GET', modelsUrl, { 'Authorization': `Bearer ${provider.apiKey}` }, undefined, 5000);
		if (res.statusCode !== 200 || !res.json) return [];
		const data = res.json as OpenAIModelsResponse;
		return (data.data || []).map(m => makeModelInfo(
			`local/${prefix}/${m.id}`, m.id, m.id.split('-')[0] || provider.name,
			String(m.created ?? Date.now()),
		));
	} catch { return []; }
}

async function customChatResponse(provider: ProviderConfig, modelId: string, messages: Array<{ role: string; content: string }>, progress: vscode.Progress<vscode.LanguageModelResponsePart>, token: vscode.CancellationToken): Promise<void> {
	if (provider.type === 'anthropic' || provider.apiType === 'messages') {
		return anthropicChatResponse(provider.baseUrl, provider.apiKey, modelId, messages, progress, token);
	}
	const url = resolveChatUrl(provider.baseUrl);
	const body = JSON.stringify({ model: modelId, messages, stream: true, reasoning_effort: 'high' });
	return streamOpenAI(url, { 'Authorization': `Bearer ${provider.apiKey}` }, body, progress, token);
}

// ── Streaming helpers ───────────────────────────────────────────

/**
 * Returns a stable, user-friendly Error object that downstream renderers can
 * surface in chat without disclosing raw host payloads. Status codes are
 * mapped to plain-language descriptions.
 */
function asProviderError(statusCode: number, host: string, body: string): Error {
	const message = formatProviderError(statusCode, host, body);
	const err = new Error(message);
	(err as Error & { code?: string; providerError?: { statusCode: number; host: string; body: string } }).code = String(statusCode);
	(err as Error & { code?: string; providerError?: { statusCode: number; host: string; body: string } }).providerError = { statusCode, host, body: body.slice(0, 500) };
	return err;
}

type StreamFn = (urlStr: string, headers: Record<string, string>, body: string, progress: vscode.Progress<vscode.LanguageModelResponsePart2>, token: vscode.CancellationToken) => Promise<void>;

/**
 * Autopilot: limited retry that prevents exponential growth.
 *
 * - At most `MAX_RETRIES` retries
 * - Each retry waits at most 30 seconds total
 * - If the underlying error still indicates rate limiting the request is
 *   surfaced as a permanent error to the user rather than another retry.
 */
async function runWithBoundedRetry(
	worker: StreamFn,
	urlStr: string,
	headers: Record<string, string>,
	body: string,
	progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
	token: vscode.CancellationToken
): Promise<void> {
	let attempt = 0;
	while (true) {
		try {
		await worker(urlStr, headers, body, progress, token);
			return;
		} catch (err) {
			if (token.isCancellationRequested) throw err;
			const providerErr = (err as { providerError?: { statusCode: number; body: string } } | null)?.providerError;
			if (!providerErr) {
				// Transport-level error — one bounded retry, then surface.
				if (attempt >= MAX_RETRIES) throw err;
				attempt++;
				await sleep(Math.min(1000 * attempt, 2000));
				continue;
			}
			const delay = retryDelayFor(providerErr, attempt);
			if (delay === null) throw err;
			attempt++;
			await sleep(delay);
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Decide whether a failed response should be retried. Returns a positive
 * number for the retry delay in milliseconds, or `null` if no retry.
 *
 * Autopilot: bounded retry — at most MAX_RETRIES bump-down; an explicit 429
 * from the provider clamps to a 30-second ceiling and surfaces as the same
 * user-facing error message after the second attempt.
 */
function retryDelayFor(response: { statusCode: number; body: string }, attempt: number): number | null {
	if (attempt >= MAX_RETRIES) return null;
	if (response.statusCode === 429) {
		const m = /retry-after\s*:\s*(\d+)/i.exec(response.body);
		const hint = m ? Number(m[1]) : NaN;
		const secs = Number.isFinite(hint) ? Math.min(Number(hint), 30) : 8;
		return secs * 1000;
	}
	if (response.statusCode === 408 || response.statusCode === 502 || response.statusCode === 503 || response.statusCode === 504) {
		return Math.min(2000 + attempt * 2000, 6000);
	}
	return null;
}

const MAX_RETRIES = 1;

function formatProviderError(statusCode: number, host: string, body: string): string {
	const excerpt = body.replace(/\s+/g, ' ').trim().slice(0, 220);
	if (statusCode === 429) return `Autopilot rate limit reached. Please try again shortly.`;
	if (statusCode === 401 || statusCode === 403) return `Autopilot authentication failed for ${host}. Check your API key.`;
	if (statusCode === 404) return `Autopilot could not reach the model endpoint on ${host} (404).`;
	if (statusCode >= 500) return `Autopilot upstream provider is unavailable (HTTP ${statusCode} on ${host}). Please try again shortly.`;
	return `Autopilot request failed (HTTP ${statusCode} on ${host}): ${excerpt || 'no body'}`;
}

function streamOpenAI(urlStr: string, headers: Record<string, string>, body: string, progress: vscode.Progress<vscode.LanguageModelResponsePart2>, token: vscode.CancellationToken): Promise<void> {
	return runWithBoundedRetry(streamOpenAIInner, urlStr, headers, body, progress, token);
}

function streamOpenAIInner(urlStr: string, headers: Record<string, string>, body: string, progress: vscode.Progress<vscode.LanguageModelResponsePart2>, token: vscode.CancellationToken): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const urlObj = new URL(urlStr);
		const isHttps = urlObj.protocol === 'https:';
		const lib = isHttps ? https : http;
		const allHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
		const options: http.RequestOptions = {
			hostname: urlObj.hostname,
			port: urlObj.port || defaultPort(urlObj),
			path: urlObj.pathname + urlObj.search,
			method: 'POST',
			headers: { ...allHeaders, 'Content-Length': Buffer.byteLength(body).toString() },
			timeout: 120000,
		};
		const req = lib.request(options, (res) => {
			if (res.statusCode && res.statusCode >= 400) {
				const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c));
				res.on('end', () => {
					const errBody = Buffer.concat(chunks).toString('utf-8');
					reject(asProviderError(res.statusCode ?? 500, urlObj.hostname, errBody));
				});
				return;
			}
			let buffer = ''; res.setEncoding('utf-8');
			let emittedAnyText = false;
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
							const delta = parsed?.choices?.[0]?.delta ?? {};
							if (delta.reasoning_content) {
								progress.report(new vscode.LanguageModelThinkingPart(delta.reasoning_content, 'openai-reasoning'));
								continue;
							}
							if (delta.tool_calls || delta.function_call) continue;
							const content = delta.content;
							if (typeof content === 'string' && content.length > 0) {
								const cleaned = redactMalformedStructuredOutput(content);
								if (cleaned.length > 0) {
									progress.report(new vscode.LanguageModelTextPart(cleaned));
									emittedAnyText = true;
								}
							}
						} catch { /* skip malformed */ }
					}
				}
			});
			res.on('end', () => {
				if (!emittedAnyText) {
					// Autopilot: ensure the user never sees a silent stream. Surface
					// a clear, friendly notice so the chat shows a final response.
					progress.report(new vscode.LanguageModelTextPart('(the model produced no output for this request)'));
				}
				resolve();
			});
			res.on('error', reject);
		});
		req.on('error', reject);
		req.on('timeout', () => { req.destroy(); reject(new Error(`Request to ${urlObj.hostname} timed out`)); });
		if (token) token.onCancellationRequested(() => req.destroy());
		req.write(body); req.end();
	});
}

function streamAnthropic(urlStr: string, headers: Record<string, string>, body: string, progress: vscode.Progress<vscode.LanguageModelResponsePart2>, token: vscode.CancellationToken): Promise<void> {
	return runWithBoundedRetry(streamAnthropicInner, urlStr, headers, body, progress, token);
}

function streamAnthropicInner(urlStr: string, headers: Record<string, string>, body: string, progress: vscode.Progress<vscode.LanguageModelResponsePart2>, token: vscode.CancellationToken): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const urlObj = new URL(urlStr);
		const isHttps = urlObj.protocol === 'https:';
		const lib = isHttps ? https : http;
		const allHeaders: Record<string, string> = { ...headers };
		const options: http.RequestOptions = {
			hostname: urlObj.hostname,
			port: urlObj.port || defaultPort(urlObj),
			path: urlObj.pathname + urlObj.search,
			method: 'POST',
			headers: { ...allHeaders, 'Content-Length': Buffer.byteLength(body).toString() },
			timeout: 120000,
		};
		const req = lib.request(options, (res) => {
			if (res.statusCode && res.statusCode >= 400) {
				const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c));
				res.on('end', () => {
					const errBody = Buffer.concat(chunks).toString('utf-8');
					reject(asProviderError(res.statusCode ?? 500, urlObj.hostname, errBody));
				});
				return;
			}
			let buffer = ''; res.setEncoding('utf-8');
			let emittedAnyText = false;
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
							if (parsed.type === 'content_block_delta') {
								if (parsed.delta?.type === 'text_delta') {
									const cleaned = redactMalformedStructuredOutput(parsed.delta.text);
									if (cleaned.length > 0) {
										progress.report(new vscode.LanguageModelTextPart(cleaned));
										emittedAnyText = true;
									}
								} else if (parsed.delta?.type === 'thinking_delta' && parsed.delta.thinking) {
									progress.report(new vscode.LanguageModelThinkingPart(parsed.delta.thinking, 'anthropic-reasoning'));
								}
							}
						} catch { /* skip */ }
					}
				}
			});
			res.on('end', () => {
				if (!emittedAnyText) {
					progress.report(new vscode.LanguageModelTextPart('(the model produced no output for this request)'));
				}
				resolve();
			});
			res.on('error', reject);
		});
		req.on('error', reject);
		req.on('timeout', () => { req.destroy(); reject(new Error(`Anthropic request to ${urlObj.hostname} timed out`)); });
		if (token) token.onCancellationRequested(() => req.destroy());
		req.write(body); req.end();
	});
}

// ── Output sanitization ─────────────────────────────────────────

/**
 * Strip raw structured outputs (JSON tool-calls, prompts, malformed payloads)
 * from a streamed text chunk. If a chunk contains a complete JSON object whose
 * keys look like a tool-call envelope, we drop the whole chunk. Otherwise we
 * attempt to scrub embedded JSON objects line-by-line.
 *
 * Autopilot: never show tool-call envelopes, internal prompts, or survey-style
 * `questions` arrays to the user. Reasoning and tool-deltas are routed through
 * `LanguageModelThinkingPart` upstream, so this redactor only needs to defend
 * against casual leakage in the visible text.
 */
function redactMalformedStructuredOutput(text: string): string {
	if (!text) return '';
	const trimmed = text.trim();
	// Whole chunk is JSON — drop it. Tools should not be embedded as raw text.
	if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
		try {
			const parsed = JSON.parse(trimmed);
			if (isToolCallLikePayload(parsed)) {
				return '';
			}
		} catch { /* not JSON */ }
	}
	// Otherwise strip out any embedded JSON object literals that look like
	// tool-call envelopes.
	const lines = text.split(/\r?\n/);
	const keep: string[] = [];
	let depth = 0;
	let jsonLines: string[] = [];
	let inJson = false;
	let hadToolCall = false;
	for (const line of lines) {
		const opens = (line.match(/[\[{]/g) || []).length;
		const closes = (line.match(/[\]}]/g) || []).length;
		const delta = opens - closes;
		const t = line.trimStart();
		if (depth === 0 && (t.startsWith('{') || t.startsWith('['))) {
			inJson = true;
			jsonLines = [line];
			depth = opens - closes;
			if (depth === 0) {
				try {
					const parsed = JSON.parse(line);
					if (isToolCallLikePayload(parsed)) hadToolCall = true;
				} catch { keep.push(jsonLines.join('\n')); }
				inJson = false; jsonLines = []; depth = 0;
			}
			continue;
		}
		if (inJson) {
			jsonLines.push(line);
			depth += delta;
			if (depth <= 0) {
				try {
					const parsed = JSON.parse(jsonLines.join('\n'));
					if (isToolCallLikePayload(parsed)) hadToolCall = true;
				} catch { keep.push(jsonLines.join('\n')); }
				inJson = false; jsonLines = []; depth = 0;
			}
			continue;
		}
		keep.push(line);
	}
	if (hadToolCall) {
		// If we ever saw a tool-call envelope embedded in plain text, drop the
		// entire chunk rather than leak fragments.
		return '';
	}
	const rebuilt = keep.join('\n');
	return scrubBoundedReasoningBlocks(rebuilt);
}

function scrubBoundedReasoningBlocks(text: string): string {
	if (!text) return text;
	return text
		.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
		.replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
		.replace(/<think>[\s\S]*?<\/think>/g, '')
		.trim();
}

function isToolCallLikePayload(parsed: unknown): boolean {
	if (!parsed || typeof parsed !== 'object') return false;
	const obj = parsed as Record<string, unknown>;
	if (Array.isArray((obj as { tool_calls?: unknown }).tool_calls)) return true;
	if (Array.isArray((obj as { function_call?: unknown }).function_call)) return true;
	if ((obj as { name?: unknown }).name && (obj as { arguments?: unknown }).arguments !== undefined) return true;
	if (Array.isArray((obj as { questions?: unknown }).questions)) {
		for (const q of (obj as { questions: unknown[] }).questions) {
			if (q && typeof q === 'object') {
				const keys = Object.keys(q as Record<string, unknown>);
				if (keys.includes('question') || keys.includes('header') || keys.includes('allowFreeformInput')) {
					return true;
				}
			}
		}
	}
	return false;
}

// ── Main provider ───────────────────────────────────────────────

type Listener<T> = (e: T) => unknown;

interface ModelSource {
	sourcePrefix: string;
	check(): Promise<vscode.LanguageModelChatInformation[]>;
	respond(model: vscode.LanguageModelChatInformation, messages: Array<{ role: string; content: string }>, progress: vscode.Progress<vscode.LanguageModelResponsePart>, token: vscode.CancellationToken): Promise<void>;
}

export class LocalLanguageModelProvider implements vscode.LanguageModelChatProvider {
	get currentModels(): vscode.LanguageModelChatInformation[] { return this._cachedModels; }
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
		this._preconnect();
		void this._poll();
		this._pollTimer = setInterval(() => void this._poll(), 30000);
	}

	private _preconnect(): void {
		const endpoints: string[] = ['http://localhost:11434/v1/chat/completions'];
		const openaiKey = process.env.OPENAI_API_KEY?.trim();
		if (openaiKey) {
			const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
			endpoints.push(resolveChatUrl(baseUrl));
		}
		const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
		if (anthropicKey) {
			const baseUrl = (process.env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
			endpoints.push(`${normalizeBaseUrl(baseUrl)}/messages`);
		}
		const customProviders = readProvidersJson();
		for (const provider of customProviders) {
			if (!provider.baseUrl || !provider.apiKey) continue;
			if (provider.type === 'anthropic' || provider.apiType === 'messages') {
				endpoints.push(`${normalizeBaseUrl(provider.baseUrl.replace(/\/+$/, ''))}/messages`);
			} else {
				endpoints.push(resolveChatUrl(provider.baseUrl.replace(/\/+$/, '')));
			}
		}
		for (const url of endpoints) {
			try {
				const urlObj = new URL(url);
				const lib = urlObj.protocol === 'https:' ? https : http;
				lib.request({ hostname: urlObj.hostname, port: urlObj.port || defaultPort(urlObj), path: '/', method: 'HEAD', timeout: 2000 })
					.on('error', () => { })
					.on('timeout', () => { /* request aborted via timeout */ })
					.end();
			} catch { /* ignore */ }
		}
	}

	dispose(): void {
		if (this._pollTimer) clearInterval(this._pollTimer);
		this._listeners = [];
	}

	private _initSources(): void {
		this._modelSourceMap.set('ollama', {
			sourcePrefix: 'ollama',
			check: checkOllamaModels,
			respond: async (model, messages, progress, token) => ollamaChatResponse(chatModelId(model), messages, progress, token),
		});

		const openaiKey = process.env.OPENAI_API_KEY?.trim();
		if (openaiKey) {
			const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
			this._modelSourceMap.set('openai', {
				sourcePrefix: 'openai',
				check: () => checkOpenAIModels(baseUrl, openaiKey),
				respond: (model, messages, progress, token) => openAIChatResponse(baseUrl, openaiKey, chatModelId(model), messages, progress, token),
			});
		}

		const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
		if (anthropicKey) {
			const baseUrl = (process.env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
			this._modelSourceMap.set('anthropic', {
				sourcePrefix: 'anthropic',
				check: () => checkAnthropicModels(baseUrl, anthropicKey),
				respond: (model, messages, progress, token) => anthropicChatResponse(baseUrl, anthropicKey, chatModelId(model), messages, progress, token),
			});
		}

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
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
		token: vscode.CancellationToken
	): Promise<void> {
		const parts = model.id.split('/');
		const sourcePrefix = parts.length >= 2 ? parts[1] : '';

		const extracted = extractMessages(messages);
		const msgs = prependCapabilityManifest(extracted, _options);
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
