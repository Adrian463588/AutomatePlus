import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const DEFAULT_CATALOG_PATH = join(REPOSITORY_ROOT, 'runtime-packs', 'catalog.json');
export const DEFAULT_WORKSPACE_RUNTIME_ROOT = join(REPOSITORY_ROOT, 'runtime-packs');
export const SUPPORTED_ARCHITECTURE = 'win-x64';
export const CATALOG_SCHEMA_VERSION = 1;

export const CATALOG_CATEGORIES = Object.freeze([
  'bootstrap',
  'web',
  'api',
  'android',
  'library',
  'build',
]);

export const RUNTIME_STATUSES = Object.freeze([
  'Ready',
  'Missing',
  'Scanning',
  'Downloading',
  'Verifying',
  'Installing',
  'Installed',
  'Cancelled',
  'Failed',
  'Blocked',
  'NeedsReview',
]);

export const GENERATOR_IDS = Object.freeze([
  'playwright-typescript',
  'playwright-javascript',
  'playwright-python',
  'playwright-java',
  'cypress-typescript',
  'cypress-javascript',
  'puppeteer-typescript',
  'puppeteer-javascript',
  'selenium-typescript',
  'selenium-javascript',
  'selenium-python',
  'selenium-java',
  'robot-robot',
  'appium-java',
  'appium-kotlin',
  'appium-typescript',
  'appium-javascript',
  'espresso-kotlin',
  'espresso-java',
  'robolectric-kotlin',
  'robolectric-java',
  'maestro-yaml',
  'k6-javascript',
  'http-typescript',
  'http-javascript',
  'http-python',
  'http-java',
]);

const exactVersionPattern = /^(?![~^<>=*]|.*\s|.*\|\|).+$/u;
const sha256Pattern = /^[a-f0-9]{64}$/iu;
const pathSeparatorPattern = /[\\/]/u;
const statusTransitions = Object.freeze({
  Ready: ['Scanning', 'Downloading', 'Verifying', 'Installed', 'NeedsReview', 'Blocked'],
  Missing: ['Scanning', 'Downloading', 'Blocked', 'NeedsReview'],
  Scanning: ['Ready', 'Missing', 'Installed', 'Downloading', 'Failed', 'Cancelled', 'Blocked', 'NeedsReview'],
  Downloading: ['Verifying', 'Cancelled', 'Failed', 'Blocked'],
  Verifying: ['Installing', 'Installed', 'Failed', 'Cancelled', 'Blocked', 'NeedsReview'],
  Installing: ['Installed', 'Failed', 'Cancelled', 'Blocked'],
  Installed: ['Scanning', 'Verifying', 'NeedsReview', 'Blocked'],
  Cancelled: ['Scanning', 'Missing', 'Downloading', 'Blocked'],
  Failed: ['Scanning', 'Missing', 'Downloading', 'Cancelled', 'Blocked'],
  Blocked: ['Scanning', 'Missing', 'Downloading', 'NeedsReview'],
  NeedsReview: ['Scanning', 'Verifying', 'Missing', 'Blocked'],
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalized(value) {
  return String(value).trim().toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}

function pathKey(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function isInside(base, candidate) {
  const resolvedBase = resolve(base);
  const resolvedCandidate = resolve(candidate);
  const prefix = `${resolvedBase}${process.platform === 'win32' ? '\\' : '/'}`;
  return resolvedCandidate === resolvedBase || resolvedCandidate.startsWith(prefix);
}

function isValidSha256(value) {
  return typeof value === 'string' && sha256Pattern.test(value);
}

function isExactVersion(value) {
  return typeof value === 'string' && exactVersionPattern.test(value.trim());
}

function validateHttpsUrl(value, label, errors) {
  if (value === null || value === undefined) return;
  if (!nonEmptyString(value)) {
    errors.push(`${label} must be an HTTPS URL or null`);
    return;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      errors.push(`${label} must use HTTPS without credentials`);
    }
  } catch {
    errors.push(`${label} is not a valid URL`);
  }
}

function validateSource(entry, errors) {
  const source = entry.source;
  if (!isObject(source)) {
    errors.push(`${entry.id}: source must be an object`);
    return;
  }
  const hasUrl = source.url !== null && source.url !== undefined;
  const hasHost = source.allowedHost !== null && source.allowedHost !== undefined;
  const hasSha = source.sha256 !== null && source.sha256 !== undefined;
  const hasSize = source.sizeBytes !== null && source.sizeBytes !== undefined;
  validateHttpsUrl(source.url, `${entry.id}.source.url`, errors);
  if (hasUrl !== hasHost) errors.push(`${entry.id}: source.url and source.allowedHost must be provided together`);
  if (hasUrl && !nonEmptyString(source.allowedHost)) errors.push(`${entry.id}: source.allowedHost must be non-empty`);
  if (hasUrl && hasHost) {
    try {
      const hostname = new URL(source.url).hostname.toLowerCase();
      if (hostname !== normalized(source.allowedHost)) {
        errors.push(`${entry.id}: source.allowedHost must exactly match source.url hostname`);
      }
    } catch {
      // URL error already reported above.
    }
  }
  if (hasSha && !isValidSha256(source.sha256)) errors.push(`${entry.id}: source.sha256 must be a 64-character hexadecimal SHA-256 or null`);
  if (hasSize && (!Number.isSafeInteger(source.sizeBytes) || source.sizeBytes <= 0)) {
    errors.push(`${entry.id}: source.sizeBytes must be a positive integer or null`);
  }
  validateHttpsUrl(source.officialReference, `${entry.id}.source.officialReference`, errors);
}

function validateLicense(entry, errors) {
  if (!isObject(entry.license)) {
    errors.push(`${entry.id}: license must be an object`);
    return;
  }
  if (entry.license.spdx !== null && entry.license.spdx !== undefined && !nonEmptyString(entry.license.spdx)) {
    errors.push(`${entry.id}: license.spdx must be non-empty or null`);
  }
  if (entry.license.sha256 !== null && entry.license.sha256 !== undefined && !isValidSha256(entry.license.sha256)) {
    errors.push(`${entry.id}: license.sha256 must be a 64-character hexadecimal SHA-256 or null`);
  }
  validateHttpsUrl(entry.license.url, `${entry.id}.license.url`, errors);
  validateHttpsUrl(entry.license.officialReference, `${entry.id}.license.officialReference`, errors);
}

function validateArrayOfStrings(value, label, errors, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => !nonEmptyString(item))) {
    errors.push(`${label} must be an array of non-empty strings${allowEmpty ? '' : ' with at least one item'}`);
  }
}

function entryHasPinnedDownloadMetadata(entry) {
  return Boolean(
    isObject(entry)
    &&
    entry.status === 'Ready'
      && isExactVersion(entry.version)
      && isObject(entry.source)
      && nonEmptyString(entry.source.url)
      && nonEmptyString(entry.source.allowedHost)
      && isValidSha256(entry.source.sha256)
      && Number.isSafeInteger(entry.source.sizeBytes)
      && entry.source.sizeBytes > 0
      && isObject(entry.archive)
      && Array.isArray(entry.archive.executablePaths)
      && entry.archive.executablePaths.length > 0
      && isObject(entry.license)
      && nonEmptyString(entry.license.spdx)
      && nonEmptyString(entry.license.url)
      && Array.isArray(entry.healthCommand)
      && entry.healthCommand.length > 0,
  );
}

export function validateCatalog(catalog, { requireGeneratorCoverage = true } = {}) {
  const errors = [];
  const warnings = [];
  if (!isObject(catalog)) return { ok: false, errors: ['catalog must be a JSON object'], warnings, entries: [] };
  if (catalog.schemaVersion !== CATALOG_SCHEMA_VERSION) errors.push(`schemaVersion must be ${CATALOG_SCHEMA_VERSION}`);
  if (catalog.product !== 'AutomatePlus') errors.push('product must be AutomatePlus');
  if (catalog.architecture !== SUPPORTED_ARCHITECTURE) errors.push(`architecture must be ${SUPPORTED_ARCHITECTURE}`);
  if (!Array.isArray(catalog.entries)) errors.push('entries must be an array');
  const entries = Array.isArray(catalog.entries) ? catalog.entries : [];
  const ids = new Set();
  const coveredGenerators = new Set();

  for (const [index, entry] of entries.entries()) {
    const label = `entries[${index}]`;
    if (!isObject(entry)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (!nonEmptyString(entry.id)) errors.push(`${label}.id must be non-empty`);
    if (nonEmptyString(entry.id)) {
      if (ids.has(entry.id)) errors.push(`duplicate catalog id: ${entry.id}`);
      ids.add(entry.id);
    }
    if (!CATALOG_CATEGORIES.includes(entry.category)) errors.push(`${entry.id ?? label}: category is invalid`);
    if (!(entry.version === null && entry.status === 'NeedsReview') && !isExactVersion(entry.version)) {
      errors.push(`${entry.id ?? label}: version must be an exact pinned value or null only for NeedsReview`);
    }
    if (entry.architecture !== SUPPORTED_ARCHITECTURE) errors.push(`${entry.id ?? label}: architecture must be ${SUPPORTED_ARCHITECTURE}`);
    if (!RUNTIME_STATUSES.includes(entry.status)) errors.push(`${entry.id ?? label}: status is invalid`);
    if (!isObject(entry.archive) || !['zip', 'tar.gz', 'msi', 'directory'].includes(entry.archive.format)) {
      errors.push(`${entry.id ?? label}: archive.format is invalid`);
    }
    if (isObject(entry.archive)) validateArrayOfStrings(entry.archive.executablePaths, `${entry.id ?? label}.archive.executablePaths`, errors);
    validateSource(entry, errors);
    validateLicense(entry, errors);
    validateArrayOfStrings(entry.provides, `${entry.id ?? label}.provides`, errors, { allowEmpty: false });
    validateArrayOfStrings(entry.requires, `${entry.id ?? label}.requires`, errors);
    validateArrayOfStrings(entry.generatorIds, `${entry.id ?? label}.generatorIds`, errors);
    validateArrayOfStrings(entry.healthCommand, `${entry.id ?? label}.healthCommand`, errors);
    for (const generatorId of Array.isArray(entry.generatorIds) ? entry.generatorIds : []) coveredGenerators.add(generatorId);

    const sourceComplete = isObject(entry.source)
      && nonEmptyString(entry.source.url)
      && nonEmptyString(entry.source.allowedHost)
      && isValidSha256(entry.source.sha256)
      && Number.isSafeInteger(entry.source.sizeBytes)
      && entry.source.sizeBytes > 0;
    if (entry.status === 'Ready' && !sourceComplete) errors.push(`${entry.id ?? label}: Ready entry lacks pinned source metadata`);
    if (entry.status === 'Ready' && !entryHasPinnedDownloadMetadata(entry)) {
      errors.push(`${entry.id ?? label}: Ready entry lacks pinned archive, license, or health metadata`);
    }
    if (entry.status === 'NeedsReview') {
      if (!nonEmptyString(entry.reviewReason)) errors.push(`${entry.id ?? label}: NeedsReview entry requires reviewReason`);
      if (entry.source?.url === null && !nonEmptyString(entry.source?.officialReference)) {
        errors.push(`${entry.id ?? label}: unresolved source requires officialReference`);
      }
      if (entry.version === null) warnings.push(`${entry.id ?? label}: pinned version is not available; download is blocked`);
      if (!sourceComplete) warnings.push(`${entry.id ?? label}: source checksum/size is not pinned; download is blocked`);
    }
  }

  if (requireGeneratorCoverage) {
    const missingGenerators = GENERATOR_IDS.filter((id) => !coveredGenerators.has(id));
    if (missingGenerators.length > 0) errors.push(`catalog does not map all 27 generators: ${missingGenerators.join(', ')}`);
  }
  const unresolvedEntries = entries.filter((entry) => entry?.status === 'NeedsReview' || !entryHasPinnedDownloadMetadata(entry));
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    entries,
    unresolvedEntries,
    coveredGenerators: [...coveredGenerators],
    downloadableEntries: entries.filter(entryHasPinnedDownloadMetadata),
  };
}

export function readCatalog(catalogPath = DEFAULT_CATALOG_PATH, options = {}) {
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  } catch (error) {
    return {
      catalog: undefined,
      validation: { ok: false, errors: [`cannot read catalog: ${error instanceof Error ? error.message : String(error)}`], warnings: [], entries: [] },
    };
  }
  return { catalog, validation: validateCatalog(catalog, options) };
}

export function isAllowedSourceUrl(entry, candidateUrl = entry?.source?.url) {
  if (!entry || !isObject(entry.source) || !nonEmptyString(candidateUrl) || !nonEmptyString(entry.source.url)) return false;
  try {
    const expected = new URL(entry.source.url);
    const candidate = new URL(candidateUrl);
    return expected.protocol === 'https:'
      && candidate.protocol === 'https:'
      && !candidate.username
      && !candidate.password
      && candidate.hostname.toLowerCase() === normalized(entry.source.allowedHost)
      && candidate.hostname.toLowerCase() === expected.hostname.toLowerCase();
  } catch {
    return false;
  }
}

export function isDownloadableEntry(entry) {
  return entryHasPinnedDownloadMetadata(entry) && isAllowedSourceUrl(entry);
}

export function canTransitionStatus(from, to) {
  return RUNTIME_STATUSES.includes(from) && RUNTIME_STATUSES.includes(to) && (from === to || statusTransitions[from]?.includes(to));
}

export function transitionStatus(current, next) {
  if (!canTransitionStatus(current, next)) throw new Error(`invalid runtime status transition: ${current} -> ${next}`);
  return next;
}

export function createStatusTransition(initial = 'Missing') {
  if (!RUNTIME_STATUSES.includes(initial)) throw new Error(`invalid initial runtime status: ${initial}`);
  return {
    status: initial,
    move(next) {
      this.status = transitionStatus(this.status, next);
      return this.status;
    },
  };
}

export function normalizeRuntimeRoot(root) {
  if (!nonEmptyString(root)) return undefined;
  return resolve(root);
}

export function knownRuntimeRoots({ workspaceRoot = REPOSITORY_ROOT, configuredRoot, bundledRoot, env = process.env } = {}) {
  const roots = [];
  const add = (value, source) => {
    const normalizedRoot = normalizeRuntimeRoot(value);
    if (!normalizedRoot) return;
    const key = pathKey(normalizedRoot);
    if (!roots.some((item) => pathKey(item.path) === key)) roots.push({ path: normalizedRoot, source });
  };
  add(configuredRoot, 'configured');
  add(join(workspaceRoot, 'runtime-packs'), 'workspace');
  if (nonEmptyString(env.LOCALAPPDATA)) add(join(env.LOCALAPPDATA, 'AutomatePlus', 'runtime-packs'), 'local-app-data');
  if (nonEmptyString(env.ProgramData)) add(join(env.ProgramData, 'AutomatePlus', 'runtime-packs'), 'program-data');
  add(bundledRoot ?? join(workspaceRoot, 'apps', 'desktop', 'src-tauri', 'resources', 'runtime-packs'), 'bundled');
  return roots;
}

function safeExistingPackPath(root, value) {
  if (!nonEmptyString(value)) return undefined;
  if (pathSeparatorPattern.test(value) && resolve(value) === value) return undefined;
  const candidate = resolve(root, value);
  if (!isInside(root, candidate) || !existsSync(candidate)) return undefined;
  try {
    const link = lstatSync(candidate);
    if (link.isSymbolicLink()) return undefined;
    const canonicalRoot = realpathSync(root);
    const canonicalCandidate = realpathSync(candidate);
    if (!isInside(canonicalRoot, canonicalCandidate)) return undefined;
    return statSync(canonicalCandidate).isFile() ? canonicalCandidate : undefined;
  } catch {
    return undefined;
  }
}

export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function licenseMetadataPresent(pack) {
  return (nonEmptyString(pack?.license) || isObject(pack?.license) || nonEmptyString(pack?.licenseFile));
}

function healthMetadataPresent(pack) {
  return (nonEmptyString(pack?.healthCommand) || (Array.isArray(pack?.healthCommand) && pack.healthCommand.length > 0));
}

function packId(pack) {
  return nonEmptyString(pack?.id) ? pack.id : nonEmptyString(pack?.name) ? pack.name : undefined;
}

export function readLocalManifest(runtimeRoot) {
  const root = normalizeRuntimeRoot(runtimeRoot);
  if (!root) return { root: undefined, manifest: undefined, packs: [], status: 'Missing', reason: 'runtime root is not configured' };
  const manifestPath = join(root, 'manifest.json');
  if (!existsSync(manifestPath)) return { root, manifest: undefined, packs: [], status: 'Missing', reason: 'manifest.json is missing' };
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!isObject(manifest) || manifest.product !== 'AutomatePlus' || manifest.architecture !== SUPPORTED_ARCHITECTURE || !Array.isArray(manifest.packs)) {
      return { root, manifest, packs: [], status: 'NeedsReview', reason: 'manifest has invalid product, architecture, or packs array' };
    }
    return { root, manifest, packs: manifest.packs, status: 'Scanning' };
  } catch (error) {
    return { root, manifest: undefined, packs: [], status: 'NeedsReview', reason: `manifest.json is invalid: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function verifyLocalPack(runtimeRoot, localPack, catalogEntry, { requireHealth = false } = {}) {
  const id = packId(localPack);
  const result = {
    id,
    version: localPack?.version,
    path: undefined,
    sha256: undefined,
    status: 'NeedsReview',
    reason: undefined,
    exact: false,
  };
  if (!catalogEntry) {
    result.reason = 'local pack is not present in catalog';
    return result;
  }
  const packPath = safeExistingPackPath(runtimeRoot, localPack.path ?? localPack.executable);
  result.path = packPath;
  if (!packPath) {
    result.reason = 'pack path is missing, outside runtime root, or symlinked';
    return result;
  }
  if (localPack.architecture !== SUPPORTED_ARCHITECTURE || localPack.architecture !== catalogEntry.architecture) {
    result.reason = `architecture must be ${SUPPORTED_ARCHITECTURE}`;
    return result;
  }
  if (localPack.version !== catalogEntry.version) {
    result.reason = `version mismatch: local ${localPack.version ?? 'missing'}, catalog ${catalogEntry.version ?? 'missing'}`;
    return result;
  }
  if (!isValidSha256(localPack.sha256)) {
    result.reason = 'local manifest SHA-256 is missing or invalid';
    return result;
  }
  result.sha256 = sha256File(packPath);
  if (result.sha256.toLowerCase() !== localPack.sha256.toLowerCase()) {
    result.reason = 'local file SHA-256 does not match manifest';
    return result;
  }
  if (!isValidSha256(catalogEntry.source?.sha256) || result.sha256.toLowerCase() !== catalogEntry.source.sha256.toLowerCase()) {
    result.reason = 'catalog source SHA-256 is missing or does not match local file';
    return result;
  }
  if (localPack.verified !== true || !licenseMetadataPresent(localPack) || !healthMetadataPresent(localPack)) {
    result.reason = 'local manifest lacks verified, license, or health metadata';
    return result;
  }
  if (requireHealth && localPack.healthStatus !== 'Passed') {
    result.reason = 'runtime health command has not passed for this pack';
    return result;
  }
  result.exact = true;
  result.status = 'Installed';
  return result;
}

export function scanRuntimeRoots({ catalog, roots, requireHealth = false } = {}) {
  const catalogEntries = Array.isArray(catalog?.entries) ? catalog.entries : [];
  const rootReports = (Array.isArray(roots) ? roots : []).map((rootInfo) => {
    const info = typeof rootInfo === 'string' ? { path: rootInfo, source: 'unknown' } : rootInfo;
    const manifest = readLocalManifest(info.path);
    const packs = manifest.packs.map((localPack) => {
      const entry = catalogEntries.find((candidate) => candidate.id === packId(localPack));
      return { ...verifyLocalPack(manifest.root, localPack, entry, { requireHealth }), root: manifest.root, source: info.source };
    });
    return { ...info, ...manifest, packs };
  });
  const records = catalogEntries.map((entry) => {
    const localMatches = rootReports.flatMap((root) => root.packs.filter((pack) => pack.id === entry.id));
    const exact = localMatches.find((pack) => pack.exact && pack.version === entry.version && pack.sha256?.toLowerCase() === entry.source?.sha256?.toLowerCase());
    const conflict = localMatches.find((pack) => !pack.exact);
    if (entry.status === 'NeedsReview' || !entryHasPinnedDownloadMetadata(entry)) {
      return {
        ...entry,
        status: 'NeedsReview',
        localStatus: exact ? 'Installed' : conflict ? 'NeedsReview' : 'Missing',
        reusedFrom: exact?.root,
        reason: entry.reviewReason ?? 'catalog entry is not download-ready',
      };
    }
    if (exact) return { ...entry, status: 'Installed', reusedFrom: exact.root, localPath: exact.path };
    if (conflict) return { ...entry, status: 'NeedsReview', reason: conflict.reason };
    return { ...entry, status: 'Missing', reason: 'no exact verified local pack found' };
  });
  const status = records.some((entry) => entry.status === 'NeedsReview')
    ? 'NeedsReview'
    : records.some((entry) => entry.status === 'Missing')
      ? 'Blocked'
      : records.length > 0
        ? 'Ready'
        : 'Blocked';
  return { status, roots: rootReports, packs: records, validation: validateCatalog(catalog, { requireGeneratorCoverage: false }) };
}

export function selectMissingPacks(report) {
  const selected = [];
  const blocked = [];
  for (const entry of report?.packs ?? []) {
    if (entry.status === 'Installed') continue;
    if (entry.status === 'Missing' && isDownloadableEntry(entry)) selected.push(entry);
    else blocked.push({ id: entry.id, status: entry.status, reason: entry.reason ?? entry.reviewReason ?? 'pack is not eligible for download' });
  }
  return { selected, blocked, missingOnly: true };
}

export function offlineAcceptance(report, { onlineDownloadEnabled = false } = {}) {
  const reasons = [];
  if (onlineDownloadEnabled) reasons.push('explicit runtime download mode is enabled; offline acceptance requires it to be disabled');
  if (!report || !Array.isArray(report.packs) || report.packs.length === 0) reasons.push('catalog has no runtime packs');
  for (const entry of report?.packs ?? []) {
    if (entry.status !== 'Installed') reasons.push(`${entry.id}: ${entry.status}${entry.reason ? ` (${entry.reason})` : ''}`);
  }
  return {
    status: reasons.length === 0 ? 'Verified' : 'Blocked',
    onlineDownloadEnabled,
    networkPolicy: 'control-plane-offline; no implicit download permitted',
    reasons,
  };
}

export function resolveRuntimePackPath(runtimeRoot, relativePath) {
  return safeExistingPackPath(normalizeRuntimeRoot(runtimeRoot), relativePath);
}

export function summarizeRoots({ workspaceRoot = REPOSITORY_ROOT, configuredRoot, bundledRoot, env = process.env } = {}) {
  return knownRuntimeRoots({ workspaceRoot, configuredRoot, bundledRoot, env }).map((root) => ({
    ...root,
    exists: existsSync(root.path),
    isDirectory: existsSync(root.path) && statSync(root.path).isDirectory(),
    manifestPath: join(root.path, 'manifest.json'),
  }));
}

export function relativePackPath(runtimeRoot, packPath) {
  if (!runtimeRoot || !packPath || !isInside(runtimeRoot, packPath)) return undefined;
  return relative(runtimeRoot, packPath).replaceAll('\\', '/');
}

export function catalogEntryById(catalog, id) {
  return catalog?.entries?.find((entry) => entry.id === id);
}

export function catalogEntryIsReviewable(entry) {
  return entry?.status === 'NeedsReview' || !entryHasPinnedDownloadMetadata(entry);
}

export function catalogEntryIsDownloadReady(entry) {
  return isDownloadableEntry(entry);
}

export function catalogPackIdentity(pack) {
  return {
    id: packId(pack),
    version: pack?.version,
    sha256: typeof pack?.sha256 === 'string' ? pack.sha256.toLowerCase() : undefined,
  };
}

export function exactPackIdentityMatches(localPack, catalogEntry) {
  return Boolean(
    catalogEntry
      && packId(localPack) === catalogEntry.id
      && localPack.version === catalogEntry.version
      && isValidSha256(localPack.sha256)
      && isValidSha256(catalogEntry.source?.sha256)
      && localPack.sha256.toLowerCase() === catalogEntry.source.sha256.toLowerCase(),
  );
}

export function runtimeRootForManifest(manifestPath) {
  return dirname(resolve(manifestPath));
}

export function fileExistsAndIsRegular(filePath) {
  try {
    return existsSync(filePath) && lstatSync(filePath).isFile() && !lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

export function basenameForPack(pack) {
  return basename(pack?.path ?? pack?.executable ?? '');
}
