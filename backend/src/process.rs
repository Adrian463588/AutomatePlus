use std::collections::HashMap;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

#[derive(Default, Clone)]
pub struct ProcessSupervisor {
    children: Arc<Mutex<HashMap<u32, Child>>>,
}

impl ProcessSupervisor {
    pub fn start(&self, root: &Path, executable: &str, args: &[String]) -> Result<u32, String> {
        let allowed = ["adb", "appium", "scrcpy", "node", "sidecar"];
        let name = executable.to_ascii_lowercase();
        if !allowed.contains(&name.as_str()) {
            return Err(format!("Executable '{executable}' is not allowlisted."));
        }
        let path = crate::preflight::verified_tool_path(root, &name).ok_or_else(|| {
            format!("Executable '{name}' is missing from verified runtime-packs.")
        })?;
        let child = Command::new(path)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| error.to_string())?;
        let id = child.id();
        self.children
            .lock()
            .map_err(|_| "Process state is unavailable".to_owned())?
            .insert(id, child);
        Ok(id)
    }

    pub fn stop(&self, id: u32) -> Result<bool, String> {
        let Some(mut child) = self
            .children
            .lock()
            .map_err(|_| "Process state is unavailable".to_owned())?
            .remove(&id)
        else {
            return Ok(false);
        };
        #[cfg(windows)]
        {
            let _ = Command::new(r"C:\Windows\System32\taskkill.exe")
                .args(["/PID", &id.to_string(), "/T", "/F"])
                .status();
        }
        #[cfg(not(windows))]
        {
            let _ = child.kill();
        }
        let _ = child.wait();
        Ok(true)
    }
}
