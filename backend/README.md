# AutomatePlus native host

This directory contains the Tauri 2/Rust native boundary. Tauri exposes one
versioned IPC dispatch command to the React renderer. Rust owns ADB discovery,
SQLite migrations, leases, ports, process cleanup, and truthful blocked-state
responses.

`npm run native:build` performs an offline preflight before staging the real
renderer and verified runtime packs. It requires a locally cached Cargo/Tauri
toolchain, fixed WebView2 runtime, and checksum-verified packs. Missing inputs
stop the build; no dependency download is attempted.

No device, process, runtime pack, or successful farm result is synthesized.
