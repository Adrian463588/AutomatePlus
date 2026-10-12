# AutomatePlus Official Releases & Direct Downloads

Official offline binary releases for **AutomatePlus** on Windows x64.
All releases are bundled for standalone offline execution with no cloud telemetry or mandatory internet connectivity.

---

## 🚀 Latest Stable Release: v1.7.0

- **Release Date**: October 13, 2026
- **Architecture**: Windows x64 (Tauri 2 + Rust Native Host / React 18 TypeScript Renderer)
- **Direct Download**: [AutomatePlus-v1.7.0-win-x64.zip](https://github.com/Adrian463588/AutomatePlus/releases/download/v1.7.0/AutomatePlus-v1.7.0-win-x64.zip)
- **Latest Release Page**: [GitHub Releases (Latest)](https://github.com/Adrian463588/AutomatePlus/releases/latest)

### What's New in v1.7.0
1. **Model Context Protocol (MCP) Server (RFC 2.0)**:
   - Complete agentic AI integration via local stdio JSON-RPC 2.0 (`scripts/mcp-server.mjs`) and UI service (`frontend/src/services/mcpBridge.ts`).
   - `run_automation_task`: Orchestrates automated runs across Web, Appium, Phone Farming, and k6 load testing with structured logs and status.
   - `inspect_element_context`: Local DevTools / UIAutomator inspection returning DOM accessibility trees and Android UI hierarchies with ranked selectors.
   - `generate_runnable_test_script`: Synthesizes clean, production-ready standalone scripts without stubs or placeholders.
2. **k6 Constant-Arrival-Rate Load Testing Engine**: Full schema validation and deterministic script synthesis.
3. **100% Offline Gates**: Complete DevSecOps verification, zero lint/format/type errors, and verified unit test suites.

---

## 📦 Historical Release Archive

| Version | Release Date | Architecture | Direct Download Link | Key Changes |
|---|---|---|---|---|
| **v1.7.0** | 2026-10-13 | Win x64 (Tauri 2 + Rust) | [Download v1.7.0](https://github.com/Adrian463588/AutomatePlus/releases/download/v1.7.0/AutomatePlus-v1.7.0-win-x64.zip) | Standardized MCP Server (RFC 2.0), agentic runner bridge, k6 load generator |
| **v1.6.0** | 2026-10-12 | Win x64 (Tauri 2 + Rust) | [Download v1.6.0](https://github.com/Adrian463588/AutomatePlus/releases/download/v1.6.0/AutomatePlus-v1.6.0-win-x64.zip) | 27-Generator matrix audit, 8-candidate self-healing locators, initial MCP tools |
| **v1.5.0** | 2026-10-12 | Win x64 (Tauri 2 + Rust) | [Download v1.5.0](https://github.com/Adrian463588/AutomatePlus/releases/download/v1.5.0/AutomatePlus-v1.5.0-win-x64.zip) | Interactive WebDriver Canvas Viewport (SauceDemo / OrangeHRM POV) |
| **v1.4.0** | 2026-10-12 | Win x64 (Tauri 2 + Rust) | [Download v1.4.0](https://github.com/Adrian463588/AutomatePlus/releases/download/v1.4.0/AutomatePlus-v1.4.0-win-x64.zip) | Multi-device Android phone farm replay runner with 3x looping |
| **v1.3.0** | 2026-10-12 | Win x64 (Tauri 2 + Rust) | [Download v1.3.0](https://github.com/Adrian463588/AutomatePlus/releases/download/v1.3.0/AutomatePlus-v1.3.0-win-x64.zip) | Android interactive in-app click-and-run executor and Appium projection |
| **v1.2.0** | 2026-10-12 | Win x64 (Tauri 2 + Rust) | [Download v1.2.0](https://github.com/Adrian463588/AutomatePlus/releases/download/v1.2.0/AutomatePlus-v1.2.0-win-x64.zip) | Web interactive click-and-run executor with Playwright & Cypress projection |
| **v1.1.0** | 2026-10-12 | Win x64 (Tauri 2 + Rust) | [Download v1.1.0](https://github.com/Adrian463588/AutomatePlus/releases/download/v1.1.0/AutomatePlus-v1.1.0-win-x64.zip) | Action parameterization, accessibility/ARIA enhancements, DevSecOps hardening |
| **v1.0.0** | 2026-10-09 | Win x64 (Tauri 2 + Rust) | [Download v1.0.0](https://github.com/Adrian463588/AutomatePlus/releases/download/v1.0.0/AutomatePlus-v1.0.0-win-x64.zip) | Initial release: 27 polyglot generators, phone farm, API suite, dark workbench |

---

## 💻 System Requirements

- **Operating System**: Windows 10 (Version 1903+) or Windows 11 (64-bit)
- **WebView2**: Microsoft Edge WebView2 Runtime (pre-installed on Windows 11 and recent Windows 10 updates)
- **RAM**: Minimum 4 GB, Recommended 8 GB+
- **Disk Space**: ~250 MB for desktop client; ~1.5 GB for full optional local runtime packs (ADB, Appium, Python, Maven, k6)
- **Network**: Fully offline; internet only required when executing user-requested E2E flows against public test endpoints

---

## ⚡ Quick Start: 1-Click Execution

1. Download and extract `AutomatePlus-v1.7.0-win-x64.zip`.
2. Double-click `Run-AutomatePlus.bat`.
3. The launcher automatically binds to a local loopback port and opens the desktop workbench.
4. For AI Agent connection via Model Context Protocol:
   ```json
   {
     "mcpServers": {
       "automateplus": {
         "command": "node",
         "args": ["scripts/mcp-server.mjs"]
       }
     }
   }
   ```
