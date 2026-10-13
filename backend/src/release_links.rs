pub fn allowed(url: &str) -> bool {
    let root = "https://github.com/Adrian463588/AutomatePlus/releases";
    let version = env!("CARGO_PKG_VERSION");
    [
        root.to_owned(),
        format!("{root}/tag/v1.7.0"),
        format!("{root}/download/v{version}/SHA256SUMS.txt"),
        format!("{root}/download/v{version}/AutomatePlus-v{version}-windows-x64.zip"),
    ]
    .iter()
    .any(|candidate| candidate == url)
}

pub fn open(url: &str) -> Result<(), String> {
    if !allowed(url) {
        return Err("Only the declared AutomatePlus release links may be opened.".to_owned());
    }
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};
        let operation = "open\0".encode_utf16().collect::<Vec<_>>();
        let destination = format!("{url}\0").encode_utf16().collect::<Vec<_>>();
        // The exact allowlist above excludes local files, credentials and arbitrary
        // URI handlers. This is an explicit user action, not runtime onboarding.
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                operation.as_ptr(),
                destination.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            )
        } as isize;
        if result <= 32 {
            return Err(format!(
                "Windows could not open the release link (code {result})."
            ));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    Err("Native release links require the Windows desktop host.".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn permits_only_current_assets_and_declared_source_history() {
        assert!(allowed(
            "https://github.com/Adrian463588/AutomatePlus/releases"
        ));
        assert!(allowed(
            "https://github.com/Adrian463588/AutomatePlus/releases/tag/v1.7.0"
        ));
        assert!(allowed(&format!(
            "https://github.com/Adrian463588/AutomatePlus/releases/download/v{}/SHA256SUMS.txt",
            env!("CARGO_PKG_VERSION")
        )));
        for url in [
            "file:///C:/Windows/notepad.exe",
            "javascript:alert(1)",
            "https://github.com/another/repo/releases",
            "https://github.com/Adrian463588/AutomatePlus/releases?token=x",
        ] {
            assert!(!allowed(url));
        }
    }
}
