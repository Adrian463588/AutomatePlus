import { z } from 'zod';
export declare const PlatformTypeSchema: z.ZodEnum<["web", "android", "api"]>;
export type PlatformType = z.infer<typeof PlatformTypeSchema>;
export declare const ActionTypeSchema: z.ZodEnum<["navigate", "click", "doubleClick", "rightClick", "hover", "fill", "clear", "pressKey", "scroll", "dragAndDrop", "waitFor", "sleep", "takeScreenshot", "tap", "doubleTap", "longPress", "swipe", "drag", "pinch", "back", "home", "enter", "launchApp", "closeApp", "httpRequest", "assertVisible", "assertHidden", "assertText", "assertValue", "assertAttribute", "assertUrl", "assertStatusCode", "assertJsonPath", "assertHeader", "assertResponseTime"]>;
export type ActionType = z.infer<typeof ActionTypeSchema>;
export declare const WEB_ACTIONS: readonly ["navigate", "click", "doubleClick", "rightClick", "hover", "fill", "clear", "pressKey", "scroll", "dragAndDrop", "waitFor", "sleep", "takeScreenshot", "assertVisible", "assertHidden", "assertText", "assertValue", "assertAttribute", "assertUrl"];
export declare const ANDROID_ACTIONS: readonly ["tap", "click", "doubleTap", "doubleClick", "longPress", "swipe", "drag", "dragAndDrop", "pinch", "fill", "clear", "back", "home", "enter", "launchApp", "closeApp", "waitFor", "sleep", "takeScreenshot", "assertVisible", "assertHidden", "assertText", "assertValue", "assertAttribute"];
export declare const API_ACTIONS: readonly ["httpRequest", "sleep", "assertStatusCode", "assertJsonPath", "assertHeader", "assertResponseTime"];
export declare const ASSERTION_ACTIONS: readonly ["assertVisible", "assertHidden", "assertText", "assertValue", "assertAttribute", "assertUrl", "assertStatusCode", "assertJsonPath", "assertHeader", "assertResponseTime"];
export declare const ACTIONS_BY_PLATFORM: Record<PlatformType, readonly ActionType[]>;
export declare const SecretRefSchema: z.ZodObject<{
    kind: z.ZodLiteral<"secret">;
    key: z.ZodString;
}, "strict", z.ZodTypeAny, {
    kind: "secret";
    key: string;
}, {
    kind: "secret";
    key: string;
}>;
export type SecretRef = z.infer<typeof SecretRefSchema>;
export declare const SecretValueSchema: z.ZodUnion<[z.ZodString, z.ZodObject<{
    kind: z.ZodLiteral<"secret">;
    key: z.ZodString;
}, "strict", z.ZodTypeAny, {
    kind: "secret";
    key: string;
}, {
    kind: "secret";
    key: string;
}>]>;
export type SecretValue = z.infer<typeof SecretValueSchema>;
export declare const CoordinateSchema: z.ZodObject<{
    x: z.ZodNumber;
    y: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    x: number;
    y: number;
}, {
    x: number;
    y: number;
}>;
export declare const DragTargetSchema: z.ZodObject<{
    locators: z.ZodArray<z.ZodEffects<z.ZodObject<{
        strategy: z.ZodEnum<["testId", "role", "accessibilityId", "resourceId", "label", "id", "name", "text", "css", "xpath", "bounds"]>;
        value: z.ZodString;
        role: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
        score: z.ZodDefault<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        value: string;
        strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
        score: number;
        role?: string | undefined;
        name?: string | undefined;
    }, {
        value: string;
        strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
        role?: string | undefined;
        name?: string | undefined;
        score?: number | undefined;
    }>, {
        value: string;
        strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
        score: number;
        role?: string | undefined;
        name?: string | undefined;
    }, {
        value: string;
        strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
        role?: string | undefined;
        name?: string | undefined;
        score?: number | undefined;
    }>, "many">;
    coordinates: z.ZodOptional<z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        x: number;
        y: number;
    }, {
        x: number;
        y: number;
    }>>;
}, "strict", z.ZodTypeAny, {
    locators: {
        value: string;
        strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
        score: number;
        role?: string | undefined;
        name?: string | undefined;
    }[];
    coordinates?: {
        x: number;
        y: number;
    } | undefined;
}, {
    locators: {
        value: string;
        strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
        role?: string | undefined;
        name?: string | undefined;
        score?: number | undefined;
    }[];
    coordinates?: {
        x: number;
        y: number;
    } | undefined;
}>;
export declare const ScrollOffsetSchema: z.ZodObject<{
    deltaX: z.ZodNumber;
    deltaY: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    deltaX: number;
    deltaY: number;
}, {
    deltaX: number;
    deltaY: number;
}>;
export declare const SwipeVectorSchema: z.ZodObject<{
    startX: z.ZodNumber;
    startY: z.ZodNumber;
    endX: z.ZodNumber;
    endY: z.ZodNumber;
    durationMs: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    durationMs: number;
}, {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    durationMs?: number | undefined;
}>;
export declare const ApiPayloadSchema: z.ZodEffects<z.ZodObject<{
    method: z.ZodEnum<["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]>;
    url: z.ZodString;
    headers: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodObject<{
        kind: z.ZodLiteral<"secret">;
        key: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        kind: "secret";
        key: string;
    }, {
        kind: "secret";
        key: string;
    }>]>>>;
    queryParams: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodObject<{
        kind: z.ZodLiteral<"secret">;
        key: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        kind: "secret";
        key: string;
    }, {
        kind: "secret";
        key: string;
    }>]>>>;
    bodyType: z.ZodDefault<z.ZodEnum<["none", "json", "form-data", "x-www-form-urlencoded", "raw"]>>;
    bodyContent: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
        kind: z.ZodLiteral<"secret">;
        key: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        kind: "secret";
        key: string;
    }, {
        kind: "secret";
        key: string;
    }>]>>;
    extractedVariables: z.ZodDefault<z.ZodArray<z.ZodObject<{
        variableName: z.ZodString;
        jsonPath: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        variableName: string;
        jsonPath: string;
    }, {
        variableName: string;
        jsonPath: string;
    }>, "many">>;
}, "strict", z.ZodTypeAny, {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
    url: string;
    headers: Record<string, string | {
        kind: "secret";
        key: string;
    }>;
    queryParams: Record<string, string | {
        kind: "secret";
        key: string;
    }>;
    bodyType: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw";
    extractedVariables: {
        variableName: string;
        jsonPath: string;
    }[];
    bodyContent?: string | {
        kind: "secret";
        key: string;
    } | undefined;
}, {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
    url: string;
    headers?: Record<string, string | {
        kind: "secret";
        key: string;
    }> | undefined;
    queryParams?: Record<string, string | {
        kind: "secret";
        key: string;
    }> | undefined;
    bodyType?: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw" | undefined;
    bodyContent?: string | {
        kind: "secret";
        key: string;
    } | undefined;
    extractedVariables?: {
        variableName: string;
        jsonPath: string;
    }[] | undefined;
}>, {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
    url: string;
    headers: Record<string, string | {
        kind: "secret";
        key: string;
    }>;
    queryParams: Record<string, string | {
        kind: "secret";
        key: string;
    }>;
    bodyType: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw";
    extractedVariables: {
        variableName: string;
        jsonPath: string;
    }[];
    bodyContent?: string | {
        kind: "secret";
        key: string;
    } | undefined;
}, {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
    url: string;
    headers?: Record<string, string | {
        kind: "secret";
        key: string;
    }> | undefined;
    queryParams?: Record<string, string | {
        kind: "secret";
        key: string;
    }> | undefined;
    bodyType?: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw" | undefined;
    bodyContent?: string | {
        kind: "secret";
        key: string;
    } | undefined;
    extractedVariables?: {
        variableName: string;
        jsonPath: string;
    }[] | undefined;
}>;
export declare const AssertionOperatorSchema: z.ZodEnum<["equals", "notEquals", "contains", "matches", "greaterThan", "greaterThanOrEqual", "lessThan", "lessThanOrEqual", "exists", "notExists"]>;
export declare const AssertionSchema: z.ZodEffects<z.ZodObject<{
    operator: z.ZodDefault<z.ZodEnum<["equals", "notEquals", "contains", "matches", "greaterThan", "greaterThanOrEqual", "lessThan", "lessThanOrEqual", "exists", "notExists"]>>;
    expected: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull, z.ZodObject<{
        kind: z.ZodLiteral<"secret">;
        key: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        kind: "secret";
        key: string;
    }, {
        kind: "secret";
        key: string;
    }>]>>;
    jsonPath: z.ZodOptional<z.ZodString>;
    headerName: z.ZodOptional<z.ZodString>;
    maxDurationMs: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    operator: "equals" | "notEquals" | "contains" | "matches" | "greaterThan" | "greaterThanOrEqual" | "lessThan" | "lessThanOrEqual" | "exists" | "notExists";
    expected?: string | number | boolean | {
        kind: "secret";
        key: string;
    } | null | undefined;
    jsonPath?: string | undefined;
    headerName?: string | undefined;
    maxDurationMs?: number | undefined;
}, {
    expected?: string | number | boolean | {
        kind: "secret";
        key: string;
    } | null | undefined;
    jsonPath?: string | undefined;
    operator?: "equals" | "notEquals" | "contains" | "matches" | "greaterThan" | "greaterThanOrEqual" | "lessThan" | "lessThanOrEqual" | "exists" | "notExists" | undefined;
    headerName?: string | undefined;
    maxDurationMs?: number | undefined;
}>, {
    operator: "equals" | "notEquals" | "contains" | "matches" | "greaterThan" | "greaterThanOrEqual" | "lessThan" | "lessThanOrEqual" | "exists" | "notExists";
    expected?: string | number | boolean | {
        kind: "secret";
        key: string;
    } | null | undefined;
    jsonPath?: string | undefined;
    headerName?: string | undefined;
    maxDurationMs?: number | undefined;
}, {
    expected?: string | number | boolean | {
        kind: "secret";
        key: string;
    } | null | undefined;
    jsonPath?: string | undefined;
    operator?: "equals" | "notEquals" | "contains" | "matches" | "greaterThan" | "greaterThanOrEqual" | "lessThan" | "lessThanOrEqual" | "exists" | "notExists" | undefined;
    headerName?: string | undefined;
    maxDurationMs?: number | undefined;
}>;
export type Assertion = z.infer<typeof AssertionSchema>;
export declare const ActionIRSchema: z.ZodEffects<z.ZodObject<{
    id: z.ZodString;
    schemaVersion: z.ZodDefault<z.ZodUnion<[z.ZodLiteral<1>, z.ZodLiteral<2>]>>;
    stepNumber: z.ZodNumber;
    platform: z.ZodEnum<["web", "android", "api"]>;
    action: z.ZodEnum<["navigate", "click", "doubleClick", "rightClick", "hover", "fill", "clear", "pressKey", "scroll", "dragAndDrop", "waitFor", "sleep", "takeScreenshot", "tap", "doubleTap", "longPress", "swipe", "drag", "pinch", "back", "home", "enter", "launchApp", "closeApp", "httpRequest", "assertVisible", "assertHidden", "assertText", "assertValue", "assertAttribute", "assertUrl", "assertStatusCode", "assertJsonPath", "assertHeader", "assertResponseTime"]>;
    description: z.ZodOptional<z.ZodString>;
    locators: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodObject<{
        strategy: z.ZodEnum<["testId", "role", "accessibilityId", "resourceId", "label", "id", "name", "text", "css", "xpath", "bounds"]>;
        value: z.ZodString;
        role: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
        score: z.ZodDefault<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        value: string;
        strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
        score: number;
        role?: string | undefined;
        name?: string | undefined;
    }, {
        value: string;
        strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
        role?: string | undefined;
        name?: string | undefined;
        score?: number | undefined;
    }>, {
        value: string;
        strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
        score: number;
        role?: string | undefined;
        name?: string | undefined;
    }, {
        value: string;
        strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
        role?: string | undefined;
        name?: string | undefined;
        score?: number | undefined;
    }>, "many">>;
    value: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
        kind: z.ZodLiteral<"secret">;
        key: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        kind: "secret";
        key: string;
    }, {
        kind: "secret";
        key: string;
    }>]>>;
    attributeName: z.ZodOptional<z.ZodString>;
    expectedValue: z.ZodOptional<z.ZodString>;
    dragTarget: z.ZodOptional<z.ZodObject<{
        locators: z.ZodArray<z.ZodEffects<z.ZodObject<{
            strategy: z.ZodEnum<["testId", "role", "accessibilityId", "resourceId", "label", "id", "name", "text", "css", "xpath", "bounds"]>;
            value: z.ZodString;
            role: z.ZodOptional<z.ZodString>;
            name: z.ZodOptional<z.ZodString>;
            score: z.ZodDefault<z.ZodNumber>;
        }, "strict", z.ZodTypeAny, {
            value: string;
            strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
            score: number;
            role?: string | undefined;
            name?: string | undefined;
        }, {
            value: string;
            strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
            role?: string | undefined;
            name?: string | undefined;
            score?: number | undefined;
        }>, {
            value: string;
            strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
            score: number;
            role?: string | undefined;
            name?: string | undefined;
        }, {
            value: string;
            strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
            role?: string | undefined;
            name?: string | undefined;
            score?: number | undefined;
        }>, "many">;
        coordinates: z.ZodOptional<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
        }, "strict", z.ZodTypeAny, {
            x: number;
            y: number;
        }, {
            x: number;
            y: number;
        }>>;
    }, "strict", z.ZodTypeAny, {
        locators: {
            value: string;
            strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
            score: number;
            role?: string | undefined;
            name?: string | undefined;
        }[];
        coordinates?: {
            x: number;
            y: number;
        } | undefined;
    }, {
        locators: {
            value: string;
            strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
            role?: string | undefined;
            name?: string | undefined;
            score?: number | undefined;
        }[];
        coordinates?: {
            x: number;
            y: number;
        } | undefined;
    }>>;
    scrollOffset: z.ZodOptional<z.ZodObject<{
        deltaX: z.ZodNumber;
        deltaY: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        deltaX: number;
        deltaY: number;
    }, {
        deltaX: number;
        deltaY: number;
    }>>;
    swipeVector: z.ZodOptional<z.ZodObject<{
        startX: z.ZodNumber;
        startY: z.ZodNumber;
        endX: z.ZodNumber;
        endY: z.ZodNumber;
        durationMs: z.ZodDefault<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        startX: number;
        startY: number;
        endX: number;
        endY: number;
        durationMs: number;
    }, {
        startX: number;
        startY: number;
        endX: number;
        endY: number;
        durationMs?: number | undefined;
    }>>;
    coordinates: z.ZodOptional<z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        x: number;
        y: number;
    }, {
        x: number;
        y: number;
    }>>;
    apiPayload: z.ZodOptional<z.ZodEffects<z.ZodObject<{
        method: z.ZodEnum<["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]>;
        url: z.ZodString;
        headers: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodObject<{
            kind: z.ZodLiteral<"secret">;
            key: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            kind: "secret";
            key: string;
        }, {
            kind: "secret";
            key: string;
        }>]>>>;
        queryParams: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodObject<{
            kind: z.ZodLiteral<"secret">;
            key: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            kind: "secret";
            key: string;
        }, {
            kind: "secret";
            key: string;
        }>]>>>;
        bodyType: z.ZodDefault<z.ZodEnum<["none", "json", "form-data", "x-www-form-urlencoded", "raw"]>>;
        bodyContent: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
            kind: z.ZodLiteral<"secret">;
            key: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            kind: "secret";
            key: string;
        }, {
            kind: "secret";
            key: string;
        }>]>>;
        extractedVariables: z.ZodDefault<z.ZodArray<z.ZodObject<{
            variableName: z.ZodString;
            jsonPath: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            variableName: string;
            jsonPath: string;
        }, {
            variableName: string;
            jsonPath: string;
        }>, "many">>;
    }, "strict", z.ZodTypeAny, {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
        url: string;
        headers: Record<string, string | {
            kind: "secret";
            key: string;
        }>;
        queryParams: Record<string, string | {
            kind: "secret";
            key: string;
        }>;
        bodyType: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw";
        extractedVariables: {
            variableName: string;
            jsonPath: string;
        }[];
        bodyContent?: string | {
            kind: "secret";
            key: string;
        } | undefined;
    }, {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
        url: string;
        headers?: Record<string, string | {
            kind: "secret";
            key: string;
        }> | undefined;
        queryParams?: Record<string, string | {
            kind: "secret";
            key: string;
        }> | undefined;
        bodyType?: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw" | undefined;
        bodyContent?: string | {
            kind: "secret";
            key: string;
        } | undefined;
        extractedVariables?: {
            variableName: string;
            jsonPath: string;
        }[] | undefined;
    }>, {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
        url: string;
        headers: Record<string, string | {
            kind: "secret";
            key: string;
        }>;
        queryParams: Record<string, string | {
            kind: "secret";
            key: string;
        }>;
        bodyType: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw";
        extractedVariables: {
            variableName: string;
            jsonPath: string;
        }[];
        bodyContent?: string | {
            kind: "secret";
            key: string;
        } | undefined;
    }, {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
        url: string;
        headers?: Record<string, string | {
            kind: "secret";
            key: string;
        }> | undefined;
        queryParams?: Record<string, string | {
            kind: "secret";
            key: string;
        }> | undefined;
        bodyType?: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw" | undefined;
        bodyContent?: string | {
            kind: "secret";
            key: string;
        } | undefined;
        extractedVariables?: {
            variableName: string;
            jsonPath: string;
        }[] | undefined;
    }>>;
    assertion: z.ZodOptional<z.ZodEffects<z.ZodObject<{
        operator: z.ZodDefault<z.ZodEnum<["equals", "notEquals", "contains", "matches", "greaterThan", "greaterThanOrEqual", "lessThan", "lessThanOrEqual", "exists", "notExists"]>>;
        expected: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull, z.ZodObject<{
            kind: z.ZodLiteral<"secret">;
            key: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            kind: "secret";
            key: string;
        }, {
            kind: "secret";
            key: string;
        }>]>>;
        jsonPath: z.ZodOptional<z.ZodString>;
        headerName: z.ZodOptional<z.ZodString>;
        maxDurationMs: z.ZodOptional<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        operator: "equals" | "notEquals" | "contains" | "matches" | "greaterThan" | "greaterThanOrEqual" | "lessThan" | "lessThanOrEqual" | "exists" | "notExists";
        expected?: string | number | boolean | {
            kind: "secret";
            key: string;
        } | null | undefined;
        jsonPath?: string | undefined;
        headerName?: string | undefined;
        maxDurationMs?: number | undefined;
    }, {
        expected?: string | number | boolean | {
            kind: "secret";
            key: string;
        } | null | undefined;
        jsonPath?: string | undefined;
        operator?: "equals" | "notEquals" | "contains" | "matches" | "greaterThan" | "greaterThanOrEqual" | "lessThan" | "lessThanOrEqual" | "exists" | "notExists" | undefined;
        headerName?: string | undefined;
        maxDurationMs?: number | undefined;
    }>, {
        operator: "equals" | "notEquals" | "contains" | "matches" | "greaterThan" | "greaterThanOrEqual" | "lessThan" | "lessThanOrEqual" | "exists" | "notExists";
        expected?: string | number | boolean | {
            kind: "secret";
            key: string;
        } | null | undefined;
        jsonPath?: string | undefined;
        headerName?: string | undefined;
        maxDurationMs?: number | undefined;
    }, {
        expected?: string | number | boolean | {
            kind: "secret";
            key: string;
        } | null | undefined;
        jsonPath?: string | undefined;
        operator?: "equals" | "notEquals" | "contains" | "matches" | "greaterThan" | "greaterThanOrEqual" | "lessThan" | "lessThanOrEqual" | "exists" | "notExists" | undefined;
        headerName?: string | undefined;
        maxDurationMs?: number | undefined;
    }>>;
    timeoutMs: z.ZodDefault<z.ZodNumber>;
    optional: z.ZodDefault<z.ZodBoolean>;
    timestamp: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    id: string;
    schemaVersion: 1 | 2;
    action: "fill" | "navigate" | "click" | "doubleClick" | "rightClick" | "hover" | "clear" | "pressKey" | "scroll" | "dragAndDrop" | "waitFor" | "sleep" | "takeScreenshot" | "tap" | "doubleTap" | "longPress" | "swipe" | "drag" | "pinch" | "back" | "home" | "enter" | "launchApp" | "closeApp" | "httpRequest" | "assertVisible" | "assertHidden" | "assertText" | "assertValue" | "assertAttribute" | "assertUrl" | "assertStatusCode" | "assertJsonPath" | "assertHeader" | "assertResponseTime";
    stepNumber: number;
    platform: "web" | "android" | "api";
    timeoutMs: number;
    optional: boolean;
    timestamp: number;
    value?: string | {
        kind: "secret";
        key: string;
    } | undefined;
    locators?: {
        value: string;
        strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
        score: number;
        role?: string | undefined;
        name?: string | undefined;
    }[] | undefined;
    coordinates?: {
        x: number;
        y: number;
    } | undefined;
    apiPayload?: {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
        url: string;
        headers: Record<string, string | {
            kind: "secret";
            key: string;
        }>;
        queryParams: Record<string, string | {
            kind: "secret";
            key: string;
        }>;
        bodyType: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw";
        extractedVariables: {
            variableName: string;
            jsonPath: string;
        }[];
        bodyContent?: string | {
            kind: "secret";
            key: string;
        } | undefined;
    } | undefined;
    dragTarget?: {
        locators: {
            value: string;
            strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
            score: number;
            role?: string | undefined;
            name?: string | undefined;
        }[];
        coordinates?: {
            x: number;
            y: number;
        } | undefined;
    } | undefined;
    scrollOffset?: {
        deltaX: number;
        deltaY: number;
    } | undefined;
    swipeVector?: {
        startX: number;
        startY: number;
        endX: number;
        endY: number;
        durationMs: number;
    } | undefined;
    expectedValue?: string | undefined;
    attributeName?: string | undefined;
    assertion?: {
        operator: "equals" | "notEquals" | "contains" | "matches" | "greaterThan" | "greaterThanOrEqual" | "lessThan" | "lessThanOrEqual" | "exists" | "notExists";
        expected?: string | number | boolean | {
            kind: "secret";
            key: string;
        } | null | undefined;
        jsonPath?: string | undefined;
        headerName?: string | undefined;
        maxDurationMs?: number | undefined;
    } | undefined;
    description?: string | undefined;
}, {
    id: string;
    action: "fill" | "navigate" | "click" | "doubleClick" | "rightClick" | "hover" | "clear" | "pressKey" | "scroll" | "dragAndDrop" | "waitFor" | "sleep" | "takeScreenshot" | "tap" | "doubleTap" | "longPress" | "swipe" | "drag" | "pinch" | "back" | "home" | "enter" | "launchApp" | "closeApp" | "httpRequest" | "assertVisible" | "assertHidden" | "assertText" | "assertValue" | "assertAttribute" | "assertUrl" | "assertStatusCode" | "assertJsonPath" | "assertHeader" | "assertResponseTime";
    stepNumber: number;
    platform: "web" | "android" | "api";
    value?: string | {
        kind: "secret";
        key: string;
    } | undefined;
    schemaVersion?: 1 | 2 | undefined;
    locators?: {
        value: string;
        strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
        role?: string | undefined;
        name?: string | undefined;
        score?: number | undefined;
    }[] | undefined;
    coordinates?: {
        x: number;
        y: number;
    } | undefined;
    apiPayload?: {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
        url: string;
        headers?: Record<string, string | {
            kind: "secret";
            key: string;
        }> | undefined;
        queryParams?: Record<string, string | {
            kind: "secret";
            key: string;
        }> | undefined;
        bodyType?: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw" | undefined;
        bodyContent?: string | {
            kind: "secret";
            key: string;
        } | undefined;
        extractedVariables?: {
            variableName: string;
            jsonPath: string;
        }[] | undefined;
    } | undefined;
    dragTarget?: {
        locators: {
            value: string;
            strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
            role?: string | undefined;
            name?: string | undefined;
            score?: number | undefined;
        }[];
        coordinates?: {
            x: number;
            y: number;
        } | undefined;
    } | undefined;
    scrollOffset?: {
        deltaX: number;
        deltaY: number;
    } | undefined;
    swipeVector?: {
        startX: number;
        startY: number;
        endX: number;
        endY: number;
        durationMs?: number | undefined;
    } | undefined;
    expectedValue?: string | undefined;
    attributeName?: string | undefined;
    assertion?: {
        expected?: string | number | boolean | {
            kind: "secret";
            key: string;
        } | null | undefined;
        jsonPath?: string | undefined;
        operator?: "equals" | "notEquals" | "contains" | "matches" | "greaterThan" | "greaterThanOrEqual" | "lessThan" | "lessThanOrEqual" | "exists" | "notExists" | undefined;
        headerName?: string | undefined;
        maxDurationMs?: number | undefined;
    } | undefined;
    description?: string | undefined;
    timeoutMs?: number | undefined;
    optional?: boolean | undefined;
    timestamp?: number | undefined;
}>, {
    id: string;
    schemaVersion: 1 | 2;
    action: "fill" | "navigate" | "click" | "doubleClick" | "rightClick" | "hover" | "clear" | "pressKey" | "scroll" | "dragAndDrop" | "waitFor" | "sleep" | "takeScreenshot" | "tap" | "doubleTap" | "longPress" | "swipe" | "drag" | "pinch" | "back" | "home" | "enter" | "launchApp" | "closeApp" | "httpRequest" | "assertVisible" | "assertHidden" | "assertText" | "assertValue" | "assertAttribute" | "assertUrl" | "assertStatusCode" | "assertJsonPath" | "assertHeader" | "assertResponseTime";
    stepNumber: number;
    platform: "web" | "android" | "api";
    timeoutMs: number;
    optional: boolean;
    timestamp: number;
    value?: string | {
        kind: "secret";
        key: string;
    } | undefined;
    locators?: {
        value: string;
        strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
        score: number;
        role?: string | undefined;
        name?: string | undefined;
    }[] | undefined;
    coordinates?: {
        x: number;
        y: number;
    } | undefined;
    apiPayload?: {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
        url: string;
        headers: Record<string, string | {
            kind: "secret";
            key: string;
        }>;
        queryParams: Record<string, string | {
            kind: "secret";
            key: string;
        }>;
        bodyType: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw";
        extractedVariables: {
            variableName: string;
            jsonPath: string;
        }[];
        bodyContent?: string | {
            kind: "secret";
            key: string;
        } | undefined;
    } | undefined;
    dragTarget?: {
        locators: {
            value: string;
            strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
            score: number;
            role?: string | undefined;
            name?: string | undefined;
        }[];
        coordinates?: {
            x: number;
            y: number;
        } | undefined;
    } | undefined;
    scrollOffset?: {
        deltaX: number;
        deltaY: number;
    } | undefined;
    swipeVector?: {
        startX: number;
        startY: number;
        endX: number;
        endY: number;
        durationMs: number;
    } | undefined;
    expectedValue?: string | undefined;
    attributeName?: string | undefined;
    assertion?: {
        operator: "equals" | "notEquals" | "contains" | "matches" | "greaterThan" | "greaterThanOrEqual" | "lessThan" | "lessThanOrEqual" | "exists" | "notExists";
        expected?: string | number | boolean | {
            kind: "secret";
            key: string;
        } | null | undefined;
        jsonPath?: string | undefined;
        headerName?: string | undefined;
        maxDurationMs?: number | undefined;
    } | undefined;
    description?: string | undefined;
}, {
    id: string;
    action: "fill" | "navigate" | "click" | "doubleClick" | "rightClick" | "hover" | "clear" | "pressKey" | "scroll" | "dragAndDrop" | "waitFor" | "sleep" | "takeScreenshot" | "tap" | "doubleTap" | "longPress" | "swipe" | "drag" | "pinch" | "back" | "home" | "enter" | "launchApp" | "closeApp" | "httpRequest" | "assertVisible" | "assertHidden" | "assertText" | "assertValue" | "assertAttribute" | "assertUrl" | "assertStatusCode" | "assertJsonPath" | "assertHeader" | "assertResponseTime";
    stepNumber: number;
    platform: "web" | "android" | "api";
    value?: string | {
        kind: "secret";
        key: string;
    } | undefined;
    schemaVersion?: 1 | 2 | undefined;
    locators?: {
        value: string;
        strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
        role?: string | undefined;
        name?: string | undefined;
        score?: number | undefined;
    }[] | undefined;
    coordinates?: {
        x: number;
        y: number;
    } | undefined;
    apiPayload?: {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
        url: string;
        headers?: Record<string, string | {
            kind: "secret";
            key: string;
        }> | undefined;
        queryParams?: Record<string, string | {
            kind: "secret";
            key: string;
        }> | undefined;
        bodyType?: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw" | undefined;
        bodyContent?: string | {
            kind: "secret";
            key: string;
        } | undefined;
        extractedVariables?: {
            variableName: string;
            jsonPath: string;
        }[] | undefined;
    } | undefined;
    dragTarget?: {
        locators: {
            value: string;
            strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
            role?: string | undefined;
            name?: string | undefined;
            score?: number | undefined;
        }[];
        coordinates?: {
            x: number;
            y: number;
        } | undefined;
    } | undefined;
    scrollOffset?: {
        deltaX: number;
        deltaY: number;
    } | undefined;
    swipeVector?: {
        startX: number;
        startY: number;
        endX: number;
        endY: number;
        durationMs?: number | undefined;
    } | undefined;
    expectedValue?: string | undefined;
    attributeName?: string | undefined;
    assertion?: {
        expected?: string | number | boolean | {
            kind: "secret";
            key: string;
        } | null | undefined;
        jsonPath?: string | undefined;
        operator?: "equals" | "notEquals" | "contains" | "matches" | "greaterThan" | "greaterThanOrEqual" | "lessThan" | "lessThanOrEqual" | "exists" | "notExists" | undefined;
        headerName?: string | undefined;
        maxDurationMs?: number | undefined;
    } | undefined;
    description?: string | undefined;
    timeoutMs?: number | undefined;
    optional?: boolean | undefined;
    timestamp?: number | undefined;
}>;
export type ActionIR = z.infer<typeof ActionIRSchema>;
export declare function isSecretRef(value: unknown): value is SecretRef;
export type AssertionActionType = typeof ASSERTION_ACTIONS[number];
export declare function isAssertionAction(action: ActionType): action is AssertionActionType;
export declare function isActionAllowedOnPlatform(platform: PlatformType, action: ActionType): boolean;
//# sourceMappingURL=actions.d.ts.map