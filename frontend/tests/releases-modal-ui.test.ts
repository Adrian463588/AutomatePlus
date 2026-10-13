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

  it('renders latest version v1.7.0 and historical versions when open', () => {
    const markup = renderToStaticMarkup(
      createElement(ReleasesModal, { isOpen: true, onClose: () => undefined }),
    );

    expect(markup).toContain('Download AutomatePlus Desktop App');
    expect(markup).toContain('Latest: v1.7.0');
    expect(markup).toContain('v1.7.0');
    expect(markup).toContain('v1.6.0');
    expect(markup).toContain('v1.5.0');
    expect(markup).toContain('v1.4.0');
    expect(markup).toContain('v1.0.0');
    expect(markup).toContain('AutomatePlus-Setup-1.7.0-x64.exe');
    expect(markup).toContain('AutomatePlus-1.7.0-win-x64-portable.zip');
    expect(markup).toContain('Run-AutomatePlus.bat');
  });

  it('renders download links and SHA-256 verification hashes', () => {
    const markup = renderToStaticMarkup(
      createElement(ReleasesModal, { isOpen: true, onClose: () => undefined }),
    );

    expect(markup).toContain('SHA-256');
    expect(markup).toContain('Download');
    expect(markup).toContain('https://github.com/automateplus/automateplus/releases');
  });
});
