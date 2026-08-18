import { ASSERTION_ACTIONS, isSecretRef } from './actions.js';
import { normalizeLocatorRanking } from './locators.js';
import { getSchemaVersion, CURRENT_IR_SCHEMA_VERSION, isRecord } from './version.js';

type UnknownRecord = Record<string, unknown>;

function normalizeLegacyAssertion(record: UnknownRecord, legacy: boolean): UnknownRecord {
  if (!legacy || typeof record.action !== 'string' || !(ASSERTION_ACTIONS as readonly string[]).includes(record.action)) return record;

  const assertion = isRecord(record.assertion) ? { ...record.assertion } : undefined;
  if (!assertion) return record;

  if (assertion.jsonPath === undefined && assertion.path !== undefined && record.action === 'assertJsonPath') assertion.jsonPath = assertion.path;
  if (assertion.headerName === undefined && assertion.path !== undefined && record.action === 'assertHeader') assertion.headerName = assertion.path;
  delete assertion.path;
  delete assertion.type;

  if (assertion.expected !== undefined && record.expectedValue === undefined && !isSecretRef(assertion.expected)) record.expectedValue = String(assertion.expected);
  record.assertion = assertion;
  return record;
}

function normalizeLegacyLocators(record: UnknownRecord, legacy: boolean): UnknownRecord {
  if (!legacy || !Array.isArray(record.locators)) return record;
  const sortable = record.locators.map((locator) => {
    if (!isRecord(locator)) return locator;
    return { ...locator, score: typeof locator.score === 'number' && Number.isFinite(locator.score) ? locator.score : 50 };
  });
  if (!sortable.every(isRecord)) return record;
  return { ...record, locators: normalizeLocatorRanking(sortable as never) };
}

export function migrateActionIR(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const legacy = getSchemaVersion(raw) === 1;
  const migrated: UnknownRecord = { ...raw };

  if (legacy) {
    if (migrated.stepNumber === undefined && migrated.step !== undefined) migrated.stepNumber = migrated.step;
    if (migrated.action === undefined && migrated.type !== undefined) migrated.action = migrated.type;
    delete migrated.step;
    delete migrated.type;
    if (migrated.expectedValue !== undefined && typeof migrated.expectedValue !== 'string' && !isSecretRef(migrated.expectedValue)) migrated.expectedValue = String(migrated.expectedValue);
  }

  const withLocators = normalizeLegacyLocators(migrated, legacy);
  const withAssertion = normalizeLegacyAssertion(withLocators, legacy);
  withAssertion.schemaVersion = CURRENT_IR_SCHEMA_VERSION;
  return withAssertion;
}

export function migrateSessionIR(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const legacy = getSchemaVersion(raw) === 1;
  const migrated: UnknownRecord = { ...raw };

  if (legacy) {
    if (migrated.steps === undefined && Array.isArray(migrated.actions)) migrated.steps = migrated.actions;
    delete migrated.actions;
  }
  if (migrated.targetConfig === undefined) migrated.targetConfig = {};
  if (migrated.environmentVariables === undefined) migrated.environmentVariables = {};

  if (Array.isArray(migrated.steps)) {
    migrated.steps = migrated.steps.map((step, index) => {
      const migratedStep = migrateActionIR(step);
      if (!isRecord(migratedStep)) return migratedStep;
      const withStepNumber = { ...migratedStep };
      if (legacy && withStepNumber.stepNumber === undefined) withStepNumber.stepNumber = index + 1;
      return withStepNumber;
    });
  }

  migrated.schemaVersion = CURRENT_IR_SCHEMA_VERSION;
  return migrated;
}
