import { z } from 'zod';
export declare const PlatformTypeSchema: z.ZodEnum<["web", "android", "api"]>;
export type PlatformType = z.infer<typeof PlatformTypeSchema>;
export declare const ActionTypeSchema: z.ZodEnum<["navigate", "click", "doubleClick", "rightClick", "hover", "fill", "clear", "pressKey", "scroll", "dragAndDrop", "waitFor", "sleep", "takeScreenshot", "tap", "longPress", "swipe", "pinch", "back", "home", "launchApp", "closeApp", "httpRequest", "assertVisible", "assertHidden", "assertText", "assertValue", "assertAttribute", "assertUrl", "assertStatusCode", "assertJsonPath"]>;
export type ActionType = z.infer<typeof ActionTypeSchema>;
export declare const DragTargetSchema: z.ZodObject<{
    locators: z.ZodArray<z.ZodObject<{
        strategy: z.ZodEnum<["testId", "role", "accessibilityId", "resourceId", "label", "id", "name", "text", "css", "xpath", "bounds"]>;
        value: z.ZodString;
        role: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
        score: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
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
    }, "strip", z.ZodTypeAny, {
        x: number;
        y: number;
    }, {
        x: number;
        y: number;
    }>>;
}, "strip", z.ZodTypeAny, {
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
}, "strip", z.ZodTypeAny, {
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
}, "strip", z.ZodTypeAny, {
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
export declare const ApiPayloadSchema: z.ZodObject<{
    method: z.ZodEnum<["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]>;
    url: z.ZodString;
    headers: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    queryParams: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    bodyType: z.ZodDefault<z.ZodEnum<["none", "json", "form-data", "x-www-form-urlencoded", "raw"]>>;
    bodyContent: z.ZodOptional<z.ZodString>;
    extractedVariables: z.ZodDefault<z.ZodArray<z.ZodObject<{
        variableName: z.ZodString;
        jsonPath: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        variableName: string;
        jsonPath: string;
    }, {
        variableName: string;
        jsonPath: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
    url: string;
    headers: Record<string, string>;
    queryParams: Record<string, string>;
    bodyType: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw";
    extractedVariables: {
        variableName: string;
        jsonPath: string;
    }[];
    bodyContent?: string | undefined;
}, {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
    url: string;
    headers?: Record<string, string> | undefined;
    queryParams?: Record<string, string> | undefined;
    bodyType?: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw" | undefined;
    bodyContent?: string | undefined;
    extractedVariables?: {
        variableName: string;
        jsonPath: string;
    }[] | undefined;
}>;
export declare const ActionIRSchema: z.ZodObject<{
    id: z.ZodString;
    stepNumber: z.ZodNumber;
    platform: z.ZodEnum<["web", "android", "api"]>;
    action: z.ZodEnum<["navigate", "click", "doubleClick", "rightClick", "hover", "fill", "clear", "pressKey", "scroll", "dragAndDrop", "waitFor", "sleep", "takeScreenshot", "tap", "longPress", "swipe", "pinch", "back", "home", "launchApp", "closeApp", "httpRequest", "assertVisible", "assertHidden", "assertText", "assertValue", "assertAttribute", "assertUrl", "assertStatusCode", "assertJsonPath"]>;
    description: z.ZodOptional<z.ZodString>;
    locators: z.ZodOptional<z.ZodArray<z.ZodObject<{
        strategy: z.ZodEnum<["testId", "role", "accessibilityId", "resourceId", "label", "id", "name", "text", "css", "xpath", "bounds"]>;
        value: z.ZodString;
        role: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
        score: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
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
    value: z.ZodOptional<z.ZodString>;
    attributeName: z.ZodOptional<z.ZodString>;
    expectedValue: z.ZodOptional<z.ZodString>;
    dragTarget: z.ZodOptional<z.ZodObject<{
        locators: z.ZodArray<z.ZodObject<{
            strategy: z.ZodEnum<["testId", "role", "accessibilityId", "resourceId", "label", "id", "name", "text", "css", "xpath", "bounds"]>;
            value: z.ZodString;
            role: z.ZodOptional<z.ZodString>;
            name: z.ZodOptional<z.ZodString>;
            score: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
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
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
        }, {
            x: number;
            y: number;
        }>>;
    }, "strip", z.ZodTypeAny, {
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
    }, "strip", z.ZodTypeAny, {
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
    }, "strip", z.ZodTypeAny, {
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
    apiPayload: z.ZodOptional<z.ZodObject<{
        method: z.ZodEnum<["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]>;
        url: z.ZodString;
        headers: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        queryParams: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        bodyType: z.ZodDefault<z.ZodEnum<["none", "json", "form-data", "x-www-form-urlencoded", "raw"]>>;
        bodyContent: z.ZodOptional<z.ZodString>;
        extractedVariables: z.ZodDefault<z.ZodArray<z.ZodObject<{
            variableName: z.ZodString;
            jsonPath: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            variableName: string;
            jsonPath: string;
        }, {
            variableName: string;
            jsonPath: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
        url: string;
        headers: Record<string, string>;
        queryParams: Record<string, string>;
        bodyType: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw";
        extractedVariables: {
            variableName: string;
            jsonPath: string;
        }[];
        bodyContent?: string | undefined;
    }, {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
        url: string;
        headers?: Record<string, string> | undefined;
        queryParams?: Record<string, string> | undefined;
        bodyType?: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw" | undefined;
        bodyContent?: string | undefined;
        extractedVariables?: {
            variableName: string;
            jsonPath: string;
        }[] | undefined;
    }>>;
    timeoutMs: z.ZodDefault<z.ZodNumber>;
    optional: z.ZodDefault<z.ZodBoolean>;
    timestamp: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    stepNumber: number;
    platform: "web" | "android" | "api";
    action: "fill" | "navigate" | "click" | "doubleClick" | "rightClick" | "hover" | "clear" | "pressKey" | "scroll" | "dragAndDrop" | "waitFor" | "sleep" | "takeScreenshot" | "tap" | "longPress" | "swipe" | "pinch" | "back" | "home" | "launchApp" | "closeApp" | "httpRequest" | "assertVisible" | "assertHidden" | "assertText" | "assertValue" | "assertAttribute" | "assertUrl" | "assertStatusCode" | "assertJsonPath";
    timeoutMs: number;
    optional: boolean;
    timestamp: number;
    value?: string | undefined;
    locators?: {
        value: string;
        strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
        score: number;
        role?: string | undefined;
        name?: string | undefined;
    }[] | undefined;
    description?: string | undefined;
    attributeName?: string | undefined;
    expectedValue?: string | undefined;
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
    apiPayload?: {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
        url: string;
        headers: Record<string, string>;
        queryParams: Record<string, string>;
        bodyType: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw";
        extractedVariables: {
            variableName: string;
            jsonPath: string;
        }[];
        bodyContent?: string | undefined;
    } | undefined;
}, {
    id: string;
    stepNumber: number;
    platform: "web" | "android" | "api";
    action: "fill" | "navigate" | "click" | "doubleClick" | "rightClick" | "hover" | "clear" | "pressKey" | "scroll" | "dragAndDrop" | "waitFor" | "sleep" | "takeScreenshot" | "tap" | "longPress" | "swipe" | "pinch" | "back" | "home" | "launchApp" | "closeApp" | "httpRequest" | "assertVisible" | "assertHidden" | "assertText" | "assertValue" | "assertAttribute" | "assertUrl" | "assertStatusCode" | "assertJsonPath";
    value?: string | undefined;
    locators?: {
        value: string;
        strategy: "testId" | "role" | "accessibilityId" | "resourceId" | "label" | "id" | "name" | "text" | "css" | "xpath" | "bounds";
        role?: string | undefined;
        name?: string | undefined;
        score?: number | undefined;
    }[] | undefined;
    description?: string | undefined;
    attributeName?: string | undefined;
    expectedValue?: string | undefined;
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
    apiPayload?: {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
        url: string;
        headers?: Record<string, string> | undefined;
        queryParams?: Record<string, string> | undefined;
        bodyType?: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw" | undefined;
        bodyContent?: string | undefined;
        extractedVariables?: {
            variableName: string;
            jsonPath: string;
        }[] | undefined;
    } | undefined;
    timeoutMs?: number | undefined;
    optional?: boolean | undefined;
    timestamp?: number | undefined;
}>;
export type ActionIR = z.infer<typeof ActionIRSchema>;
//# sourceMappingURL=actions.d.ts.map