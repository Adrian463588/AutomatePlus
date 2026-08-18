use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Component, Path, PathBuf};

pub const CATALOG_SCHEMA_VERSION: u32 = 1;
pub const TARGET_ARCHITECTURE: &str = "win-x64";

/// The catalog is deliberately data-only. It is never fetched from a remote
/// endpoint; a release or an explicit local import must provide this file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCatalog {
    pub schema_version: u32,
    pub product: String,
    pub architecture: String,
    pub entries: Vec<RuntimeCatalogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCatalogEntry {
    pub id: String,
    pub category: RuntimeCategory,
    pub version: Option<String>,
    pub architecture: String,
    pub source: RuntimeSource,
    pub archive: RuntimeArchive,
    pub license: RuntimeLicense,
    pub provides: Vec<String>,
    pub requires: Vec<String>,
    pub health_command: Vec<String>,
    pub generator_ids: Vec<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub review_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeCategory {
    Bootstrap,
    Web,
    Api,
    Android,
    Library,
    Build,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSource {
    pub url: Option<String>,
    pub allowed_host: Option<String>,
    pub sha256: Option<String>,
    pub size_bytes: Option<u64>,
    #[serde(default)]
    pub official_reference: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeArchive {
    pub format: RuntimeArchiveFormat,
    pub executable_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeArchiveFormat {
    Zip,
    #[serde(rename = "tar.gz")]
    TarGz,
    Msi,
    Directory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeLicense {
    pub spdx: Option<String>,
    pub url: Option<String>,
    pub sha256: Option<String>,
    #[serde(default)]
    pub official_reference: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogValidation {
    pub valid: bool,
    pub errors: Vec<String>,
    pub missing_generator_ids: Vec<String>,
    pub duplicate_ids: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct HttpsSource {
    pub host: String,
    pub request_target: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRootCandidate {
    pub path: PathBuf,
    pub exists: bool,
    pub is_directory: bool,
    pub writable: bool,
}

pub const EXPECTED_GENERATOR_IDS: &[&str] = &[
    "playwright-typescript",
    "playwright-javascript",
    "playwright-python",
    "playwright-java",
    "cypress-typescript",
    "cypress-javascript",
    "puppeteer-typescript",
    "puppeteer-javascript",
    "selenium-typescript",
    "selenium-javascript",
    "selenium-python",
    "selenium-java",
    "robot-robot",
    "appium-java",
    "appium-kotlin",
    "appium-typescript",
    "appium-javascript",
    "espresso-kotlin",
    "espresso-java",
    "robolectric-kotlin",
    "robolectric-java",
    "maestro-yaml",
    "k6-javascript",
    "http-typescript",
    "http-javascript",
    "http-python",
    "http-java",
];

impl RuntimeCatalog {
    pub fn load(path: &Path) -> Result<Self, String> {
        let text = fs::read_to_string(path).map_err(|error| {
            format!(
                "Unable to read runtime catalog '{}': {error}",
                path.display()
            )
        })?;
        let catalog = serde_json::from_str::<Self>(&text).map_err(|error| {
            format!(
                "Runtime catalog '{}' is not valid JSON: {error}",
                path.display()
            )
        })?;
        let validation = catalog.validate();
        if !validation.valid {
            return Err(format_catalog_errors(&validation));
        }
        Ok(catalog)
    }

    pub fn validate(&self) -> CatalogValidation {
        let mut errors = Vec::new();
        if self.schema_version != CATALOG_SCHEMA_VERSION {
            errors.push(format!(
                "Unsupported runtime catalog schema {}; expected {}.",
                self.schema_version, CATALOG_SCHEMA_VERSION
            ));
        }
        if self.product != "AutomatePlus" {
            errors.push("Runtime catalog product must be AutomatePlus.".to_owned());
        }
        if self.architecture != TARGET_ARCHITECTURE {
            errors.push(format!(
                "Runtime catalog architecture '{}' is not supported; expected '{}'.",
                self.architecture, TARGET_ARCHITECTURE
            ));
        }

        let mut seen = HashSet::new();
        let mut duplicate_ids = Vec::new();
        let mut covered_generators = HashSet::new();
        for entry in &self.entries {
            if !seen.insert(entry.id.clone()) {
                duplicate_ids.push(entry.id.clone());
            }
            covered_generators.extend(entry.generator_ids.iter().cloned());
            validate_entry(entry, &mut errors);
        }

        duplicate_ids.sort();
        duplicate_ids.dedup();
        let missing_generator_ids = EXPECTED_GENERATOR_IDS
            .iter()
            .filter(|id| !covered_generators.contains(**id))
            .map(|id| (*id).to_owned())
            .collect::<Vec<_>>();
        if !missing_generator_ids.is_empty() {
            errors.push(format!(
                "Runtime catalog does not cover generator ids: {}.",
                missing_generator_ids.join(", ")
            ));
        }
        if !duplicate_ids.is_empty() {
            errors.push(format!(
                "Runtime catalog contains duplicate pack ids: {}.",
                duplicate_ids.join(", ")
            ));
        }

        CatalogValidation {
            valid: errors.is_empty(),
            errors,
            missing_generator_ids,
            duplicate_ids,
        }
    }
}

pub fn format_catalog_errors(validation: &CatalogValidation) -> String {
    if validation.errors.is_empty() {
        return "Runtime catalog is valid.".to_owned();
    }
    validation.errors.join(" ")
}

fn validate_entry(entry: &RuntimeCatalogEntry, errors: &mut Vec<String>) {
    let needs_review = entry.status.as_deref() == Some("NeedsReview");
    if !is_safe_identifier(&entry.id) {
        errors.push(format!("Pack id '{}' is not a safe identifier.", entry.id));
    }
    if !needs_review
        && entry.version.as_deref().map_or(true, |version| {
            version.trim().is_empty() || version.chars().any(char::is_whitespace)
        })
    {
        errors.push(format!("Pack '{}' has an invalid version.", entry.id));
    }
    if entry.architecture != TARGET_ARCHITECTURE {
        errors.push(format!(
            "Pack '{}' targets unsupported architecture '{}'.",
            entry.id, entry.architecture
        ));
    }
    match (&entry.source.url, &entry.source.allowed_host) {
        (Some(url), Some(host)) => match parse_https_source(url) {
            Ok(source) => {
                if !source.host.eq_ignore_ascii_case(host.trim()) {
                    errors.push(format!(
                        "Pack '{}' source host '{}' does not match allowedHost '{}'.",
                        entry.id, source.host, host
                    ));
                }
            }
            Err(error) => errors.push(format!("Pack '{}' source is invalid: {error}", entry.id)),
        },
        (None, None) if needs_review && entry.source.official_reference.is_some() => {}
        _ => errors.push(format!(
            "Pack '{}' source URL/allowedHost pair is incomplete.",
            entry.id
        )),
    }
    if !needs_review && !entry.source.sha256.as_deref().is_some_and(is_sha256) {
        errors.push(format!(
            "Pack '{}' source SHA-256 is missing or invalid.",
            entry.id
        ));
    }
    if !needs_review && entry.source.size_bytes.unwrap_or_default() == 0 {
        errors.push(format!(
            "Pack '{}' source size must be greater than zero.",
            entry.id
        ));
    }
    if !needs_review && entry.archive.executable_paths.is_empty() {
        errors.push(format!("Pack '{}' has no executable allowlist.", entry.id));
    }
    for path in &entry.archive.executable_paths {
        if !is_safe_relative_path(path) {
            errors.push(format!(
                "Pack '{}' contains an unsafe executable path '{}'.",
                entry.id, path
            ));
        }
    }
    if !needs_review
        && entry
            .license
            .spdx
            .as_deref()
            .unwrap_or_default()
            .trim()
            .is_empty()
    {
        errors.push(format!(
            "Pack '{}' is missing SPDX license metadata.",
            entry.id
        ));
    }
    if let Some(url) = &entry.license.url {
        if let Err(error) = parse_https_source(url) {
            errors.push(format!(
                "Pack '{}' license URL is invalid: {error}",
                entry.id
            ));
        }
    } else if !needs_review && entry.license.official_reference.is_none() {
        errors.push(format!("Pack '{}' license URL is missing.", entry.id));
    }
    if let Some(sha256) = &entry.license.sha256 {
        if !is_sha256(sha256) {
            errors.push(format!("Pack '{}' license SHA-256 is invalid.", entry.id));
        }
    }
    if !needs_review
        && (entry.health_command.is_empty()
            || entry.health_command.iter().any(|part| {
                part.trim().is_empty() || part.chars().any(|character| "\0\r\n".contains(character))
            }))
    {
        errors.push(format!("Pack '{}' health command is invalid.", entry.id));
    }
    if entry
        .provides
        .iter()
        .chain(entry.requires.iter())
        .chain(entry.generator_ids.iter())
        .any(|value| value.trim().is_empty())
    {
        errors.push(format!(
            "Pack '{}' contains an empty capability mapping.",
            entry.id
        ));
    }
}

pub fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value.bytes().all(|byte| byte.is_ascii_hexdigit())
        && value.bytes().any(|byte| byte != b'0')
}

pub fn is_safe_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

/// Validate a path before it is joined to an installation directory. Both
/// slash styles are rejected for a backslash-containing path so Windows paths
/// cannot smuggle a drive, UNC prefix, or parent traversal into an archive.
pub fn is_safe_relative_path(value: &str) -> bool {
    if value.is_empty() || value.contains('\0') || value.contains('\\') || value.starts_with('/') {
        return false;
    }
    let path = Path::new(value);
    if path.is_absolute() {
        return false;
    }
    !path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    })
}

pub fn parse_https_source(value: &str) -> Result<HttpsSource, String> {
    let remainder = value
        .strip_prefix("https://")
        .ok_or_else(|| "source must use HTTPS.".to_owned())?;
    if remainder.is_empty() || remainder.contains('#') || remainder.contains('@') {
        return Err("source must contain an HTTPS host without userinfo or fragments.".to_owned());
    }
    let authority_end = remainder.find(['/', '?']).unwrap_or(remainder.len());
    let authority = &remainder[..authority_end];
    let (host, port) = match authority.rsplit_once(':') {
        Some((host, port)) if !host.contains(']') => {
            let port = port
                .parse::<u16>()
                .map_err(|_| "source port is invalid.".to_owned())?;
            (host, port)
        }
        _ => (authority, 443),
    };
    if port != 443
        || host.is_empty()
        || host.starts_with('.')
        || host.ends_with('.')
        || !host
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '-'))
    {
        return Err("source host or port is invalid.".to_owned());
    }
    let suffix = &remainder[authority_end..];
    let request_target = if suffix.is_empty() {
        "/".to_owned()
    } else if suffix.starts_with('?') {
        format!("/{suffix}")
    } else {
        suffix.to_owned()
    };
    Ok(HttpsSource {
        host: host.to_ascii_lowercase(),
        request_target,
    })
}

pub fn workspace_root() -> PathBuf {
    env::var_os("AUTOMATE_PLUS_WORKSPACE")
        .map(PathBuf::from)
        .or_else(|| env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn discover_known_roots(
    workspace: &Path,
    selected_root: Option<&Path>,
) -> Vec<RuntimeRootCandidate> {
    let mut paths = Vec::new();
    if let Some(path) = selected_root {
        paths.push(path.to_path_buf());
    }
    paths.push(workspace.join("runtime-packs"));
    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        paths.push(
            PathBuf::from(local_app_data)
                .join("AutomatePlus")
                .join("runtime-packs"),
        );
    }
    if let Some(program_data) = env::var_os("ProgramData") {
        paths.push(
            PathBuf::from(program_data)
                .join("AutomatePlus")
                .join("runtime-packs"),
        );
    }
    paths.push(workspace.join("resources").join("runtime-packs"));
    if let Ok(executable) = env::current_exe() {
        if let Some(parent) = executable.parent() {
            paths.push(parent.join("resources").join("runtime-packs"));
        }
    }

    let mut seen = HashSet::new();
    paths
        .into_iter()
        .filter_map(|path| {
            let key = normalized_key(&path);
            if !seen.insert(key) {
                return None;
            }
            let metadata = fs::metadata(&path).ok();
            Some(RuntimeRootCandidate {
                path,
                exists: metadata.is_some(),
                is_directory: metadata.as_ref().is_some_and(std::fs::Metadata::is_dir),
                writable: metadata.as_ref().is_some_and(|_| is_writable(&path)),
            })
        })
        .collect()
}

pub fn is_writable(path: &Path) -> bool {
    if path.is_dir() {
        let probe = path.join(format!(".automate-plus-write-test-{}", std::process::id()));
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&probe)
        {
            Ok(_) => fs::remove_file(probe).is_ok(),
            Err(_) => false,
        }
    } else {
        path.parent().is_some_and(is_writable)
    }
}

pub fn normalized_key(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_https_and_mismatched_hosts() {
        assert!(parse_https_source("http://example.test/a").is_err());
        let source = parse_https_source("https://example.test/a?x=1").expect("valid source");
        assert_eq!(source.host, "example.test");
        assert_eq!(source.request_target, "/a?x=1");
    }

    #[test]
    fn rejects_archive_traversal_and_absolute_paths() {
        assert!(!is_safe_relative_path("../outside.exe"));
        assert!(!is_safe_relative_path("C:/outside.exe"));
        assert!(!is_safe_relative_path("\\\\server\\share"));
        assert!(is_safe_relative_path("bin/tool.exe"));
    }

    #[test]
    fn rejects_zero_or_short_hashes() {
        assert!(!is_sha256(&"0".repeat(64)));
        assert!(!is_sha256("abc"));
        assert!(is_sha256(&format!("{}1", "0".repeat(63))));
    }
}
