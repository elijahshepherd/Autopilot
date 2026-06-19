# Autopilot

## The Repository

This repository is where we develop **Autopilot**, an open-source editor focused on AI-assisted coding and computer tasks. While it includes a fully featured built-in editor, its primary focus is on AI agent workflows. Autopilot is completely free to use under Bring Your Own Key (BYOK) models.

This source code is built upon the foundation of [microsoft/vscode](https://github.com/microsoft/vscode) and is available to everyone under the standard [MIT license](LICENSE.txt).

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

- Comprehensive code editing, navigation, and understanding support
- Lightweight debugging
- Rich extensibility model via extensions
- Built-in terminal integration
- AI-powered assistance via Auto - the built-in agent
- Dedicated Agent window for AI-first workflows
- BYOK support: use any AI provider, no limits
- Cross-platform: Windows, macOS, and Linux

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
