import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { GeneratorFactory } from '../src/factory.js';
import { SessionIR } from '@automate-plus/ir-schema';

describe('Matrix 27 Generators: Syntax Validation and AST Integrity Audit', () => {
  const webSession: SessionIR = {
    id: 'b1000000-0000-4000-8000-000000000001',
    projectId: 'a1000000-0000-4000-8000-000000000001',
    name: 'SauceDemo_E2E_Audit',
    platform: 'web',
    targetConfig: {
      startUrl: 'https://www.saucedemo.com/',
      viewport: { width: 1280, height: 800 },
    },
    environmentVariables: {},
    steps: [
      {
        id: 'c1000001-0000-4000-8000-000000000001',
        schemaVersion: 2,
        stepNumber: 1,
        platform: 'web',
        action: 'navigate',
        value: 'https://www.saucedemo.com/',
        timeoutMs: 5000,
        timestamp: 1,
      },
      {
        id: 'c1000002-0000-4000-8000-000000000002',
        schemaVersion: 2,
        stepNumber: 2,
        platform: 'web',
        action: 'fill',
        locators: [
          { strategy: 'id', value: 'user-name', score: 100 },
          { strategy: 'css', value: '#user-name', score: 80 },
        ],
        value: 'standard_user',
        timeoutMs: 5000,
        timestamp: 2,
      },
      {
        id: 'c1000003-0000-4000-8000-000000000003',
        schemaVersion: 2,
        stepNumber: 3,
        platform: 'web',
        action: 'fill',
        locators: [
          { strategy: 'id', value: 'password', score: 100 },
          { strategy: 'css', value: '#password', score: 80 },
        ],
        value: 'secret_sauce',
        timeoutMs: 5000,
        timestamp: 3,
      },
      {
        id: 'c1000004-0000-4000-8000-000000000004',
        schemaVersion: 2,
        stepNumber: 4,
        platform: 'web',
        action: 'click',
        locators: [
          { strategy: 'id', value: 'login-button', score: 100 },
          { strategy: 'css', value: 'input[type="submit"]', score: 80 },
        ],
        timeoutMs: 5000,
        timestamp: 4,
      },
      {
        id: 'c1000005-0000-4000-8000-000000000005',
        schemaVersion: 2,
        stepNumber: 5,
        platform: 'web',
        action: 'assertVisible',
        locators: [{ strategy: 'css', value: '#inventory_container', score: 95 }],
        timeoutMs: 5000,
        timestamp: 5,
      },
      {
        id: 'c1000006-0000-4000-8000-000000000006',
        schemaVersion: 2,
        stepNumber: 6,
        platform: 'web',
        action: 'assertText',
        locators: [{ strategy: 'css', value: '.title', score: 90 }],
        expectedValue: 'Products',
        timeoutMs: 5000,
        timestamp: 6,
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  };

  const androidSession: SessionIR = {
    id: 'b2000000-0000-4000-8000-000000000002',
    projectId: 'a2000000-0000-4000-8000-000000000002',
    name: 'NotiPlus_Mobile_Audit',
    platform: 'android',
    targetConfig: {
      appPackage: 'com.notifplus',
      appActivity: 'com.notifplus.MainActivity',
    },
    environmentVariables: {},
    steps: [
      {
        id: 'c2000001-0000-4000-8000-000000000001',
        schemaVersion: 2,
        stepNumber: 1,
        platform: 'android',
        action: 'click',
        locators: [{ strategy: 'resourceId', value: 'com.notifplus:id/btn_start', score: 95 }],
        timeoutMs: 5000,
        timestamp: 1,
      },
      {
        id: 'c2000002-0000-4000-8000-000000000002',
        schemaVersion: 2,
        stepNumber: 2,
        platform: 'android',
        action: 'fill',
        locators: [{ strategy: 'resourceId', value: 'com.notifplus:id/input_title', score: 95 }],
        value: 'Audit Alert',
        timeoutMs: 5000,
        timestamp: 2,
      },
      {
        id: 'c2000003-0000-4000-8000-000000000003',
        schemaVersion: 2,
        stepNumber: 3,
        platform: 'android',
        action: 'click',
        locators: [{ strategy: 'resourceId', value: 'com.notifplus:id/btn_trigger', score: 95 }],
        timeoutMs: 5000,
        timestamp: 3,
      },
      {
        id: 'c2000004-0000-4000-8000-000000000004',
        schemaVersion: 2,
        stepNumber: 4,
        platform: 'android',
        action: 'assertVisible',
        locators: [{ strategy: 'resourceId', value: 'com.notifplus:id/status_view', score: 95 }],
        timeoutMs: 5000,
        timestamp: 4,
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  };

  const apiSession: SessionIR = {
    id: 'b3000000-0000-4000-8000-000000000003',
    projectId: 'a3000000-0000-4000-8000-000000000003',
    name: 'Petstore_Api_Audit',
    platform: 'api',
    targetConfig: {
      baseUrl: 'https://petstore.swagger.io/v2',
    },
    environmentVariables: {},
    steps: [
      {
        id: 'c3000001-0000-4000-8000-000000000001',
        schemaVersion: 2,
        stepNumber: 1,
        platform: 'api',
        action: 'httpRequest',
        apiPayload: {
          method: 'GET',
          url: 'https://petstore.swagger.io/v2/store/inventory',
          headers: { Accept: 'application/json' },
          queryParams: {},
          bodyType: 'none',
          extractedVariables: [],
        },
        timeoutMs: 5000,
        timestamp: 1,
      },
      {
        id: 'c3000002-0000-4000-8000-000000000002',
        schemaVersion: 2,
        stepNumber: 2,
        platform: 'api',
        action: 'assertStatusCode',
        expectedValue: '200',
        timeoutMs: 5000,
        timestamp: 2,
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  };

  function validateTypeScriptSyntax(code: string, fileName: string): void {
    const result = ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        noEmit: false,
      },
      reportDiagnostics: true,
      fileName,
    });
    const diagnostics = result.diagnostics ?? [];
    expect(diagnostics, `TypeScript compilation diagnostics for ${fileName}`).toHaveLength(0);
  }

  function validateBraceBalance(code: string, fileName: string): void {
    let balance = 0;
    for (const char of code) {
      if (char === '{') balance += 1;
      if (char === '}') balance -= 1;
    }
    expect(balance, `Brace balance for ${fileName}`).toBe(0);
  }

  // --- A. Web Automation (13 Generators) ---
  const webMatrix = [
    { framework: 'playwright', language: 'typescript', ext: 'ts' },
    { framework: 'playwright', language: 'javascript', ext: 'js' },
    { framework: 'playwright', language: 'python', ext: 'py' },
    { framework: 'playwright', language: 'java', ext: 'java' },
    { framework: 'cypress', language: 'typescript', ext: 'ts' },
    { framework: 'cypress', language: 'javascript', ext: 'js' },
    { framework: 'puppeteer', language: 'typescript', ext: 'ts' },
    { framework: 'puppeteer', language: 'javascript', ext: 'js' },
    { framework: 'selenium', language: 'typescript', ext: 'ts' },
    { framework: 'selenium', language: 'javascript', ext: 'js' },
    { framework: 'selenium', language: 'python', ext: 'py' },
    { framework: 'selenium', language: 'java', ext: 'java' },
    { framework: 'robot', language: 'robot', ext: 'robot' },
  ];

  for (const { framework, language, ext } of webMatrix) {
    it(`[Web] ${framework} (${language}): produces valid syntax and clean entrypoint`, async () => {
      const generator = GeneratorFactory.getGenerator(framework, language);
      const project = await generator.generateFullProject(webSession);

      expect(project.framework).toBe(framework);
      expect(project.language).toBe(language);
      expect(project.files.length).toBeGreaterThanOrEqual(1);

      const entrypointFile = project.files.find((f) => f.relativePath === project.entrypoint);
      expect(entrypointFile, `Entrypoint file must exist for ${framework}/${language}`).toBeDefined();
      const code = entrypointFile!.content;

      expect(code).not.toContain('TO' + 'DO');
      expect(code).not.toContain('50%,50%');

      if (ext === 'ts') {
        validateTypeScriptSyntax(code, entrypointFile!.relativePath);
      } else if (ext === 'js') {
        validateTypeScriptSyntax(code, entrypointFile!.relativePath);
      } else if (ext === 'py') {
        expect(code).toContain('def ');
      } else if (ext === 'java') {
        expect(code).toContain('public class ');
        validateBraceBalance(code, entrypointFile!.relativePath);
      } else if (ext === 'robot') {
        expect(code).toContain('*** Settings ***');
        expect(code).toContain('*** Test Cases ***');
      }
    });
  }

  // --- B. Android Mobile Automation (9 Generators) ---
  const androidMatrix = [
    { framework: 'appium', language: 'java', ext: 'java' },
    { framework: 'appium', language: 'kotlin', ext: 'kt' },
    { framework: 'appium', language: 'typescript', ext: 'ts' },
    { framework: 'appium', language: 'javascript', ext: 'js' },
    { framework: 'espresso', language: 'java', ext: 'java' },
    { framework: 'espresso', language: 'kotlin', ext: 'kt' },
    { framework: 'robolectric', language: 'java', ext: 'java' },
    { framework: 'robolectric', language: 'kotlin', ext: 'kt' },
    { framework: 'maestro', language: 'yaml', ext: 'yaml' },
  ];

  for (const { framework, language, ext } of androidMatrix) {
    it(`[Mobile] ${framework} (${language}): produces valid syntax and clean entrypoint`, async () => {
      const generator = GeneratorFactory.getGenerator(framework, language);
      const project = await generator.generateFullProject(androidSession);

      expect(project.framework).toBe(framework);
      expect(project.language).toBe(language);
      expect(project.files.length).toBeGreaterThanOrEqual(1);

      const entrypointFile = project.files.find((f) => f.relativePath === project.entrypoint);
      expect(entrypointFile, `Entrypoint file must exist for ${framework}/${language}`).toBeDefined();
      const code = entrypointFile!.content;

      expect(code).not.toContain('TO' + 'DO');

      if (ext === 'ts' || ext === 'js') {
        validateTypeScriptSyntax(code, entrypointFile!.relativePath);
      } else if (ext === 'java') {
        expect(code).toContain('class ');
        validateBraceBalance(code, entrypointFile!.relativePath);
      } else if (ext === 'kt') {
        expect(code).toContain('class ');
        validateBraceBalance(code, entrypointFile!.relativePath);
      } else if (ext === 'yaml') {
        expect(code).toContain('appId: "com.notifplus"');
      }
    });
  }

  // --- C. API Automation & Stress Testing (5 Generators) ---
  const apiMatrix = [
    { framework: 'k6', language: 'javascript', ext: 'js' },
    { framework: 'http', language: 'typescript', ext: 'ts' },
    { framework: 'http', language: 'javascript', ext: 'js' },
    { framework: 'http', language: 'python', ext: 'py' },
    { framework: 'http', language: 'java', ext: 'java' },
  ];

  for (const { framework, language, ext } of apiMatrix) {
    it(`[API] ${framework} (${language}): produces valid syntax and clean entrypoint`, async () => {
      const generator = GeneratorFactory.getGenerator(framework, language);
      const project = await generator.generateFullProject(apiSession);

      expect(project.framework).toBe(framework);
      expect(project.language).toBe(language);
      expect(project.files.length).toBeGreaterThanOrEqual(1);

      const entrypointFile = project.files.find((f) => f.relativePath === project.entrypoint);
      expect(entrypointFile, `Entrypoint file must exist for ${framework}/${language}`).toBeDefined();
      const code = entrypointFile!.content;

      expect(code).not.toContain('TO' + 'DO');

      if (ext === 'ts' || ext === 'js') {
        validateTypeScriptSyntax(code, entrypointFile!.relativePath);
      } else if (ext === 'py') {
        expect(code).toContain('import requests');
      } else if (ext === 'java') {
        expect(code).toContain('class ');
        validateBraceBalance(code, entrypointFile!.relativePath);
      }
    });
  }

  // --- Strict Self-Healing & Retry Mechanism Audits ---
  describe('Strict Self-Healing & Locator Ranking Invariants', () => {
    it('enforces maximum 8 candidates per action in manifest metadata', async () => {
      const project = await GeneratorFactory.getGenerator('playwright', 'typescript').generateFullProject(webSession);
      const manifestFile = project.files.find((f) => f.relativePath === 'automateplus.manifest.json');
      expect(manifestFile).toBeDefined();
      const manifest = JSON.parse(manifestFile!.content);
      expect(manifest.selfHealing.maxCandidatesPerAction).toBe(8);
      expect(manifest.selfHealing.evidencePolicy).toBe('recorded-locators-only');
    });

    it('emits retry helper ONLY for Playwright (TS/JS) and Appium (TS/JS)', async () => {
      const pwTs = await GeneratorFactory.getGenerator('playwright', 'typescript').generateFullProject(webSession);
      const pwJs = await GeneratorFactory.getGenerator('playwright', 'javascript').generateFullProject(webSession);
      const appiumTs = await GeneratorFactory.getGenerator('appium', 'typescript').generateFullProject(androidSession);
      const appiumJs = await GeneratorFactory.getGenerator('appium', 'javascript').generateFullProject(androidSession);

      expect(pwTs.files.some((f) => f.relativePath.includes('automateplus-healing'))).toBe(true);
      expect(pwJs.files.some((f) => f.relativePath.includes('automateplus-healing'))).toBe(true);
      expect(appiumTs.files.some((f) => f.relativePath.includes('automateplus-healing'))).toBe(true);
      expect(appiumJs.files.some((f) => f.relativePath.includes('automateplus-healing'))).toBe(true);

      const pwPy = await GeneratorFactory.getGenerator('playwright', 'python').generateFullProject(webSession);
      const appiumJava = await GeneratorFactory.getGenerator('appium', 'java').generateFullProject(androidSession);
      expect(pwPy.files.some((f) => f.relativePath.includes('automateplus-healing'))).toBe(false);
      expect(appiumJava.files.some((f) => f.relativePath.includes('automateplus-healing'))).toBe(false);
    });

    it('keeps non-JS/TS language execution blocked until verified runtime is present', async () => {
      const pwPy = await GeneratorFactory.getGenerator('playwright', 'python').generateFullProject(webSession);
      const manifest = JSON.parse(pwPy.files.find((f) => f.relativePath === 'automateplus.manifest.json')!.content);
      expect(manifest.selfHealing.runtimeRetry.status).toBe('not-generated');
      expect(manifest.selfHealing.runtimeRetry.reason).toContain('has no production retry helper');
    });
  });
});
