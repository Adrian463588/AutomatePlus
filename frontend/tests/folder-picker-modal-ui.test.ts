import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FolderPickerModal, WORKSPACE_PRESETS } from '../src/components/workspace/FolderPickerModal.js';

describe('FolderPickerModal UI component', () => {
  it('returns empty string when isOpen is false', () => {
    const markup = renderToStaticMarkup(
      createElement(FolderPickerModal, {
        isOpen: false,
        onClose: () => undefined,
        onSelect: () => undefined,
      }),
    );
    expect(markup).toBe('');
  });

  it('renders modal header, presets, and confirm button when open', () => {
    const markup = renderToStaticMarkup(
      createElement(FolderPickerModal, {
        isOpen: true,
        onClose: () => undefined,
        onSelect: () => undefined,
        initialPath: 'D:\\SEMESTER12\\ProjectKode\\AutomatePlus',
      }),
    );

    expect(markup).toContain('Select Workspace Folder');
    expect(markup).toContain('Workspace Directory Presets');
    expect(markup).toContain('Select Folder');
    expect(markup).toContain('Cancel');
    expect(markup).toContain('Custom workspace path');
  });

  it('renders all workspace presets with path details', () => {
    const markup = renderToStaticMarkup(
      createElement(FolderPickerModal, {
        isOpen: true,
        onClose: () => undefined,
        onSelect: () => undefined,
      }),
    );

    for (const preset of WORKSPACE_PRESETS) {
      expect(markup).toContain(preset.name);
      expect(markup).toContain(preset.path);
    }
  });

  it('renders download app prompt when onOpenReleasesModal is provided', () => {
    const markup = renderToStaticMarkup(
      createElement(FolderPickerModal, {
        isOpen: true,
        onClose: () => undefined,
        onSelect: () => undefined,
        onOpenReleasesModal: () => undefined,
      }),
    );

    expect(markup).toContain('Download App');
    expect(markup).toContain('Want native Windows OS folder picker dialogs');
  });
});
