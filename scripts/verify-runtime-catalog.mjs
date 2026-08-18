import { DEFAULT_CATALOG_PATH, GENERATOR_IDS, readCatalog } from './runtime-catalog.mjs';

const requireReady = process.argv.includes('--require-ready');
const { catalog, validation } = readCatalog(DEFAULT_CATALOG_PATH, { requireGeneratorCoverage: true });
const unresolved = validation.unresolvedEntries ?? [];
const missingGenerators = GENERATOR_IDS.filter((id) => !validation.coveredGenerators?.includes(id));
const report = {
  verifier: 'runtime-catalog',
  status: validation.ok && unresolved.length === 0 ? 'Ready' : validation.ok ? 'NeedsReview' : 'Failed',
  catalogPath: DEFAULT_CATALOG_PATH.replaceAll('\\', '/'),
  schemaVersion: catalog?.schemaVersion,
  architecture: catalog?.architecture,
  entryCount: validation.entries.length,
  generatorCount: validation.coveredGenerators?.length ?? 0,
  expectedGeneratorCount: GENERATOR_IDS.length,
  missingGenerators,
  downloadableEntryCount: validation.downloadableEntries?.length ?? 0,
  unresolvedEntries: unresolved.map((entry) => ({
    id: entry.id,
    status: entry.status,
    reason: entry.reviewReason ?? 'pinned download metadata is incomplete',
  })),
  errors: validation.errors,
  warnings: validation.warnings,
  e2e: {
    status: unresolved.length === 0 && validation.ok ? 'Ready' : 'Blocked',
    reason: unresolved.length === 0 && validation.ok
      ? 'Catalog metadata is complete; real target E2E still requires explicit runtime and target prerequisites.'
      : 'Real web/API/Android E2E is blocked until every required runtime has verified source, checksum, license, executable, and health metadata.',
  },
};

console.log(JSON.stringify(report, null, 2));

if (!validation.ok) process.exitCode = 1;
else if (requireReady && unresolved.length > 0) process.exitCode = 2;
else process.exitCode = 0;
