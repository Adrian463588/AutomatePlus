# Offline runtime packs

This directory is the local installation boundary for verified runtimes. The
repository intentionally contains no third-party binaries. An imported pack
must add a manifest entry with its version, architecture, executable path,
SHA-256, license file, and health command before the capability can become
`Ready`.

An empty `packs` array means the runtime is `Blocked`; the application must not
download or install a dependency during a test run.
