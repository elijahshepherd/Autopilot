# Autopilot Agents Instructions

This file provides essential guidance for AI agents working with the Autopilot codebase.

Autopilot is an open-source editor focused on AI-assisted coding and computer tasks. While it includes a fully featured built-in editor, its primary focus is on AI agent workflows. Autopilot is completely free to use under Bring Your Own Key (BYOK) models.

## Quick Reference

**Architecture**: Forks [microsoft/vscode](https://github.com/microsoft/vscode) with `src/` containing core editor/workbench, `extensions/` with built-in extensions
**Build**: `npm run compile` builds the full product including extensions
**Test**: `npm run test-node` for unit tests, or run individual tests with `--grep`
**Run**: `./scripts/code.sh` or `npm run electron`
**Debug**: Use `.agents/skills/launch/SKILL.md` for isolated debugging

## Essential Commands

### Build & Watch
- **Full compile**: `npm run compile` (or `npm run watch` for incremental)
- **Type check**: `npm run typecheck-client` (client only) or `npm run typecheck` (build folder)
- **Transpile only**: `npm run transpile` (faster than compile, for unit tests)
- **Format/hygiene**: `npm run gulp hygiene`
- **Lint**: `npm run eslint`
- **Rebuild extensions**: `npm run gulp compile-extensions`

### Testing
- **All unit tests**: Use `./scripts/test.sh` (Unix) or `./scripts/test.bat` (Windows)
- **Node tests only**: `npm run test-node`
- **Browser tests**: `npm run test-browser`
- **Extension API tests**: `npm run test-extension`
- **Smoke tests**: `npm run smoketest`
- **Filter tests**: `mocha ... --grep "<test name pattern>"`
- **Integration tests**: `./scripts/test-integration.sh`

### Code Execution
- **Launch dev build**: `./scripts/code.sh` or `npm run electron`
- **Launch with flags**: `./scripts/code.sh <args>` passes args to the binary
- **Web version**: `./scripts/code-web.js`
- **CLI version**: `./scripts/code-cli.js`

## Architecture

### Source Structure (`src/`)
- `src/vs/base/` - Foundation utilities, cross-platform abstractions
- `src/vs/platform/` - Platform services, dependency injection infrastructure
- `src/vs/editor/` - Text editor with language services, syntax highlighting
- `src/vs/workbench/` - Main application UI (browser + desktop)
  - `workbench/browser/` - Core UI parts and layout
  - `workbench/services/` - Service implementations
  - `workbench/contrib/` - Feature contributions (git, debug, search, terminal, chat, etc.)
  - `workbench/api/` - Extension host and API implementation
- `src/vs/code/` - Electron main process
- `src/vs/server/` - Remote server implementation
- `src/vs/sessions/` - Agent sessions window (dedicated workbench for AI agent workflows)

### Extensions (`extensions/`)
- Built-in extensions that ship with Autopilot
- Language features extensions have `-language-features` suffix
- Coding conventions: standard VS Code extension pattern with `package.json` + TypeScript sources

## Code Conventions

- **Indentation**: Tabs (not spaces)
- **Naming**: PascalCase for types/enums, camelCase for functions/variables
- **Strings**: Double quotes for user-facing (localized), single quotes otherwise
- **Comments**: JSDoc for public APIs
- **Disposables**: Register immediately with `DisposableStore`/`MutableDisposable`
- **Services**: Inject via constructor (services come after non-service params; never use `IInstantiationService` outside constructor)
- **Icons**: Use `Codicon` enum from `@vscode/codicons`
- **Localization**: Use `nls.localize()` for user-facing strings

## AI Agent Features

Autopilot's differentiator is **Auto**, the built-in AI agent:

- **Agent window**: Click "Agent" in top-right to open a separate window dedicated to AI workflows (no IDE clutter)
- **BYOK (Bring Your Own Key)**: Add models from any provider; no AI limits
- **4 AI Permission Levels**:
  - **Strict**: AI must ask permission for any action (commands, file ops, web searches, etc.)
  - **Non-Strict**: AI can read files, search web, do minor tasks; cannot write
  - **Bypass**: AI can do almost anything; dangerous commands require accept/deny
  - **Takeoff**: All questions automatically answered as if user is away; all permissions auto-accepted
- Related code: `src/vs/workbench/contrib/chat/`, `extensions/copilot/`

## Critical Gotchas

### Build System
- **`npm run compile` is required** to run the app (not just `npm run transpile-client`)
- Building just the client is insufficient; built-in extensions in `extensions/` must also be built
- Pre/post install hooks at `build/npm/preinstall.ts` and `postinstall.ts`

### Testing
- UI/integration tests require a fully compiled product (`npm run compile` first)
- Never run tests if TypeScript errors exist
- Layer validation: `npm run valid-layers-check`
- Flaky tests should be marked with `[Flaky]` in the test name

### Debugging Ports
- Renderer: `--remote-debugging-port` (use Playwright/CDP)
- Extension host: `--inspect-extensions`
- Main process: `--inspect`
- Agent host: `--inspect-agenthost`
- **Always use isolated instances** (see `.agents/skills/launch/SKILL.md`) for multi-instance work

### Extensions
- Built-in extensions in `/extensions` follow standard VS Code extension structure
- Never edit files in `node_modules` directly
- Marketplace extensions are in `extensions/` subdirectories (each has `package.json`)

## Finding Code

1. **Feature search**: Grep for UI strings (localized) or feature keywords
2. **Error messages**: `grep -r "<error text>" src/`
3. **Imports**: Follow imports upward to find the actual implementation
4. **Tests**: Often reveal usage patterns; check `*.test.ts` files alongside source
5. **Architecture flow**: `src/vs/base/` → `platform/` → `editor/` → `workbench/`

## Additional Resources

- `.github/copilot-instructions.md` - Detailed project overview and coding guidelines
- `.github/instructions/` - Topic-specific agent instructions
- `.agents/skills/launch/` - Isolated debugging/automation skill
- `CONTRIBUTING.md` - How to contribute
- `product.json` - Product naming/IDs (where Autopilot branding lives)
