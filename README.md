# Autopilot

## The Repository

This repository is where we develop **Autopilot**, an open-source editor focused on AI-assisted coding and computer tasks. While it includes a fully featured built-in editor, its primary focus is on AI agent workflows. Autopilot is completely free to use under Bring Your Own Key (BYOK) models.

This source code is built upon the foundation of [microsoft/vscode](https://github.com/microsoft/vscode) and is available to everyone under the standard [MIT license](LICENSE.txt).

## Why Autopilot?

Autopilot was built from the ground up with AI agents at its core. Unlike Visual Studio Code, where AI features are optional add-ons, Autopilot always operates in BYOK mode inside the Agents window (and sidebar). You bring your own keys from any provider, and the AI works for you without restrictions or usage limits.

The engine that handles your AI requests is optimized for speed. Tasks that might take hours elsewhere can be completed in a single coffee break. We've re-architected the request pipeline to be lean and responsive, so you spend less time waiting and more time getting work done.

## Autopilot

Autopilot uses the same format as VS Code - an IDE for file and folder editing with extensions support - but with a twist: it includes **Auto**, a purpose-built AI agent designed to do the work for you.

### Auto: The AI Agent

Auto is a specific AI with many instructions, accessible through BYOK (Bring Your Own Key) - add as many models from any provider you would like. There's no AI limits here.

While it retains VS Code's sidebar chat for in-IDE assistance, Autopilot also features an **Agent window**. Click "Agent" in the top-right to open a separate window with its own logo. This window is primarily focused on using an AI agent without any IDE clutter - here, the AI does all the work.

### 4 AI Permission Levels

Users can pick AI permissions to give the AI more or less freedom:

- **Strict**: When enabled, the AI must ask to do anything beyond chatting: running commands, writing files, reading files, searching the web, etc.
- **Non-Strict**: This allows the AI to read files, search the web, and do other minor tasks. No writing.
- **Bypass**: This allows the AI to do almost anything. Commands that could be dangerous require permission (accept/deny).
- **Takeoff**: When this mode is on, any and all questions the AI asks are automatically skipped (assuming the user is away), and any and all permissions are accepted. This is the main autopilot mode: if the user is away, it does not stop.

### Features

- **Always BYOK**: Unlike other editors, Autopilot's Agents window always operates in Bring Your Own Key mode. Use your own API keys from OpenAI, Anthropic, or any provider. No subscriptions, no usage caps, no vendor lock-in.
- **Blazing fast response times**: We've optimized the entire AI request pipeline to be significantly faster than typical implementations. Get results in minutes, not hours. Complete complex tasks during a single coffee break.
- **Auto - the built-in agent**: A purpose-built AI agent that handles coding tasks autonomously. It reads your codebase, makes changes, runs commands, and explains its work.
- **Dedicated Agent window**: A separate, focused window for AI-driven work. No IDE clutter, just the agent and your tasks.
- **Flexible permission levels**: Choose from Strict, Non-Strict, Bypass, or Takeoff modes to control how much autonomy the AI has.
- **Full VS Code compatibility**: All your favorite extensions, themes, and workflows work out of the box.
- **Cross-platform**: Runs on Windows, macOS, and Linux.

## Issue Reporting

This repository is **not actively maintained for pull requests**. We accept issue reports only for:

- **Bug reports**: Reproducible problems with Autopilot
- **Feature requests**: Ideas for improving Autopilot

Please use GitHub Issues for these two purposes only. We do not accept code contributions via pull request at this time.

## Bundled Extensions

Autopilot includes a set of built-in extensions located in the [extensions](extensions) folder, including grammars and snippets for many languages. Extensions that provide rich language support (inline suggestions, Go to Definition) for a language have the suffix `language-features`. For example, the `json` extension provides coloring for `JSON` and the `json-language-features` extension provides rich language support for `JSON`.

## License

Copyright (c) Autopilot contributors. All rights reserved.

Licensed under the [MIT](LICENSE.txt) license.

Autopilot is a fork of [microsoft/vscode](https://github.com/microsoft/vscode). The original VS Code source code is Copyright (c) Microsoft Corporation and is also licensed under MIT. See [LICENSE.txt](LICENSE.txt) for full attribution and license details.
