import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RuntimeManagerPanel, type RuntimeManagerPanelProps } from '../RuntimeManagerPanel.js';
import type { RuntimeCatalogEntry, RuntimePackView } from '../../../services/runtimeManager.js';

const catalogEntry: RuntimeCatalogEntry = {
  id: 'node',
  category: 'build',
  version: '22.0.0',
  architecture: 'win-x64',
  source: {
    url: 'https://nodejs.org/dist/node.zip',
    allowedHost: 'nodejs.org',
    sha256: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
    sizeBytes: 1024,
  },
  archive: { format: 'zip', executablePaths: ['node.exe'] },
  license: { spdx: 'MIT', url: 'https://opensource.org/license/mit' },
  provides: ['node'],
  requires: [],
  healthCommand: ['node.exe', '--version'],
  generatorIds: ['playwright-typescript'],
};

const props = (): RuntimeManagerPanelProps => ({
  host: { mode: 'native', status: 'ready' },
  packs: [],
  onScanLocal: () => undefined,
  onChooseInstallPath: () => undefined,
  onDownloadMissing: () => undefined,
  onImportArchive: () => undefined,
  onVerifyAll: () => undefined,
  onRetryFailed: () => undefined,
  onCancel: () => undefined,
  onOpenFolder: () => undefined,
});

describe('[ComponentTest] RuntimeManagerPanel', () => {
  it('renders a truthful blocked browser-shell state with disabled native actions', () => {
    const html = renderToStaticMarkup(React.createElement(RuntimeManagerPanel));

    expect(html).toContain('Browser migration shell');
    expect(html).toContain('Runtime Manager requires the native Tauri/Rust host');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('Download all missing (1)');
  });

  it('renders pack metadata, explicit action labels, and indeterminate progress without a fabricated percentage', () => {
    const pack: RuntimePackView = {
      entry: catalogEntry,
      status: 'Downloading',
      progress: { downloadedBytes: 512 },
      reason: 'Native download is active.',
    };
    const html = renderToStaticMarkup(React.createElement(RuntimeManagerPanel, { ...props(), packs: [pack] }));

    expect(html).toContain('node');
    expect(html).toContain('nodejs.org');
    expect(html).toContain('Download all missing (0)');
    expect(html).toContain('server did not provide a content length');
    expect(html).not.toContain('aria-valuenow');
  });

  it('renders known progress from byte values and exposes accessible controls', () => {
    const pack: RuntimePackView = {
      entry: catalogEntry,
      status: 'Downloading',
      progress: { downloadedBytes: 512, totalBytes: 1024 },
    };
    const html = renderToStaticMarkup(React.createElement(RuntimeManagerPanel, { ...props(), packs: [pack] }));

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="512"');
    expect(html).toContain('Scan local');
    expect(html).toContain('Choose install path');
    expect(html).toContain('Import archive');
    expect(html).toContain('Verify all');
  });

  it('renders unresolved catalog metadata as NeedsReview instead of fabricating artifact values', () => {
    const unresolved: RuntimePackView = {
      entry: {
        ...catalogEntry,
        version: null,
        source: { officialReference: 'https://nodejs.org/en/download/current' },
        license: { officialReference: 'https://github.com/nodejs/node/blob/main/LICENSE' },
        status: 'NeedsReview',
        reviewReason: 'Pinned release metadata is not available.',
      },
      status: 'NeedsReview',
    };
    const html = renderToStaticMarkup(React.createElement(RuntimeManagerPanel, { ...props(), packs: [unresolved] }));

    expect(html).toContain('vunresolved');
    expect(html).toContain('Not pinned');
    expect(html).toContain('Pinned release metadata is not available.');
    expect(html).not.toContain('0 B');
  });
});
