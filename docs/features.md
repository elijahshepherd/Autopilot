# Autopilot Features

## Overview
Autopilot is an open-source editor built on the foundation of Visual Studio Code, with a strong focus on AI-assisted coding and computer tasks. It is free to use under a Bring Your Own Key (BYOK) model, meaning you provide your own API keys from any AI provider.

## Key Features

### Always BYOK (Bring Your Own Key)
Autopilot’s Agents window always operates in BYOK mode. You can use your own API keys from providers such as OpenAI, Anthropic, or any other service. There are no subscriptions, usage caps, or vendor lock-ins.

### Blazing Fast Response Times
The AI request pipeline has been optimized for speed. Tasks that might take hours elsewhere can be completed in a single coffee break. You spend less time waiting and more time getting work done.

### Auto – The Built-in AI Agent
Auto is a purpose-built AI agent designed to handle coding tasks autonomously. It can:
- Read your codebase
- Make changes to files
- Run commands
- Explain its work
You interact with Auto through the Agents window or the sidebar chat.

### Dedicated Agent Window
Click "Agent" in the top-right to open a separate window focused on AI-driven work. This window has its own logo and is free of IDE clutter, allowing the AI to work without distractions.

### Flexible AI Permission Levels
You can control how much autonomy the AI has by choosing from four permission levels:
- **Strict**: The AI must ask for permission before performing actions beyond chatting (e.g., running commands, writing files, reading files, searching the web).
- **Non-Strict**: Allows the AI to read files, search the web, and perform other minor tasks, but not write files.
- **Bypass**: Allows the AI to do almost anything. Commands that could be dangerous require your explicit permission (accept/deny).
- **Takeoff**: When enabled, the AI skips asking for permission and assumes you are away. This is the main autopilot mode for unattended work.

### Full VS Code Compatibility
Autopilot retains full compatibility with VS Code extensions, themes, and workflows. All your favorite tools work out of the box.

### Cross-Platform Support
Autopilot runs on Windows, macOS, and Linux.

## Fli Mode (Future Feature)
A Fli (pronounced like "fly") is a specialized mode within the Agent window designed for very specific tasks. Unlike general agents or custom agents, Fli modes provide domain-specific knowledge and tools tailored to particular workflows.

For example, a "Roblox Development" Fli would equip the AI with information about Lua, Python, and Roblox development in general, including knowledge of how to use Rojo for Roblox studio workflows.

### How it Appears in UI
Inside the Agents window, the Fli selector is positioned directly beside the Agent button. By default, it is set to "None".

### Where to Use It
Fli modes are exclusive to the Agents window and represent an "I do it all" approach rather than an assistant feature. When activated, the entire chat context—including plan, agent, and ask functions—operates with the specialized knowledge of the selected Fli.

## Getting Started
To begin using Autopilot:
1. Clone or download this repository.
2. Follow the setup instructions in the README to build and run the editor.
3. Add your own API keys in the Agents window settings to start using Auto.

## Support
This repository accepts issue reports for bugs and feature requests. For general questions, refer to the documentation or community resources.

---
*Documentation created for the Autopilot project.*
