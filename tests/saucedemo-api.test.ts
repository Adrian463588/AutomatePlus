import { describe, expect, it } from 'vitest';
import { ActionIR, SessionIR, validateSessionIR } from '@automate-plus/ir-schema';
import { GeneratorFactory } from '@automate-plus/generators';
import { ApiFunctionalRunner } from '@automate-plus/runner-core';

// ComponentTest boundary: the HTTP response is injected; use e2e:online for real target traffic.
describe('ComponentTest fixture: SauceDemo API generator', () => {
  const saucedemoApiSteps: ActionIR[] = [
    {
      id: 'b1000000-0000-4000-8000-000000000001',
      schemaVersion: 2,
      stepNumber: 1,
      platform: 'api',
      action: 'httpRequest',
      apiPayload: {
        method: 'GET',
        url: 'https://www.saucedemo.com/',
        headers: {
          'User-Agent': 'AutomatePlus-Test-Runner/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
        queryParams: {},
        bodyType: 'none',
        extractedVariables: [],
      },
      timeoutMs: 5000,
      timestamp: 1000,
    },
    {
      id: 'b1000000-0000-4000-8000-000000000002',
      schemaVersion: 2,
      stepNumber: 2,
      platform: 'api',
      action: 'assertStatusCode',
      expectedValue: '200',
      timeoutMs: 5000,
      timestamp: 1050,
    },
    {
      id: 'b1000000-0000-4000-8000-000000000003',
      schemaVersion: 2,
      stepNumber: 3,
      platform: 'api',
      action: 'assertHeader',
      attributeName: 'content-type',
      expectedValue: 'text/html',
      timeoutMs: 5000,
      timestamp: 1100,
    },
    {
      id: 'b1000000-0000-4000-8000-000000000004',
      schemaVersion: 2,
      stepNumber: 4,
      platform: 'api',
      action: 'httpRequest',
      apiPayload: {
        method: 'POST',
        url: 'https://api.saucedemo.local/v1/auth/login',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer {{API_SECRET_KEY}}',
        },
        queryParams: {},
        bodyType: 'json',
        bodyContent: JSON.stringify({ username: 'standard_user', client: 'AutomatePlus' }),
        extractedVariables: [
          { variableName: 'sessionToken', jsonPath: '$.data.token' },
          { variableName: 'userId', jsonPath: '$.data.user.id' },
        ],
      },
      timeoutMs: 5000,
      timestamp: 1150,
    },
    {
      id: 'b1000000-0000-4000-8000-000000000005',
      schemaVersion: 2,
      stepNumber: 5,
      platform: 'api',
      action: 'assertStatusCode',
      expectedValue: '200',
      timeoutMs: 5000,
      timestamp: 1200,
    },
    {
      id: 'b1000000-0000-4000-8000-000000000006',
      schemaVersion: 2,
      stepNumber: 6,
      platform: 'api',
      action: 'assertJsonPath',
      attributeName: '$.data.user.username',
      expectedValue: 'standard_user',
      timeoutMs: 5000,
      timestamp: 1250,
    },
    {
      id: 'b1000000-0000-4000-8000-000000000007',
      schemaVersion: 2,
      stepNumber: 7,
      platform: 'api',
      action: 'httpRequest',
      apiPayload: {
        method: 'GET',
        url: 'https://api.saucedemo.local/v1/users/{{userId}}/cart',
        headers: {
          Authorization: 'Bearer {{sessionToken}}',
          Accept: 'application/json',
        },
        queryParams: { filter: 'active' },
        bodyType: 'none',
        extractedVariables: [],
      },
      timeoutMs: 5000,
      timestamp: 1300,
    },
    {
      id: 'b1000000-0000-4000-8000-000000000008',
      schemaVersion: 2,
      stepNumber: 8,
      platform: 'api',
      action: 'assertStatusCode',
      expectedValue: '200',
      timeoutMs: 5000,
      timestamp: 1350,
    },
    {
      id: 'b1000000-0000-4000-8000-000000000009',
      schemaVersion: 2,
      stepNumber: 9,
      platform: 'api',
      action: 'assertJsonPath',
      attributeName: '$.cart.itemCount',
      expectedValue: '0',
      timeoutMs: 5000,
      timestamp: 1400,
    },
  ];

  const saucedemoApiSession: SessionIR = {
    id: 'e1000000-0000-4000-8000-000000000001',
    schemaVersion: 2,
    projectId: 'c9a646d3-9c61-4cd7-bf11-7360058b730f',
    name: 'Saucedemo API Workflow',
    platform: 'api',
    targetConfig: {
      baseUrl: 'https://www.saucedemo.com/',
    },
    environmentVariables: {
      API_SECRET_KEY: { kind: 'secret', key: 'saucedemo.api.secret' },
    },
    steps: saucedemoApiSteps,
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
  };

  it('validates canonical SessionIR schema for Saucedemo API workflow', () => {
    const validation = validateSessionIR(saucedemoApiSession);
    expect(validation.success).toBe(true);
    expect(saucedemoApiSession.steps).toHaveLength(9);
    expect(saucedemoApiSession.environmentVariables.API_SECRET_KEY).toBeDefined();
  });

  it('generates executable HTTP TypeScript project for Saucedemo API', async () => {
    const generator = GeneratorFactory.getGenerator('http', 'typescript');
    const project = await generator.generateFullProject(saucedemoApiSession);

    expect(project.framework).toBe('http');
    expect(project.language).toBe('typescript');
    expect(project.files.length).toBeGreaterThanOrEqual(1);

    const testFile = project.files[0];
    expect(testFile?.content).toContain('axios');
    expect(testFile?.content).toContain('https://www.saucedemo.com/');
    expect(testFile?.content).toContain('standard_user');
  });

  it('generates executable HTTP Python project for Saucedemo API', async () => {
    const generator = GeneratorFactory.getGenerator('http', 'python');
    const project = await generator.generateFullProject(saucedemoApiSession);

    expect(project.framework).toBe('http');
    expect(project.language).toBe('python');

    const testFile = project.files[0];
    expect(testFile?.content).toContain('import requests');
    expect(testFile?.content).toContain('https://www.saucedemo.com/');
  });

  it('generates executable HTTP Java project for Saucedemo API', async () => {
    const generator = GeneratorFactory.getGenerator('http', 'java');
    const project = await generator.generateFullProject(saucedemoApiSession);

    expect(project.framework).toBe('http');
    expect(project.language).toBe('java');

    const testFile = project.files[0];
    expect(testFile?.content).toContain('RestAssured');
    expect(testFile?.content).toContain('https://www.saucedemo.com/');
  });

  it('generates valid k6 load testing script for Saucedemo API', async () => {
    const k6Session: SessionIR = {
      ...saucedemoApiSession,
      id: 'e1000000-0000-4000-8000-000000000002',
      steps: [
        saucedemoApiSteps[0], // GET https://www.saucedemo.com/
        saucedemoApiSteps[1], // assert 200
      ],
    };
    const generator = GeneratorFactory.getGenerator('k6', 'javascript');
    const project = await generator.generateFullProject(k6Session);

    expect(project.framework).toBe('k6');
    const script = project.files[0]?.content ?? '';
    expect(script).toContain("import http from 'k6/http'");
    expect(script).toContain("from 'k6'");
    expect(script).toContain('https://www.saucedemo.com/');
  });

  it('executes Saucedemo API workflow with ApiFunctionalRunner', async () => {
    const capturedRequests: Array<{ url: string; headers: unknown; body: unknown }> = [];

    const runner = new ApiFunctionalRunner({
      secretResolver: async (ref) => {
        expect(ref.key).toBe('saucedemo.api.secret');
        return 'test-secret-jwt-token-999';
      },
      fetchImplementation: async (input, init) => {
        const urlStr = String(input);
        capturedRequests.push({ url: urlStr, headers: init?.headers, body: init?.body });

        if (urlStr === 'https://www.saucedemo.com/') {
          return new Response('<html><body>Swag Labs</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        }

        if (urlStr.includes('/v1/auth/login')) {
          return new Response(
            JSON.stringify({
              data: {
                token: 'session-token-xyz-123',
                user: { id: 'usr-456', username: 'standard_user' },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        if (urlStr.includes('/v1/users/usr-456/cart')) {
          return new Response(
            JSON.stringify({
              cart: { itemCount: 0, items: [] },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response('Not Found', { status: 404 });
      },
    });

    const logs: string[] = [];
    const summary = await runner.run(saucedemoApiSession, { executionMode: 'native' }, (log) => {
      logs.push(log.message);
    });

    expect(summary.status).toBe('passed');
    expect(summary.passedSteps).toBe(9);
    expect(summary.failedSteps).toBe(0);
    expect(capturedRequests).toHaveLength(3);

    // Verify secret interpolation in request 2
    expect(capturedRequests[1]?.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer test-secret-jwt-token-999' })
    );

    // Verify variable chaining (sessionToken & userId) in request 3
    expect(capturedRequests[2]?.url).toBe('https://api.saucedemo.local/v1/users/usr-456/cart?filter=active');
    expect(capturedRequests[2]?.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer session-token-xyz-123' })
    );
  });
});
