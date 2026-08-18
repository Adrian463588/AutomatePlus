import { AutomationError, CapabilityError } from '@automate-plus/contracts';
import { ActionIR, ActionType, LocatorCandidate } from '@automate-plus/ir-schema';
import { BrowserElementSnapshot, extractElementLocators } from './injected-script.js';

type DragTarget = {
  locators: LocatorCandidate[];
  coordinates?: { x: number; y: number };
};

type ScrollOffset = {
  deltaX: number;
  deltaY: number;
};

export interface RawBrowserAssertion {
  type?: string;
  kind?: string;
  expected?: string;
  expectedValue?: string;
  attributeName?: string;
}

export interface RawBrowserEvent {
  type?: string;
  actionType?: string;
  element?: BrowserElementSnapshot;
  target?: BrowserElementSnapshot;
  sourceElement?: BrowserElementSnapshot;
  value?: string;
  text?: string;
  key?: string;
  url?: string;
  timestamp?: number;
  deltaX?: number;
  deltaY?: number;
  scrollOffset?: { deltaX: number; deltaY: number };
  dragTarget?: {
    element?: BrowserElementSnapshot;
    locators?: LocatorCandidate[];
    coordinates?: { x: number; y: number };
  };
  frame?: { url?: string; name?: string };
  filePaths?: string[];
  assertion?: RawBrowserAssertion;
  assertionType?: string;
  expectedValue?: string;
  attributeName?: string;
  description?: string;
}

export type ActionIdGenerator = () => string;

const TARGET_ACTIONS = new Set([
  'click',
  'doubleClick',
  'rightClick',
  'hover',
  'fill',
  'clear',
  'pressKey',
  'dragAndDrop',
  'assertVisible',
  'assertHidden',
  'assertText',
  'assertValue',
  'assertAttribute',
]);

const ACTION_ALIASES: Record<string, ActionType> = {
  click: 'click',
  doubleclick: 'doubleClick',
  rightclick: 'rightClick',
  contextmenu: 'rightClick',
  hover: 'hover',
  fill: 'fill',
  input: 'fill',
  clear: 'clear',
  keyboard: 'pressKey',
  keydown: 'pressKey',
  keypress: 'pressKey',
  presskey: 'pressKey',
  scroll: 'scroll',
  wheel: 'scroll',
  drag: 'dragAndDrop',
  drop: 'dragAndDrop',
  draganddrop: 'dragAndDrop',
  navigate: 'navigate',
  navigation: 'navigate',
  waitfor: 'waitFor',
  select: 'fill',
  selectoption: 'fill',
  check: 'click',
  checkbox: 'click',
  popup: 'navigate',
  iframe: 'waitFor',
  frame: 'waitFor',
  filechooser: 'fill',
  file: 'fill',
  assertion: 'assertText',
  assertvisible: 'assertVisible',
  asserthidden: 'assertHidden',
  asserttext: 'assertText',
  assertvalue: 'assertValue',
  assertattribute: 'assertAttribute',
  asserturl: 'assertUrl',
  assertstatuscode: 'assertStatusCode',
  assertjsonpath: 'assertJsonPath',
  assertheader: 'assertHeader',
  assertresponsetime: 'assertResponseTime',
};

export function parseBrowserEventPayload(payload: unknown): RawBrowserEvent {
  let parsed: unknown = payload;
  if (typeof payload === 'string') {
    try {
      parsed = JSON.parse(payload);
    } catch (error) {
      throw protocolError('Browser recorder emitted invalid JSON', error);
    }
  }

  if (!isRecord(parsed)) {
    throw protocolError('Browser recorder emitted a non-object event');
  }

  const event = parsed as RawBrowserEvent;
  if (!event.type && !event.actionType) {
    throw protocolError('Browser recorder event has no type');
  }
  return event;
}

export function normalizeBrowserEvent(
  raw: RawBrowserEvent,
  stepNumber: number,
  idGenerator: ActionIdGenerator = createActionId,
): ActionIR {
  const rawType = raw.actionType ?? raw.type;
  if (!rawType) {
    throw protocolError('Cannot normalize a browser event without an action type');
  }

  const normalizedType = compact(rawType);
  const action = resolveAction(raw, normalizedType);
  const element = raw.element ?? raw.target;
  const fileChooserWithoutElement = normalizedType === 'filechooser' || normalizedType === 'file';
  if (TARGET_ACTIONS.has(action) && !element && !fileChooserWithoutElement) {
    throw protocolError(`Browser action ${rawType} requires a target element`);
  }

  const base: ActionIR = {
    id: idGenerator(),
    schemaVersion: 1,
    stepNumber,
    platform: 'web',
    action,
    timeoutMs: 5000,
    timestamp: raw.timestamp ?? Date.now(),
    optional: false,
    ...(element ? { locators: extractElementLocators(element) } : {}),
  };

  const semanticDescription = semanticDescriptionFor(normalizedType, raw.description);
  if (semanticDescription) base.description = semanticDescription;

  switch (normalizedType) {
    case 'navigation':
    case 'navigate':
      base.value = requiredValue(raw.url ?? raw.value, 'navigation URL');
      return base;
    case 'popup':
      base.value = requiredValue(raw.url ?? raw.value, 'popup URL');
      return base;
    case 'iframe':
    case 'frame':
      base.value = raw.url ?? raw.frame?.url ?? raw.frame?.name ?? raw.value ?? 'iframe';
      return base;
    case 'fill':
    case 'input':
      base.value = raw.value ?? raw.text ?? '';
      return base;
    case 'select':
    case 'selectoption':
      base.value = raw.value ?? raw.text ?? '';
      base.attributeName = 'selectedOption';
      return base;
    case 'filechooser':
    case 'file':
      if (raw.filePaths && raw.filePaths.length > 0) {
        base.value = raw.filePaths.join('\n');
      } else if (raw.value) {
        base.value = raw.value;
      }
      base.attributeName = 'filePath';
      return base;
    case 'keyboard':
    case 'keydown':
    case 'keypress':
    case 'presskey':
      base.value = requiredValue(raw.key ?? raw.value, 'keyboard key');
      return base;
    case 'check':
    case 'checkbox':
      base.value = raw.value ?? 'checked';
      base.expectedValue = base.value;
      return base;
    case 'scroll':
    case 'wheel':
      base.scrollOffset = normalizeScrollOffset(raw);
      return base;
    case 'drag':
    case 'drop':
    case 'draganddrop':
      base.dragTarget = normalizeDragTarget(raw);
      return base;
    case 'assertion':
      return applyAssertion(base, raw);
    case 'assertvisible':
    case 'asserthidden':
    case 'asserttext':
    case 'assertvalue':
    case 'assertattribute':
    case 'asserturl':
    case 'assertstatuscode':
    case 'assertjsonpath':
    case 'assertheader':
    case 'assertresponsetime':
      return applyAssertion(base, raw, action);
    default:
      return base;
  }
}

export function createActionId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID();

  if (webCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  throw new AutomationError('PROTOCOL_ERROR', 'A cryptographically secure action ID generator is unavailable');
}

function resolveAction(raw: RawBrowserEvent, normalizedType: string): ActionType {
  const assertionType = compact(raw.assertion?.type ?? raw.assertion?.kind ?? raw.assertionType ?? '');
  if (normalizedType === 'assertion' && assertionType) {
    const assertionAction = ACTION_ALIASES[`assert${assertionType}`];
    if (assertionAction) return assertionAction;
  }

  const action = ACTION_ALIASES[normalizedType];
  if (!action) {
    throw new CapabilityError(`Unsupported browser event type: ${raw.actionType ?? raw.type}`, {
      platform: 'web',
      action: raw.actionType ?? raw.type,
    });
  }
  return action;
}

function applyAssertion(base: ActionIR, raw: RawBrowserEvent, resolvedAction?: ActionType): ActionIR {
  const assertionType = compact(raw.assertion?.type ?? raw.assertion?.kind ?? raw.assertionType ?? 'text');
  const action = resolvedAction ?? ACTION_ALIASES[`assert${assertionType}`];
  if (!action || !action.startsWith('assert')) {
    throw new CapabilityError(`Unsupported browser assertion type: ${assertionType}`, {
      platform: 'web',
      assertion: assertionType,
    });
  }

  base.action = action;
  base.expectedValue = raw.assertion?.expected ?? raw.assertion?.expectedValue ?? raw.expectedValue ?? raw.value;
  base.attributeName = raw.assertion?.attributeName ?? raw.attributeName;
  return base;
}

function normalizeScrollOffset(raw: RawBrowserEvent): ScrollOffset {
  return {
    deltaX: raw.scrollOffset?.deltaX ?? raw.deltaX ?? 0,
    deltaY: raw.scrollOffset?.deltaY ?? raw.deltaY ?? 0,
  };
}

function normalizeDragTarget(raw: RawBrowserEvent): DragTarget {
  const target = raw.dragTarget;
  const locators = target?.locators ?? (target?.element ? extractElementLocators(target.element) : []);
  if (locators.length === 0) {
    throw protocolError('Drag-and-drop event requires a target locator');
  }
  return {
    locators,
    ...(target?.coordinates ? { coordinates: target.coordinates } : {}),
  };
}

function semanticDescriptionFor(type: string, description?: string): string | undefined {
  if (description) return description;
  switch (type) {
    case 'select':
    case 'selectoption':
      return 'browserEvent:select';
    case 'check':
    case 'checkbox':
      return 'browserEvent:check';
    case 'popup':
      return 'browserEvent:popup';
    case 'iframe':
    case 'frame':
      return 'browserEvent:iframe';
    case 'filechooser':
    case 'file':
      return 'browserEvent:fileChooser';
    case 'assertion':
      return 'browserEvent:assertion';
    default:
      return undefined;
  }
}

function requiredValue(value: string | undefined, label: string): string {
  if (value === undefined || value.length === 0) {
    throw protocolError(`Browser event is missing ${label}`);
  }
  return value;
}

function compact(value: string): string {
  return value.replace(/[\s_-]/g, '').toLowerCase();
}

function protocolError(message: string, cause?: unknown): AutomationError {
  return new AutomationError('PROTOCOL_ERROR', message, {
    cause: cause instanceof Error ? cause.message : cause,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
