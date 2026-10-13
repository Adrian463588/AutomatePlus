import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReleasesModal } from '../src/components/releases/ReleasesModal.js';

describe('ReleasesModal UI component', () => {
  it('returns empty string when isOpen is false', () => {
    const markup = renderToStaticMarkup(
      createElement(ReleasesModal, { isOpen: false, onClose: () => undefined }),
    );
    expect(markup).toBe('');
  });

  it('renders the portable release and source-only history with the shared dialog title', () => {
    const markup = renderToStaticMarkup(
      createElement(ReleasesModal, { isOpen: true, onClose: () => undefined }),
    );

    expect(markup).toContain('Download AutomatePlus Desktop App');
    expect(markup).toContain('Latest: v1.7.1');
    expect(markup).toContain('Previous version: v1.7.0');
    expect(markup).toContain('v1.7.0');
    expect(markup).toContain('AutomatePlus-v1.7.1-windows-x64.zip');
    expect(markup).toContain('Run-AutomatePlus.bat');
    expect(markup).toContain('Historical source release. No packaged application is included.');
    expect(markup).toContain('role="dialog"');
    const titleId = /aria-labelledby="([^"]+)"/.exec(markup)?.[1];
    expect(titleId).toBeDefined();
    expect(markup).toContain(`<h2 id="${titleId}"`);
    expect(markup).toContain('aria-label="Close Download AutomatePlus Desktop App"');
    expect(markup).not.toMatch(/Setup|installer|Offline Ready|\b\d+(?:\.\d+)? MB\b|\b[a-f0-9]{64}\b/i);
  });

  it('links only to the declared portable asset, checksum file, source release, and correct history', () => {
    const markup = renderToStaticMarkup(
      createElement(ReleasesModal, { isOpen: true, onClose: () => undefined }),
    );

    const links = [...markup.matchAll(/<a\b([^>]+)>/g)].map((match) => match[1]);
    expect(links.map((attributes) => /href="([^"]+)"/.exec(attributes)?.[1])).toEqual([
      'https://github.com/Adrian463588/AutomatePlus/releases/download/v1.7.1/AutomatePlus-v1.7.1-windows-x64.zip',
      'https://github.com/Adrian463588/AutomatePlus/releases/download/v1.7.1/SHA256SUMS.txt',
      'https://github.com/Adrian463588/AutomatePlus/releases/tag/v1.7.0',
      'https://github.com/Adrian463588/AutomatePlus/releases',
    ]);
    for (const attributes of links) {
      expect(attributes).toContain('min-h-12 min-w-12');
      expect(attributes).toContain('text-[13px]');
      expect(attributes).toContain('focus-visible:outline');
      expect(attributes).toContain('aria-label="');
      expect(attributes).toContain('target="_blank"');
      expect(attributes).toContain('rel="noopener noreferrer"');
    }
  });
});
