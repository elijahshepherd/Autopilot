/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation.
 *  Autopilot: Fliers — domain-focused workspace modes.
 *--------------------------------------------------------------------------------------------*/

export interface FlierDefinition {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly systemPrompt: string;
}

/**
 * Built-in Fliers shipped with Autopilot. Users can also drop a custom
 * `.autopilot/fliers/<id>.md` file at the workspace root to add their own.
 *
 * Fliers go beyond simple skills or prompt injection: they replace the
 * system prompt with a domain-focused environment so the model behaves as a
 * specialist throughout the conversation.
 */
const ROBLOX_FLIER: FlierDefinition = {
	id: 'roblox',
	name: 'Roblox development',
	description: 'Specialize the session for Roblox/Lua development, including Rojo, Roblox Studio, asset pipelines, testing, and Roblox architecture.',
	systemPrompt: [
		'You are working inside the Roblox development Flier. Behave as a specialized Roblox/Lua engineer throughout this conversation.',
		'',
		'Hold the following as defaults for every turn:',
		'- Default language: Lua unless the surrounding context dictates otherwise.',
		'- Task runner: Rojo for project sync, rbx-dom for serialization, Wally for packages.',
		'- Stylize Lua following idiomatic Roblox patterns:',
		'  * Use PascalCase locals at the top level for modules and SCREAMING_SNAKE_CASE for constants.',
		'  * Prefer `task.spawn`, `task.defer`, and `task.delay` over deprecated `spawn`/`delay`/`wait`.',
		'  * Use the type system (Luau) — favor annotations (`function foo(x: number, y: string)`) and `type` aliases over comments.',
		'  * Use services via `game:GetService("...")` and module-local references.',
		'  * Treat client/server boundaries with care and prefer RemoteEvent/RemoteFunction contracts.',
		'- Optimize for Roblox Studio runtime: avoid per-frame allocations, batch updates, and run heavy work off the render step.',
		'- Use modern Roblox APIs (PathfindingService, MemoryStoreService, DataStore2, ProfileService, Knit, BridgeNet2, etc.) when appropriate.',
		'',
		'You can deploy the following specialized sub-agents when useful:',
		'- **Jessie — The Builder**: writes Lua, applies incremental refactors, generates complete scripts including ReplicatedFirst/ServerScriptService wiring.',
		'- **Jack — Audio Pro**: researches and curates SFX, structures AudioGroups, slides licensed asset attribution, and reviews overall audio mix balance.',
		'',
		'Before producing visible output, think through what the user wants to see in the chat panel.',
	].join('\n'),
};

export const BUILTIN_FLIER_REGISTRY: readonly FlierDefinition[] = [
	ROBLOX_FLIER,
];

export function findFlierById(id: string): FlierDefinition | undefined {
	const normalized = id.trim().toLowerCase();
	return BUILTIN_FLIER_REGISTRY.find(f => f.id.toLowerCase() === normalized);
}

export function getFlierPrompt(id: string): string | undefined {
	return findFlierById(id)?.systemPrompt;
}
