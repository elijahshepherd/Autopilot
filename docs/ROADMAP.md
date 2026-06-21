# Roadmap

Current: **v0.9.0** (released)

Capabilities delivered in v0.9.0:

- **Reasoning UI**: Anthropic `thinking_delta` and OpenAI `reasoning_content` go through `LanguageModelThinkingPart` so they render as a collapsed "thinking" panel instead of streaming into the response text. Hidden reasoning blocks (`<thinking>`, `<reasoning>`, `<think>`) that some open-source models emit as plain text get scrubbed from the assistant message.
- **Malformed tool-call scrubber**: Tool-call envelopes, `questions` arrays, surveys, and similar raw JSON payloads are detected and stripped before reaching the UI.
- **Capability manifest**: Each request carries a startup system message listing enabled tools, platform, and elevation state.
- **Bounded rate-limit handling**: 429 responses retry at most once with a 30-second ceiling, then surface a friendly error.
- **Empty-stream safeguard**: An empty LLM stream now surfaces a `(the model produced no output for this request)` notice instead of a silent turn.
- **Friendly rate-limit copy**: Updated the chat-status widget to show "Rate limit reached. Please try again shortly." instead of a Sign-In suggestion.
- **Auth toggle**: The Accounts menu is restored as user-toggleable through the `workbench.accounts.visible` workspace-storage key; default is hidden since sign-in is optional in Autopilot.
- **Sentence-case UI labels**: "Use AI Features", "Sign In", "Autopilot AI Status" → "Use Autopilot", "Sign in", "Autopilot status".
- **Set Autopilot flier** action: command-palette entry (`f1: true`) that lets the user pick a Flier id (e.g. `roblox`, `none`).
- **Flier chip in chat input toolbar**: A "Flier" entry appears in the chat input's navigation group out of the box; pick a Flaskers id and the next request gets the Flier's system prompt.
- **Fliers registry**: Built-in Roblox development Flier with Lua/Rojo/Wally/Roblox Studio defaults. Drop a custom `.autopilot/fliers/<id>.md` file at the workspace root to add a specialized workspace mode.
- **Plan chat mode**: New `Plan` pill in the ask/edit/agent pills.
- **Debug chat mode**: `Debug` pill (already added in v0.8.0) continues to work alongside Plan.

Deferred to a later version:

- Custom Flier picker chip beside the Agent selector (UI action only — current workaround is the command palette).
- Separate Windows `Agent.exe` for the agents-window host process (current approach: --agents flag already spawns a separate elevated process via `Start-Process -Verb RunAs`).
- Per-Flier sub-agent picker UI for specialized roles like Jessie/Jack (the assistants are referenced in the system prompt; UI dropdown is a follow-up).
- Per-tool mention diagnostics currently surfacing behind `Failed to get a response` — we now show the underlying cause but more debugging hooks will land with the next chat widget refactor.
