# Autopilot v0.1.0

Initial release of Autopilot.

Files are split into 90 MB parts to stay under GitHub's file size limit.

## How to Use

**Windows:** Double-click `join.bat` (or run `join.ps1` in PowerShell) to reassemble all archives, then extract the one you need.

**macOS / Linux:** Run `cat autopilot-darwin-arm64.part*.zip > autopilot-darwin-arm64.zip` (adjust for your platform).

| Platform | Parts | Joined File |
|----------|-------|-------------|
| Windows x64 | `autopilot-win32-x64.part001-004.zip` | `autopilot-win32-x64.zip` |
| macOS ARM64 | `autopilot-darwin-arm64.part001-004.zip` | `autopilot-darwin-arm64.zip` |
| macOS x64 | `autopilot-darwin-x64.part001-004.zip` | `autopilot-darwin-x64.zip` |
| Linux x64 | `autopilot-linux-x64.part001-004.tar.gz` | `autopilot-linux-x64.tar.gz` |

After joining, extract and run per standard instructions.

> **Note:** This repo contains large build artifacts (~1.4 GB). Cloning the full repo will be larger than a source-only clone. Old version folders are removed when new ones are added.
