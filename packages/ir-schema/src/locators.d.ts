import { z } from 'zod';
export declare const LocatorStrategySchema: z.ZodEnum<["testId", "role", "accessibilityId", "resourceId", "label", "id", "name", "text", "css", "xpath", "bounds"]>;
export type LocatorStrategy = z.infer<typeof LocatorStrategySchema>;
export declare const LocatorCandidateSchema: z.ZodObject<{
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
}>;
export type LocatorCandidate = z.infer<typeof LocatorCandidateSchema>;
//# sourceMappingURL=locators.d.ts.map