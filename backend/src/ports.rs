use crate::contracts::runtime_id;
use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, Ipv4Addr, TcpListener};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct PortLeaseManager {
    leases: Arc<Mutex<HashMap<String, PortLease>>>,
    start: u16,
    end: u16,
}

struct PortLease {
    ports: Vec<u16>,
    _listeners: Vec<TcpListener>,
}

impl Default for PortLeaseManager {
    fn default() -> Self {
        Self::from_environment()
    }
}

impl PortLeaseManager {
    pub fn from_environment() -> Self {
        let start = std::env::var("AUTOMATE_PLUS_PORT_START")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(49152);
        let end = std::env::var("AUTOMATE_PLUS_PORT_END")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(49251);
        Self {
            leases: Arc::new(Mutex::new(HashMap::new())),
            start,
            end,
        }
    }

    pub fn reserve(
        &self,
        run_id: &str,
        device_id: &str,
        count: usize,
    ) -> Result<(String, Vec<u16>), String> {
        if count == 0 || self.start < 1024 || self.end < self.start {
            return Err("Invalid offline port lease range.".to_string());
        }
        let range_size = u32::from(self.end) - u32::from(self.start) + 1;
        if u32::try_from(count).unwrap_or(u32::MAX) > range_size {
            return Err(format!(
                "Port lease count {count} exceeds configured range."
            ));
        }
        let mut guard = self
            .leases
            .lock()
            .map_err(|_| "Port lease state is poisoned.".to_string())?;
        let used = guard
            .values()
            .flat_map(|lease| lease.ports.iter().copied())
            .collect::<std::collections::HashSet<_>>();
        let mut ports = Vec::new();
        let mut listeners = Vec::new();
        for value in u32::from(self.start)..=u32::from(self.end) {
            if ports.len() == count {
                break;
            }
            let port = value as u16;
            if used.contains(&port) {
                continue;
            }
            if let Ok(listener) = TcpListener::bind((IpAddr::V4(Ipv4Addr::LOCALHOST), port)) {
                listeners.push(listener);
                ports.push(port);
            }
        }
        if ports.len() != count {
            return Err(format!(
                "Unable to reserve {count} loopback ports in {}-{}.",
                self.start, self.end
            ));
        }
        let _ = (run_id, device_id);
        let lease_id = runtime_id("port-lease");
        guard.insert(
            lease_id.clone(),
            PortLease {
                ports: ports.clone(),
                _listeners: listeners,
            },
        );
        Ok((lease_id, ports))
    }

    pub fn release(&self, lease_id: &str) -> Result<bool, String> {
        Ok(self
            .leases
            .lock()
            .map_err(|_| "Port lease state is poisoned.".to_string())?
            .remove(lease_id)
            .is_some())
    }

    pub fn validate(&self, ports: &[u16]) -> Result<(), String> {
        let mut unique = HashSet::new();
        for port in ports {
            if *port < 1024 || !unique.insert(*port) {
                return Err("Port list contains an invalid or duplicate port.".to_string());
            }
            if TcpListener::bind((IpAddr::V4(Ipv4Addr::LOCALHOST), *port)).is_err() {
                return Err(format!("Loopback port {port} is unavailable."));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::PortLeaseManager;

    #[test]
    fn concurrent_leases_are_unique_and_releasable() {
        let manager = PortLeaseManager {
            leases: Default::default(),
            start: 49152,
            end: 49200,
        };
        let (_, first) = manager
            .reserve("run-a", "device-a", 4)
            .expect("first lease");
        let (second_id, second) = manager
            .reserve("run-b", "device-b", 4)
            .expect("second lease");
        assert!(first.iter().all(|port| !second.contains(port)));
        assert!(manager.release(&second_id).expect("release"));
    }
}
