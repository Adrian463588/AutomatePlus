use crate::contracts::{NativeDialogPickArgs, NativeDialogPickMode, PROTOCOL_VERSION};
use rfd::FileDialog;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub fn pick(args: NativeDialogPickArgs) -> Result<Value, String> {
    args.validate()?;
    let NativeDialogPickArgs {
        mode,
        title,
        initial_path,
        filters,
    } = args;

    let mut dialog = FileDialog::new();
    if let Some(title) = title {
        dialog = dialog.set_title(title.trim());
    }
    if let Some(initial_path) = initial_path {
        let initial_directory = initial_directory(&initial_path, &mode)?;
        dialog = dialog.set_directory(initial_directory);
    }
    if matches!(&mode, NativeDialogPickMode::File) {
        for filter in filters {
            let extensions = filter
                .extensions
                .iter()
                .map(|extension| extension.strip_prefix('.').unwrap_or(extension))
                .collect::<Vec<_>>();
            dialog = dialog.add_filter(filter.name.trim(), &extensions);
        }
    }

    let selected = match &mode {
        NativeDialogPickMode::Folder => dialog.pick_folder(),
        NativeDialogPickMode::File => dialog.pick_file(),
    };
    let canonical = selected
        .map(|path| canonical_selected_path(&path, &mode))
        .transpose()?;
    let cancelled = canonical.is_none();
    let selected_path = canonical.map(|path| path.to_string_lossy().into_owned());

    Ok(json!({
        "protocolVersion": PROTOCOL_VERSION,
        "selectedPath": selected_path,
        "cancelled": cancelled,
    }))
}

fn initial_directory(path: &str, mode: &NativeDialogPickMode) -> Result<PathBuf, String> {
    let canonical = Path::new(path)
        .canonicalize()
        .map_err(|error| format!("Native dialog initialPath is unavailable: {error}"))?;
    if is_network_path(&canonical) {
        return Err("Native dialog initialPath resolved to a network path.".to_owned());
    }
    match mode {
        NativeDialogPickMode::Folder if !canonical.is_dir() => Err(
            "Native dialog initialPath must be an existing directory for folder mode.".to_owned(),
        ),
        NativeDialogPickMode::Folder => Ok(canonical),
        NativeDialogPickMode::File if canonical.is_dir() => Ok(canonical),
        NativeDialogPickMode::File => canonical
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "Native dialog initialPath has no usable parent directory.".to_owned()),
    }
}

fn canonical_selected_path(path: &Path, mode: &NativeDialogPickMode) -> Result<PathBuf, String> {
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Unable to canonicalize selected path: {error}"))?;
    if is_network_path(&canonical) {
        return Err("Native dialog selected path cannot be a network path.".to_owned());
    }
    match mode {
        NativeDialogPickMode::Folder if canonical.is_dir() => Ok(canonical),
        NativeDialogPickMode::File if canonical.is_file() => Ok(canonical),
        NativeDialogPickMode::Folder => {
            Err("Native dialog returned a path that is not a directory.".to_owned())
        }
        NativeDialogPickMode::File => {
            Err("Native dialog returned a path that is not a file.".to_owned())
        }
    }
}

fn is_network_path(path: &Path) -> bool {
    let text = path.to_string_lossy();
    text.starts_with("\\\\") || text.starts_with("//")
}
