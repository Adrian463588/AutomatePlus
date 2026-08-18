import { describe, expect, it } from 'vitest';
import { ActionIR, SessionIR, validateSessionIR } from '@automate-plus/ir-schema';
import { GeneratorFactory } from '@automate-plus/generators';
import { ApiFunctionalRunner } from '@automate-plus/runner-core';

describe('Petstore & Reqres API Automation Suite', () => {
  const petstoreReqresSteps: ActionIR[] = [
    {
      id: 'f1000000-0000-4000-8000-000000000001',
      schemaVersion: 2,
      stepNumber: 1,
      platform: 'api',
      action: 'httpRequest',
      apiPayload: {
        method: 'GET',
        url: 'https://petstore.swagger.io/v2/pet/findByStatus',
        headers: {
          Accept: 'application/json',
        },
        queryParams: { status: 'available' },
        bodyType: 'none',
        extractedVariables: [
          { variableName: 'firstPetId', jsonPath: '$[0].id' },
          { variableName: 'firstPetName', jsonPath: '$[0].name' },
        ],
      },
      timeoutMs: 5000,
      timestamp: 1000,
    },
    {
      id: 'f1000000-0000-4000-8000-000000000002',
      schemaVersion: 2,
      stepNumber: 2,
      platform: 'api',
      action: 'assertStatusCode',
      expectedValue: '200',
      timeoutMs: 5000,
      timestamp: 1050,
    },
    {
      id: 'f1000000-0000-4000-8000-000000000003',
      schemaVersion: 2,
      stepNumber: 3,
      platform: 'api',
      action: 'assertHeader',
      attributeName: 'content-type',
      expectedValue: 'application/json',
      timeoutMs: 5000,
      timestamp: 1100,
    },
    {
      id: 'f1000000-0000-4000-8000-000000000004',
      schemaVersion: 2,
      stepNumber: 4,
      platform: 'api',
      action: 'httpRequest',
      apiPayload: {
        method: 'POST',
        url: 'https://reqres.in/api/users',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AutomatePlus-Runner/1.0',
          'x-api-key': '{{REQRES_API_KEY}}',
        },
        queryParams: {},
        bodyType: 'json',
        bodyContent: JSON.stringify({ name: 'Adrian QA', job: 'Lead SDET' }),
        extractedVariables: [
          { variableName: 'newUserId', jsonPath: '$.id' },
          { variableName: 'createdAt', jsonPath: '$.createdAt' },
        ],
      },
      timeoutMs: 5000,
      timestamp: 1150,
    },
    {
      id: 'f1000000-0000-4000-8000-000000000005',
      schemaVersion: 2,
      stepNumber: 5,
      platform: 'api',
      action: 'assertStatusCode',
      expectedValue: '201',
      timeoutMs: 5000,
      timestamp: 1200,
    },
    {
      id: 'f1000000-0000-4000-8000-000000000006',
      schemaVersion: 2,
      stepNumber: 6,
      platform: 'api',
      action: 'assertJsonPath',
      attributeName: '$.name',
      expectedValue: 'Adrian QA',
      timeoutMs: 5000,
      timestamp: 1250,
    },
  ];

  const petstoreReqresSession: SessionIR = {
    id: 'f1000000-0000-4000-8000-000000000000',
    schemaVersion: 2,
    projectId: 'c9a646d3-9c61-4cd7-bf11-7360058b730f',
    name: 'Petstore & Reqres API Flow',
    platform: 'api',
    targetConfig: {
      baseUrl: 'https://petstore.swagger.io/',
    },
    environmentVariables: {
      REQRES_API_KEY: { kind: 'secret', key: 'reqres.api.key' },
    },
    steps: petstoreReqresSteps,
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
  };

  it('validates canonical SessionIR schema for Petstore & Reqres API workflow', () => {
    const validation = validateSessionIR(petstoreReqresSession);
    expect(validation.success).toBe(true);
    expect(petstoreReqresSession.steps).toHaveLength(6);
    expect(petstoreReqresSession.environmentVariables.REQRES_API_KEY).toBeDefined();
  });

  it('generates executable HTTP TypeScript project for Petstore & Reqres', async () => {
    const generator = GeneratorFactory.getGenerator('http', 'typescript');
    const project = await generator.generateFullProject(petstoreReqresSession);

    expect(project.framework).toBe('http');
    expect(project.language).toBe('typescript');
    const testFile = project.files[0];
    expect(testFile?.content).toContain('axios');
    expect(testFile?.content).toContain('https://petstore.swagger.io/v2/pet/findByStatus');
    expect(testFile?.content).toContain('https://reqres.in/api/users');
    expect(testFile?.content).toContain('Adrian QA');
  });

  it('generates executable HTTP Python project for Petstore & Reqres', async () => {
    const generator = GeneratorFactory.getGenerator('http', 'python');
    const project = await generator.generateFullProject(petstoreReqresSession);

    expect(project.framework).toBe('http');
    expect(project.language).toBe('python');
    const testFile = project.files[0];
    expect(testFile?.content).toContain('import requests');
    expect(testFile?.content).toContain('https://petstore.swagger.io/v2/pet/findByStatus');
    expect(testFile?.content).toContain('https://reqres.in/api/users');
  });

  it('generates executable HTTP Java project for Petstore & Reqres', async () => {
    const generator = GeneratorFactory.getGenerator('http', 'java');
    const project = await generator.generateFullProject(petstoreReqresSession);

    expect(project.framework).toBe('http');
    expect(project.language).toBe('java');
    const testFile = project.files[0];
    expect(testFile?.content).toContain('RestAssured');
    expect(testFile?.content).toContain('https://petstore.swagger.io/v2/pet/findByStatus');
  });

  it('generates valid k6 load testing script for Petstore endpoint', async () => {
    const k6Session: SessionIR = {
      ...petstoreReqresSession,
      id: 'f1000000-0000-4000-8000-000000000099',
      steps: [
        petstoreReqresSteps[0], // GET /v2/pet/findByStatus
        petstoreReqresSteps[1], // assert 200
      ],
    };
    const generator = GeneratorFactory.getGenerator('k6', 'javascript');
    const project = await generator.generateFullProject(k6Session);

    expect(project.framework).toBe('k6');
    const script = project.files[0]?.content ?? '';
    expect(script).toContain("import http from 'k6/http'");
    expect(script).toContain('https://petstore.swagger.io/v2/pet/findByStatus');
  });

  it('executes Petstore and Reqres workflow with ApiFunctionalRunner', async () => {
    const capturedRequests: Array<{ url: string; headers: unknown; body: unknown }> = [];

    const runner = new ApiFunctionalRunner({
      secretResolver: async (ref) => {
        expect(ref.key).toBe('reqres.api.key');
        return 'reqres-token-mock-998';
      },
      fetchImplementation: async (input, init) => {
        const urlStr = String(input);
        capturedRequests.push({ url: urlStr, headers: init?.headers, body: init?.body });

        if (urlStr.includes('/v2/pet/findByStatus')) {
          return new Response(
            JSON.stringify([
              { id: 98765, name: 'Doggie', status: 'available' },
            ]),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          );
        }

        if (urlStr.includes('reqres.in/api/users')) {
          return new Response(
            JSON.stringify({
              id: 'usr-888',
              name: 'Adrian QA',
              job: 'Lead SDET',
              createdAt: '2026-08-18T00:00:00.000Z',
            }),
            {
              status: 201,
              headers: { 'content-type': 'application/json' },
            }
          );
        }

        return new Response('Not Found', { status: 404 });
      },
    });

    const logs: string[] = [];
    const summary = await runner.run(petstoreReqresSession, { executionMode: 'native' }, (log) => {
      logs.push(log.message);
    });

    expect(summary.status).toBe('passed');
    expect(summary.passedSteps).toBe(6);
    expect(summary.failedSteps).toBe(0);
    expect(capturedRequests).toHaveLength(2);

    // Verify header injection and secret resolution in request 2
    expect(capturedRequests[1]?.headers).toEqual(
      expect.objectContaining({ 'x-api-key': 'reqres-token-mock-998' })
    );
  });
});
