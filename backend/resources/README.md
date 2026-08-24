# Native resource staging

This directory is the Tauri bundle resource root. Release builds populate it
from the verified sidecar and runtime-pack inputs immediately before bundling;
the repository does not ship an unverified runtime or a placeholder executable.
