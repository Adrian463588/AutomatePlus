use std::collections::HashMap;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

const MAX_SUPERVISED_PROCESSES: usize = 32;
const PROCESS_STOP_TIMEOUT: Duration = Duration::from_secs(10);
const PROCESS_FORCE_KILL_TIMEOUT: Duration = Duration::from_secs(2);

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
        let mut children = self
            .children
            .lock()
            .map_err(|_| "Process state is unavailable".to_owned())?;
        reap_finished(&mut children);
        if children.len() >= MAX_SUPERVISED_PROCESSES {
            return Err(format!(
                "Process supervisor reached its {MAX_SUPERVISED_PROCESSES}-process safety limit."
            ));
        }
        let child = Command::new(path)
            .args(args)
            .stdin(Stdio::null())
            // The supervisor does not consume child output. Piped stdout or
            // stderr can fill the OS buffer when Appium is verbose and leave
            // the worker blocked forever. Farm evidence is recorded from
            // protocol responses and per-device artifacts instead.
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        let id = child.id();
        children.insert(id, child);
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
        terminate_child(id, &mut child);
        Ok(true)
    }
}

impl Drop for ProcessSupervisor {
    fn drop(&mut self) {
        if Arc::strong_count(&self.children) != 1 {
            return;
        }
        let children = self
            .children
            .lock()
            .map(|mut children| children.drain().collect::<Vec<_>>())
            .unwrap_or_default();
        for (id, mut child) in children {
            terminate_child(id, &mut child);
        }
    }
}

fn reap_finished(children: &mut HashMap<u32, Child>) {
    children.retain(|_, child| matches!(child.try_wait(), Ok(None)));
}

fn terminate_child(id: u32, child: &mut Child) {
    #[cfg(windows)]
    if let Ok(mut taskkill) = Command::new(r"C:\Windows\System32\taskkill.exe")
        .args(["/PID", &id.to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        let _ = wait_for_exit(&mut taskkill, PROCESS_FORCE_KILL_TIMEOUT);
    }
    #[cfg(not(windows))]
    let _ = child.kill();

    let _ = wait_for_exit(child, PROCESS_STOP_TIMEOUT);
}

fn wait_for_exit(child: &mut Child, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return true,
            Err(_) => return false,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                let _ = child.kill();
                let force_deadline = Instant::now() + PROCESS_FORCE_KILL_TIMEOUT;
                while Instant::now() < force_deadline {
                    match child.try_wait() {
                        Ok(Some(_)) => return true,
                        Err(_) => return false,
                        Ok(None) => thread::sleep(Duration::from_millis(25)),
                    }
                }
                return false;
            }
        }
    }
}
