import {
  DEFAULT_CATALOG_PATH,
  REPOSITORY_ROOT,
  knownRuntimeRoots,
  offlineAcceptance,
  readCatalog,
  scanRuntimeRoots,
  selectMissingPacks,
} from './runtime-catalog.mjs';

const { catalog, validation } = readCatalog(DEFAULT_CATALOG_PATH, { requireGeneratorCoverage: true });
const configuredRoot = process.env.AUTOMATEPLUS_RUNTIME_ROOT;
const roots = knownRuntimeRoots({ workspaceRoot: REPOSITORY_ROOT, configuredRoot });
const runtimeReport = validation.ok
  ? scanRuntimeRoots({ catalog, roots, requireHealth: true })
  : { status: 'Blocked', roots: [], packs: [] };
const onlineDownloadEnabled = process.env.AUTOMATEPLUS_RUNTIME_DOWNLOAD === '1';
const offline = offlineAcceptance(runtimeReport, { onlineDownloadEnabled });
const missingPlan = selectMissingPacks(runtimeReport);
const report = {
  verifier: 'offline-install',
  status: validation.ok ? offline.status : 'Blocked',
  mode: onlineDownloadEnabled ? 'explicit-download-mode-active' : 'offline-acceptance',
  catalogPath: DEFAULT_CATALOG_PATH.replaceAll('\\', '/'),
  roots: roots.map((root) => ({ ...root, path: root.path.replaceAll('\\', '/') })),
  catalog: {
    status: validation.ok ? runtimeReport.status : 'Failed',
    errors: validation.errors,
    warnings: validation.warnings,
    packCount: runtimeReport.packs.length,
    installedCount: runtimeReport.packs.filter((pack) => pack.status === 'Installed').length,
    missingCount: runtimeReport.packs.filter((pack) => pack.status === 'Missing').length,
    needsReviewCount: runtimeReport.packs.filter((pack) => pack.status === 'NeedsReview').length,
  },
  downloadPlan: {
    selectedCount: missingPlan.selected.length,
    selectedIds: missingPlan.selected.map((entry) => entry.id),
    blockedCount: missingPlan.blocked.length,
    blocked: missingPlan.blocked,
    networkCalls: 0,
    policy: 'No implicit download; only explicit Runtime Manager action may start an online job.',
  },
  acceptance: offline,
  e2e: {
    status: offline.status === 'Verified' ? 'NeedsReview' : 'Blocked',
    reason: offline.status === 'Verified'
      ? 'Offline runtime acceptance passed; real SauceDemo/DemoQA/ReqRes/Petstore/Android E2E still requires fresh target evidence.'
      : 'Offline acceptance is blocked until every catalog entry is installed, checksum/license verified, and health-checked.',
  },
};

console.log(JSON.stringify(report, null, 2));
if (!validation.ok || offline.status === 'Blocked') process.exitCode = 2;
