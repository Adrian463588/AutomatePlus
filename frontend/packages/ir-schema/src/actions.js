import { z } from 'zod';
import { LocatorCandidateSchema, validateLocatorRanking } from './locators.js';
import { CURRENT_IR_SCHEMA_VERSION, IrSchemaVersionSchema } from './version.js';
export const PlatformTypeSchema = z.enum(['web', 'android', 'api']);
export const ActionTypeSchema = z.enum([
    'navigate',
    'click',
    'doubleClick',
    'rightClick',
    'hover',
    'fill',
    'clear',
    'pressKey',
    'scroll',
    'dragAndDrop',
    'waitFor',
    'sleep',
    'takeScreenshot',
    'tap',
    'doubleTap',
    'longPress',
    'swipe',
    'drag',
    'pinch',
    'back',
    'home',
    'enter',
    'launchApp',
    'closeApp',
    'httpRequest',
    'assertVisible',
    'assertHidden',
    'assertText',
    'assertValue',
    'assertAttribute',
    'assertUrl',
    'assertStatusCode',
    'assertJsonPath',
    'assertHeader',
    'assertResponseTime',
]);
export const WEB_ACTIONS = [
    'navigate', 'click', 'doubleClick', 'rightClick', 'hover', 'fill', 'clear', 'pressKey',
    'scroll', 'dragAndDrop', 'waitFor', 'sleep', 'takeScreenshot', 'assertVisible',
    'assertHidden', 'assertText', 'assertValue', 'assertAttribute', 'assertUrl',
];
export const ANDROID_ACTIONS = [
    'tap', 'click', 'doubleTap', 'doubleClick', 'longPress', 'swipe', 'drag', 'dragAndDrop',
    'pinch', 'fill', 'clear', 'back', 'home', 'enter', 'launchApp', 'closeApp', 'waitFor',
    'sleep', 'takeScreenshot', 'assertVisible', 'assertHidden', 'assertText', 'assertValue',
    'assertAttribute',
];
export const API_ACTIONS = [
    'httpRequest', 'sleep', 'assertStatusCode', 'assertJsonPath', 'assertHeader', 'assertResponseTime',
];
export const ASSERTION_ACTIONS = [
    'assertVisible', 'assertHidden', 'assertText', 'assertValue', 'assertAttribute', 'assertUrl',
    'assertStatusCode', 'assertJsonPath', 'assertHeader', 'assertResponseTime',
];
export const ACTIONS_BY_PLATFORM = {
    web: WEB_ACTIONS,
    android: ANDROID_ACTIONS,
    api: API_ACTIONS,
};
export const SecretRefSchema = z
    .object({
    kind: z.literal('secret'),
    key: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u),
})
    .strict();
export const SecretValueSchema = z.union([z.string().max(100_000), SecretRefSchema]);
export const CoordinateSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
export const DragTargetSchema = z
    .object({
    locators: z.array(LocatorCandidateSchema).min(1).max(32),
    coordinates: CoordinateSchema.optional(),
})
    .strict();
export const ScrollOffsetSchema = z
    .object({ deltaX: z.number().finite(), deltaY: z.number().finite() })
    .strict();
export const SwipeVectorSchema = z
    .object({
    startX: z.number().finite(),
    startY: z.number().finite(),
    endX: z.number().finite(),
    endY: z.number().finite(),
    durationMs: z.number().int().positive().max(86_400_000).default(300),
})
    .strict();
const ApiValueSchema = z.union([z.string().max(100_000), SecretRefSchema]);
export const ApiPayloadSchema = z
    .object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
    url: z.string().trim().min(1).max(16_384),
    headers: z.record(ApiValueSchema).default({}),
    queryParams: z.record(ApiValueSchema).default({}),
    bodyType: z.enum(['none', 'json', 'form-data', 'x-www-form-urlencoded', 'raw']).default('none'),
    bodyContent: ApiValueSchema.optional(),
    extractedVariables: z
        .array(z.object({
        variableName: z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/u),
        jsonPath: z.string().trim().min(1).max(2048),
    }).strict())
        .max(256)
        .default([]),
})
    .strict()
    .superRefine((payload, ctx) => {
    if (payload.bodyType === 'none' && payload.bodyContent !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bodyContent'], message: 'bodyContent is not allowed when bodyType is none' });
    }
    if (payload.bodyType !== 'none' && payload.bodyContent === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bodyContent'], message: 'bodyContent is required when bodyType is not none' });
    }
});
export const AssertionOperatorSchema = z.enum([
    'equals', 'notEquals', 'contains', 'matches', 'greaterThan', 'greaterThanOrEqual',
    'lessThan', 'lessThanOrEqual', 'exists', 'notExists',
]);
export const AssertionSchema = z
    .object({
    operator: AssertionOperatorSchema.default('equals'),
    expected: z.union([z.string().max(100_000), z.number().finite(), z.boolean(), z.null(), SecretRefSchema]).optional(),
    jsonPath: z.string().trim().min(1).max(2048).optional(),
    headerName: z.string().trim().min(1).max(256).optional(),
    maxDurationMs: z.number().int().positive().max(86_400_000).optional(),
})
    .strict()
    .superRefine((assertion, ctx) => {
    const requiresExpected = ['equals', 'notEquals', 'contains', 'matches', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual'];
    if (requiresExpected.includes(assertion.operator) && assertion.expected === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected'], message: 'expected is required for this assertion operator' });
    }
    if (['exists', 'notExists'].includes(assertion.operator) && assertion.expected !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected'], message: 'expected is not allowed for exists/notExists assertions' });
    }
});
const LOCATOR_ACTIONS = new Set([
    'click', 'doubleClick', 'rightClick', 'hover', 'fill', 'clear', 'dragAndDrop', 'tap',
    'doubleTap', 'longPress', 'drag', 'pinch', 'assertVisible', 'assertHidden', 'assertText',
    'assertValue', 'assertAttribute',
]);
function addIssue(ctx, path, message) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}
function hasLocator(action) {
    return Boolean(action.locators && action.locators.length > 0);
}
function hasExpectedValue(action) {
    return action.expectedValue !== undefined || action.value !== undefined || action.assertion?.expected !== undefined;
}
function expectedNumber(action) {
    const expected = action.expectedValue ?? action.assertion?.expected;
    if (typeof expected === 'number' && Number.isFinite(expected))
        return expected;
    if (typeof expected === 'string' && expected.trim() !== '') {
        const parsed = Number(expected);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}
function validateActionCompatibility(action, ctx) {
    const allowed = ACTIONS_BY_PLATFORM[action.platform];
    if (!allowed.includes(action.action)) {
        addIssue(ctx, ['action'], `action '${action.action}' is not compatible with platform '${action.platform}'`);
        return;
    }
    if (action.locators) {
        for (const error of validateLocatorRanking(action.locators))
            addIssue(ctx, ['locators'], error);
    }
    if (LOCATOR_ACTIONS.has(action.action) && !hasLocator(action)) {
        const coordinateAllowed = action.platform === 'android' && action.coordinates !== undefined;
        if (!coordinateAllowed)
            addIssue(ctx, ['locators'], `action '${action.action}' requires at least one locator`);
    }
    if (action.platform !== 'android' && action.coordinates !== undefined)
        addIssue(ctx, ['coordinates'], 'coordinates are only valid for android actions');
    if (action.coordinates !== undefined && !['tap', 'doubleTap', 'longPress', 'swipe', 'drag', 'dragAndDrop', 'pinch'].includes(action.action)) {
        addIssue(ctx, ['coordinates'], `coordinates are not valid for action '${action.action}'`);
    }
    if (action.apiPayload !== undefined && action.action !== 'httpRequest')
        addIssue(ctx, ['apiPayload'], "apiPayload is only valid for 'httpRequest'");
    if (action.action === 'httpRequest' && action.apiPayload === undefined)
        addIssue(ctx, ['apiPayload'], "apiPayload is required for 'httpRequest'");
    if (action.dragTarget !== undefined && !['drag', 'dragAndDrop'].includes(action.action))
        addIssue(ctx, ['dragTarget'], `dragTarget is not valid for action '${action.action}'`);
    if (['drag', 'dragAndDrop'].includes(action.action) && action.dragTarget === undefined)
        addIssue(ctx, ['dragTarget'], `action '${action.action}' requires dragTarget`);
    if (action.scrollOffset !== undefined && action.action !== 'scroll')
        addIssue(ctx, ['scrollOffset'], "scrollOffset is only valid for 'scroll'");
    if (action.action === 'scroll' && action.scrollOffset === undefined)
        addIssue(ctx, ['scrollOffset'], "scrollOffset is required for 'scroll'");
    if (action.swipeVector !== undefined && action.action !== 'swipe')
        addIssue(ctx, ['swipeVector'], "swipeVector is only valid for 'swipe'");
    if (action.action === 'swipe' && action.swipeVector === undefined)
        addIssue(ctx, ['swipeVector'], "swipeVector is required for 'swipe'");
    switch (action.action) {
        case 'navigate':
            if (typeof action.value !== 'string' || action.value.trim() === '')
                addIssue(ctx, ['value'], 'navigate requires a non-empty URL string value');
            break;
        case 'fill':
            if (action.value === undefined)
                addIssue(ctx, ['value'], 'fill requires value');
            break;
        case 'pressKey':
            if (typeof action.value !== 'string' || action.value.trim() === '')
                addIssue(ctx, ['value'], 'pressKey requires a key value');
            break;
        case 'launchApp':
            if (typeof action.value !== 'string' || action.value.trim() === '')
                addIssue(ctx, ['value'], 'launchApp requires an app identifier');
            break;
        case 'waitFor':
            if (!hasLocator(action) && typeof action.value !== 'string')
                addIssue(ctx, ['value'], 'waitFor requires a locator or value');
            break;
        case 'assertVisible':
        case 'assertHidden':
            if (hasExpectedValue(action))
                addIssue(ctx, ['expectedValue'], `${action.action} does not accept an expected value`);
            break;
        case 'assertText':
        case 'assertValue':
            if (!hasExpectedValue(action))
                addIssue(ctx, ['expectedValue'], `${action.action} requires an expected value`);
            break;
        case 'assertAttribute':
            if (!action.attributeName)
                addIssue(ctx, ['attributeName'], 'assertAttribute requires attributeName');
            if (!hasExpectedValue(action))
                addIssue(ctx, ['expectedValue'], 'assertAttribute requires an expected value');
            break;
        case 'assertUrl':
            if (!hasExpectedValue(action))
                addIssue(ctx, ['expectedValue'], 'assertUrl requires an expected URL value');
            if (action.value !== undefined && typeof action.value !== 'string')
                addIssue(ctx, ['value'], 'assertUrl cannot use a secret reference as its expected URL');
            break;
        case 'assertStatusCode': {
            const status = expectedNumber(action);
            if (status === undefined || !Number.isInteger(status) || status < 100 || status > 599)
                addIssue(ctx, ['expectedValue'], 'assertStatusCode requires an integer HTTP status between 100 and 599');
            break;
        }
        case 'assertJsonPath':
            if (!action.attributeName && !action.assertion?.jsonPath)
                addIssue(ctx, ['attributeName'], 'assertJsonPath requires a JSONPath');
            if (!hasExpectedValue(action))
                addIssue(ctx, ['expectedValue'], 'assertJsonPath requires an expected value');
            break;
        case 'assertHeader':
            if (!action.attributeName && !action.assertion?.headerName)
                addIssue(ctx, ['attributeName'], 'assertHeader requires a header name');
            if (!hasExpectedValue(action))
                addIssue(ctx, ['expectedValue'], 'assertHeader requires an expected value');
            break;
        case 'assertResponseTime': {
            const duration = expectedNumber(action);
            if (duration === undefined || duration <= 0)
                addIssue(ctx, ['expectedValue'], 'assertResponseTime requires a positive duration in milliseconds');
            break;
        }
        default:
            break;
    }
    if (action.assertion && !isAssertionAction(action.action))
        addIssue(ctx, ['assertion'], `assertion metadata is not valid for action '${action.action}'`);
    if (action.expectedValue !== undefined && !isAssertionAction(action.action))
        addIssue(ctx, ['expectedValue'], 'expectedValue is only valid for assertion actions');
    if (action.attributeName !== undefined && !['assertAttribute', 'assertJsonPath', 'assertHeader'].includes(action.action))
        addIssue(ctx, ['attributeName'], `attributeName is not valid for action '${action.action}'`);
}
export const ActionIRSchema = z
    .object({
    id: z.string().uuid(),
    schemaVersion: IrSchemaVersionSchema.default(CURRENT_IR_SCHEMA_VERSION),
    stepNumber: z.number().int().positive(),
    platform: PlatformTypeSchema,
    action: ActionTypeSchema,
    description: z.string().trim().max(4096).optional(),
    locators: z.array(LocatorCandidateSchema).max(32).optional(),
    value: SecretValueSchema.optional(),
    attributeName: z.string().trim().min(1).max(1024).optional(),
    expectedValue: z.string().max(100_000).optional(),
    dragTarget: DragTargetSchema.optional(),
    scrollOffset: ScrollOffsetSchema.optional(),
    swipeVector: SwipeVectorSchema.optional(),
    coordinates: CoordinateSchema.optional(),
    apiPayload: ApiPayloadSchema.optional(),
    assertion: AssertionSchema.optional(),
    timeoutMs: z.number().int().positive().max(86_400_000).default(5000),
    optional: z.boolean().default(false),
    timestamp: z.number().int().nonnegative().finite().default(() => Date.now()),
})
    .strict()
    .superRefine((action, ctx) => validateActionCompatibility(action, ctx));
export function isSecretRef(value) {
    return SecretRefSchema.safeParse(value).success;
}
export function isAssertionAction(action) {
    return ASSERTION_ACTIONS.includes(action);
}
export function isActionAllowedOnPlatform(platform, action) {
    return ACTIONS_BY_PLATFORM[platform].includes(action);
}
//# sourceMappingURL=actions.js.map