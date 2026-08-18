import { describe, expect, it } from 'vitest';
import { AutomationError } from '@automate-plus/contracts';
import {
  PlaywrightBrowserContextLike,
  PlaywrightBrowserLike,
  PlaywrightCdpBrowserTransport,
  PlaywrightFileChooserLike,
  PlaywrightFrameLike,
  PlaywrightPageLike,
  PlaywrightRuntimeModuleLike,
  createDefaultPlaywrightRuntimeLoader,
} from '../src/index.js';

describe('Playwright/CDP browser transport boundary', () => {
  it('connects through an injected runtime and forwards browser events', async () => {
    const page = new FakePage('https://fixture.local');
    const context = new FakeContext(page);
    const browser = new FakeBrowser(context);
    const runtime: PlaywrightRuntimeModuleLike = {
      chromium: {
        launch: async () => browser,
        connectOverCDP: async () => browser,
      },
    };
    const events: Array<Record<string, unknown>> = [];
    const transport = new PlaywrightCdpBrowserTransport(async () => runtime);

    const session = await transport.start(
      { targetUrl: 'https://fixture.local', headless: true },
      (event) => events.push(event as Record<string, unknown>),
    );

    expect(page.initScripts).toHaveLength(1);
    const initScript = page.initScripts[0];
    expect(typeof initScript === 'string' ? initScript : initScript.content).toContain('__automatePlusReportAction');
    expect(page.evaluatedScripts).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'navigation', url: 'https://fixture.local' });

    await page.emitBinding(JSON.stringify({
      type: 'fill',
      element: { tagName: 'INPUT', id: 'email' },
      value: 'ada@example.test',
    }));
    expect(events.at(-1)).toMatchObject({ type: 'fill', value: 'ada@example.test' });

    const popup = new FakePage('https://fixture.local/popup');
    page.emit('popup', popup);
    page.emit('framenavigated', new FakeFrame('https://fixture.local/frame', page));
    page.emit('filechooser', new FakeFileChooser());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(events).toContainEqual(expect.objectContaining({ type: 'popup', url: 'https://fixture.local/popup' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'iframe', url: 'https://fixture.local/frame' }));
    expect(
      events.some(
        (event) =>
          event.type === 'fileChooser' &&
          (event.element as { id?: string } | undefined)?.id === 'upload',
      ),
    ).toBe(true);

    await session.stop();
    expect(browser.closed).toBe(true);
  });

  it('supports a CDP endpoint through the same injectable boundary', async () => {
    const page = new FakePage('about:blank');
    const browser = new FakeBrowser(new FakeContext(page));
    let connectedEndpoint: string | undefined;
    const transport = new PlaywrightCdpBrowserTransport(async () => ({
      chromium: {
        launch: async () => browser,
        connectOverCDP: async (endpoint) => {
          connectedEndpoint = endpoint;
          return browser;
        },
      },
    }));

    const session = await transport.start({ cdpEndpoint: 'http://127.0.0.1:9222' }, () => undefined);

    expect(connectedEndpoint).toBe('http://127.0.0.1:9222');
    await session.stop();
  });

  it('surfaces missing Playwright as a typed runtime error', async () => {
    const loadRuntime = createDefaultPlaywrightRuntimeLoader(async () => {
      throw new Error('module not found');
    });

    await expect(loadRuntime()).rejects.toMatchObject({
      code: 'RUNTIME_MISSING',
      details: { runtime: 'playwright' },
    });
  });

  it('does not silently continue when a page cannot expose the event binding', async () => {
    const page = new BindinglessPage();
    const browser = new FakeBrowser(new FakeContext(page));
    const transport = new PlaywrightCdpBrowserTransport(async () => ({
      chromium: {
        launch: async () => browser,
        connectOverCDP: async () => browser,
      },
    }));

    await expect(transport.start({}, () => undefined)).rejects.toBeInstanceOf(AutomationError);
    await expect(transport.start({}, () => undefined)).rejects.toMatchObject({ code: 'RUNTIME_MISSING' });
  });
});

type Listener = (...args: unknown[]) => void;

class FakePage implements PlaywrightPageLike {
  public readonly initScripts: Array<string | { content: string }> = [];
  public readonly evaluatedScripts: string[] = [];
  private readonly listeners = new Map<string, Listener[]>();
  private binding?: (...args: unknown[]) => void | Promise<void>;

  public constructor(private currentUrl: string) {}

  public async addInitScript(script: string | { content: string }): Promise<void> {
    this.initScripts.push(script);
  }

  public async exposeBinding(
    _name: string,
    callback: (...args: unknown[]) => void | Promise<void>,
  ): Promise<void> {
    this.binding = callback;
  }

  public async evaluate(pageFunction: string): Promise<void> {
    this.evaluatedScripts.push(pageFunction);
  }

  public async goto(url: string): Promise<void> {
    this.currentUrl = url;
    this.emit('framenavigated', new FakeFrame(url, undefined));
  }

  public url(): string {
    return this.currentUrl;
  }

  public on(event: string, listener: Listener): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  public off(event: string, listener: Listener): void {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter((candidate) => candidate !== listener),
    );
  }

  public emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  public async emitBinding(payload: unknown): Promise<void> {
    await this.binding?.({}, payload);
  }
}

class BindinglessPage extends FakePage {
  public override exposeBinding = undefined;
  public override exposeFunction = undefined;
}

class FakeContext implements PlaywrightBrowserContextLike {
  private readonly listeners = new Map<string, Listener[]>();

  public constructor(private readonly initialPage: PlaywrightPageLike) {}

  public pages(): PlaywrightPageLike[] {
    return [this.initialPage];
  }

  public async newPage(): Promise<PlaywrightPageLike> {
    return this.initialPage;
  }

  public on(event: string, listener: Listener): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  public off(event: string, listener: Listener): void {
    this.listeners.set(event, (this.listeners.get(event) ?? []).filter((candidate) => candidate !== listener));
  }
}

class FakeBrowser implements PlaywrightBrowserLike {
  public closed = false;

  public constructor(private readonly context: PlaywrightBrowserContextLike) {}

  public contexts(): PlaywrightBrowserContextLike[] {
    return [this.context];
  }

  public async close(): Promise<void> {
    this.closed = true;
  }
}

class FakeFrame implements PlaywrightFrameLike {
  public constructor(private readonly frameUrl: string, private readonly parent?: PlaywrightFrameLike) {}

  public url(): string {
    return this.frameUrl;
  }

  public parentFrame(): PlaywrightFrameLike | null {
    return this.parent ?? null;
  }
}

class FakeFileChooser implements PlaywrightFileChooserLike {
  public async element() {
    return {
      evaluate: async () => ({ tagName: 'INPUT', id: 'upload' }),
    };
  }
}
