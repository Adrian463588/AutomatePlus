import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  GENERATOR_IDS,
  DEFAULT_CATALOG_PATH,
  catalogEntryIsReviewable,
  catalogPackIdentity,
  canTransitionStatus,
  createStatusTransition,
  exactPackIdentityMatches,
  knownRuntimeRoots,
  offlineAcceptance,
  readCatalog,
  scanRuntimeRoots,
  selectMissingPacks,
  sha256File,
} from './runtime-catalog.mjs';

const { catalog, validation } = readCatalog(DEFAULT_CATALOG_PATH, { requireGeneratorCoverage: true });
assert.equal(validation.ok, true, validation.errors.join('; '));
assert.deepEqual(new Set(validation.coveredGenerators), new Set(GENERATOR_IDS));

const fixtureRoot = mkdtempSync(join(tmpdir(), 'automateplus-runtime-manager-component-'));
try {
  const toolPath = join(fixtureRoot, 'tool.bin');
  writeFileSync(toolPath, 'component-boundary-bytes\n', 'utf8');
  const digest = sha256File(toolPath);
  const localPack = {
    id: 'component-runtime',
    version: 'component-fixture',
    architecture: 'win-x64',
    path: 'tool.bin',
    sha256: digest,
    verified: true,
    license: { spdx: 'MIT' },
    healthCommand: ['tool.bin', '--version'],
    healthStatus: 'Passed',
  };
  const identityCatalogEntry = {
    id: 'component-runtime',
    version: 'component-fixture',
    source: { sha256: digest },
  };

  assert.equal(exactPackIdentityMatches(localPack, identityCatalogEntry), true, 'exact id/version/SHA identity must be reusable');
  assert.deepEqual(catalogPackIdentity(localPack), { id: 'component-runtime', version: 'component-fixture', sha256: digest });
  assert.equal(catalogEntryIsReviewable(catalog.entries.find((entry) => entry.id === 'nodejs')), true, 'unresolved catalog entry must remain reviewable');

  const runtimeManifestRoot = join(fixtureRoot, 'runtime-packs');
  mkdirSync(runtimeManifestRoot);
  writeFileSync(join(runtimeManifestRoot, 'tool.bin'), 'component-boundary-bytes\n', 'utf8');
  writeFileSync(join(runtimeManifestRoot, 'manifest.json'), JSON.stringify({
    schemaVersion: 1,
    product: 'AutomatePlus',
    architecture: 'win-x64',
    packs: [{
      ...localPack,
      id: 'nodejs',
      version: null,
      path: 'tool.bin',
    }],
  }, null, 2));
  const localReport = scanRuntimeRoots({
    catalog,
    roots: [{ path: runtimeManifestRoot, source: 'component-fixture' }],
  });
  const nodeReport = localReport.packs.find((entry) => entry.id === 'nodejs');
  assert.equal(nodeReport.status, 'NeedsReview', 'local file cannot become Installed while catalog SHA/version metadata is unresolved');
  assert.equal(nodeReport.localStatus, 'NeedsReview');

  const missingPlan = selectMissingPacks(localReport);
  assert.equal(missingPlan.missingOnly, true);
  assert.equal(missingPlan.selected.length, 0, 'unresolved local catalog must not trigger a download');
  assert.ok(missingPlan.blocked.some((entry) => entry.id === 'nodejs'));

  const transitions = createStatusTransition('Missing');
  for (const next of ['Scanning', 'Downloading', 'Verifying', 'Installing', 'Installed']) transitions.move(next);
  assert.equal(transitions.status, 'Installed');
  assert.equal(canTransitionStatus('Installed', 'Downloading'), false, 'installed pack cannot jump to download without a scan/review');
  assert.throws(() => transitions.move('Downloading'), /invalid runtime status transition/u);

  const onlineMode = offlineAcceptance({ packs: [] }, { onlineDownloadEnabled: true });
  assert.equal(onlineMode.status, 'Blocked', 'offline acceptance must reject explicit online download mode');
  assert.match(onlineMode.reasons[0], /explicit runtime download mode/u);

  const roots = knownRuntimeRoots({
    workspaceRoot: fixtureRoot,
    configuredRoot: join(fixtureRoot, 'chosen-runtime-root'),
    env: { LOCALAPPDATA: join(fixtureRoot, 'local-app-data'), ProgramData: join(fixtureRoot, 'program-data') },
    bundledRoot: join(fixtureRoot, 'bundled-runtime-root'),
  });
  assert.equal(roots[0].source, 'configured');
  assert.equal(roots[1].source, 'workspace');
  assert.equal(new Set(roots.map((root) => root.path.toLowerCase())).size, roots.length);

  console.log(JSON.stringify({
    verifier: 'runtime-manager',
    suite: 'ComponentTest',
    status: 'Verified',
    tests: [
      'exact id/version/SHA reuse identity',
      'missing-only selection blocks unresolved entries',
      'status transition guard',
      'known-root precedence and de-duplication',
      'unresolved catalog cannot become Installed',
    ],
    realE2E: { status: 'Blocked', reason: 'This verifier uses temporary component-boundary files only; it is not physical or online acceptance evidence.' },
  }, null, 2));
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
