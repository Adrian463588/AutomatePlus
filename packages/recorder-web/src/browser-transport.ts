import { AutomationError } from '@automate-plus/contracts';
import {
  BrowserElementSnapshot,
  INJECTED_RECORDING_SCRIPT,
  ELEMENT_SNAPSHOT_SCRIPT,
} from './injected-script.js';
import {
  parseBrowserEventPayload,
  RawBrowserEvent,
} from './event-normalizer.js';

export interface BrowserTransportOptions {
  targetUrl?: string;
  viewport?: { width: number; height: number };
  headless?: boolean;
  cdpEndpoint?: string;
}

export type BrowserEventCallback = (event: RawBrowserEvent) => void;

export interface BrowserTransportSession {
  stop(): Promise<void>;
  pause?(): Promise<void>;
  resume?(): Promise<void>;
}

export interface BrowserRecorderTransport {
  start(options: BrowserTransportOptions, onEvent: BrowserEventCallback): Promise<BrowserTransportSession>;
}

export type ModuleImporter = (moduleName: string) => Promise<unknown>;
export type PlaywrightRuntimeLoader = () => Promise<PlaywrightRuntimeModuleLike>;

export interface PlaywrightRuntimeModuleLike {
  chromium?: PlaywrightChromiumLike;
}

export interface PlaywrightChromiumLike {
  launch(options?: { headless?: boolean }): Promise<PlaywrightBrowserLike>;
  connectOverCDP(endpoint: string): Promise<PlaywrightBrowserLike>;
}

export interface PlaywrightBrowserLike {
  contexts(): PlaywrightBrowserContextLike[];
  newContext?(options?: { viewport?: { width: number; height: number } }): Promise<PlaywrightBrowserContextLike>;
  close(): Promise<void>;
}

export interface PlaywrightBrowserContextLike {
  pages(): PlaywrightPageLike[];
  newPage(): Promise<PlaywrightPageLike>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  off?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface PlaywrightPageLike {
  addInitScript(script: string | { content: string }): Promise<void>;
  exposeBinding?(
    name: string,
    callback: (...args: unknown[]) => void | Promise<void>,
  ): Promise<void>;
  exposeFunction?(name: string, callback: (...args: unknown[]) => void | Promise<void>): Promise<void>;
  evaluate?(pageFunction: string, arg?: unknown): Promise<unknown>;
  goto(url: string): Promise<unknown>;
  url(): string;
  on(event: string, listener: (...args: unknown[]) => void): void;
  off?(event: string, listener: (...args: unknown[]) => void): void;
  mainFrame?(): PlaywrightFrameLike;
}

export interface PlaywrightFrameLike {
  url(): string;
  parentFrame?(): PlaywrightFrameLike | null;
}

export interface PlaywrightFileChooserLike {
  element?(): Promise<PlaywrightElementHandleLike>;
}

export interface PlaywrightElementHandleLike {
  evaluate?(pageFunction: string, arg?: unknown): Promise<BrowserElementSnapshot>;
}

const REPORT_BINDING = '__automatePlusReportAction';

export function createDefaultPlaywrightRuntimeLoader(
  importModule: ModuleImporter = (moduleName) => import(/* @vite-ignore */ moduleName),
): PlaywrightRuntimeLoader {
  return async () => {
    let loaded: unknown;
    try {
      loaded = await importModule('playwright');
    } catch (error) {
      throw runtimeMissingError('Playwright runtime is not installed or cannot be loaded', error);
    }

    const moduleValue = asRecord(loaded);
    const runtime = asRecord(moduleValue?.default) ?? moduleValue;
    if (!runtime?.chromium) {
      throw runtimeMissingError('Playwright runtime does not expose the Chromium adapter');
    }

    return { chromium: runtime.chromium as PlaywrightChromiumLike };
  };
}

export class PlaywrightCdpBrowserTransport implements BrowserRecorderTransport {
  private readonly loadRuntime: PlaywrightRuntimeLoader;

  public constructor(loadRuntime: PlaywrightRuntimeLoader = createDefaultPlaywrightRuntimeLoader()) {
    this.loadRuntime = loadRuntime;
  }

  public async start(
    options: BrowserTransportOptions,
    onEvent: BrowserEventCallback,
  ): Promise<BrowserTransportSession> {
    let runtime: PlaywrightRuntimeModuleLike;
    try {
      runtime = await this.loadRuntime();
    } catch (error) {
      throw bootstrapError(error);
    }
    const chromium = runtime.chromium;
    if (!chromium) {
      throw runtimeMissingError('Playwright Chromium runtime is unavailable');
    }

    let browser: PlaywrightBrowserLike | undefined;
    const subscriptions: Array<SubscriptionTarget> = [];
    const attachedPages = new Set<PlaywrightPageLike>();

    try {
      browser = options.cdpEndpoint
        ? await chromium.connectOverCDP(options.cdpEndpoint)
        : await chromium.launch({ headless: options.headless ?? false });

      const context = await resolveContext(browser, options.viewport);
      const attachPage = async (page: PlaywrightPageLike): Promise<void> => {
        if (attachedPages.has(page)) return;
        attachedPages.add(page);

        await exposeReportBinding(page, onEvent);
        await page.addInitScript({ content: INJECTED_RECORDING_SCRIPT });
        if (page.evaluate) {
          await page.evaluate(INJECTED_RECORDING_SCRIPT);
        }

        const popupHandler = (...args: unknown[]): void => {
          const popup = args[0] as PlaywrightPageLike | undefined;
          if (!popup) return;
          onEvent({
            type: 'popup',
            url: safePageUrl(popup),
          });
          void attachPage(popup);
        };
        listen(page, 'popup', popupHandler, subscriptions);

        const frameHandler = (...args: unknown[]): void => {
          const frame = args[0] as PlaywrightFrameLike | undefined;
          if (!frame) return;
          const frameUrl = safeFrameUrl(frame);
          if (frame.parentFrame?.()) {
            onEvent({ type: 'iframe', url: frameUrl, frame: { url: frameUrl } });
          } else if (frameUrl) {
            onEvent({ type: 'navigation', url: frameUrl, value: frameUrl });
          }
        };
        listen(page, 'framenavigated', frameHandler, subscriptions);

        const fileChooserHandler = (...args: unknown[]): void => {
          const chooser = args[0] as PlaywrightFileChooserLike | undefined;
          void emitFileChooser(chooser, onEvent);
        };
        listen(page, 'filechooser', fileChooserHandler, subscriptions);
      };

      const pageHandler = (...args: unknown[]): void => {
        const page = args[0] as PlaywrightPageLike | undefined;
        if (page) void attachPage(page);
      };
      listen(context, 'page', pageHandler, subscriptions);

      const pages = context.pages();
      const page = pages[0] ?? (await context.newPage());
      await attachPage(page);

      if (options.targetUrl) {
        await page.goto(options.targetUrl);
      }

      let stopped = false;
      return {
        stop: async () => {
          if (stopped) return;
          stopped = true;
          for (const subscription of subscriptions.reverse()) {
            subscription.target.off?.(subscription.event, subscription.listener);
          }
          await browser?.close();
        },
      };
    } catch (error) {
      for (const subscription of subscriptions.reverse()) {
        subscription.target.off?.(subscription.event, subscription.listener);
      }
      await browser?.close().catch(() => undefined);
      throw bootstrapError(error);
    }
  }
}

interface SubscriptionTarget {
  target: {
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
    off?: (event: string, listener: (...args: unknown[]) => void) => void;
  };
  event: string;
  listener: (...args: unknown[]) => void;
}

async function resolveContext(
  browser: PlaywrightBrowserLike,
  viewport?: { width: number; height: number },
): Promise<PlaywrightBrowserContextLike> {
  const existingContext = browser.contexts()[0];
  if (existingContext) return existingContext;
  if (!browser.newContext) {
    throw runtimeMissingError('Playwright browser has no usable browser context');
  }
  return browser.newContext(viewport ? { viewport } : undefined);
}

async function exposeReportBinding(page: PlaywrightPageLike, onEvent: BrowserEventCallback): Promise<void> {
  const receivePayload = (...args: unknown[]): void => {
    const payload = args.at(-1);
    onEvent(parseBrowserEventPayload(payload));
  };

  if (page.exposeBinding) {
    await page.exposeBinding(REPORT_BINDING, receivePayload);
    return;
  }
  if (page.exposeFunction) {
    await page.exposeFunction(REPORT_BINDING, receivePayload);
    return;
  }
  throw runtimeMissingError('Playwright page cannot expose the recorder event binding');
}

async function emitFileChooser(
  chooser: PlaywrightFileChooserLike | undefined,
  onEvent: BrowserEventCallback,
): Promise<void> {
  if (!chooser) {
    onEvent({ type: 'fileChooser' });
    return;
  }

  const element = await chooser.element?.();
  const snapshot = await element?.evaluate?.(ELEMENT_SNAPSHOT_SCRIPT);
  onEvent({ type: 'fileChooser', element: snapshot });
}

function listen(
  target: SubscriptionTarget['target'],
  event: string,
  listener: (...args: unknown[]) => void,
  subscriptions: SubscriptionTarget[],
): void {
  if (!target.on) {
    throw runtimeMissingError(`Playwright target cannot subscribe to ${event}`);
  }
  target.on(event, listener);
  subscriptions.push({ target, event, listener });
}

function safePageUrl(page: PlaywrightPageLike): string | undefined {
  try {
    return page.url() || undefined;
  } catch {
    return undefined;
  }
}

function safeFrameUrl(frame: PlaywrightFrameLike): string | undefined {
  try {
    return frame.url() || undefined;
  } catch {
    return undefined;
  }
}

function bootstrapError(error: unknown): AutomationError {
  if (error instanceof AutomationError) return error;
  return runtimeMissingError('Playwright browser could not be started for recording', error);
}

function runtimeMissingError(message: string, cause?: unknown): AutomationError {
  return new AutomationError('RUNTIME_MISSING', message, {
    runtime: 'playwright',
    cause: cause instanceof Error ? cause.message : cause,
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}
