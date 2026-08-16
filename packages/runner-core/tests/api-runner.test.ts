import { createServer, type AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { ApiFunctionalRunner } from '../src/api-runner.js';
import { SessionIR } from '@automate-plus/ir-schema';

describe('API functional runner', () => {
  it('executes requests, resolves secrets, chains variables, and evaluates assertions', async () => {
    const requests: Array<{ url: string; headers: HeadersInit | undefined }> = [];
    const session: SessionIR = {
      id: 'api-session-1',
      projectId: 'api-project-1',
      name: 'API fixture',
      platform: 'api',
      targetConfig: {},
      environmentVariables: {
        API_TOKEN: { kind: 'secret', key: 'api.token' },
      },
      steps: [
        {
          id: 'api-step-1',
          stepNumber: 1,
          platform: 'api',
          action: 'httpRequest',
          apiPayload: {
            method: 'GET',
            url: 'https://fixture.local/users/1',
            headers: { Authorization: 'Bearer {{API_TOKEN}}' },
            queryParams: { source: 'recorder' },
            bodyType: 'none',
            extractedVariables: [{ variableName: 'userName', jsonPath: '$.name' }],
          },
          timeoutMs: 1_000,
          timestamp: 1,
        },
        {
          id: 'api-step-2',
          stepNumber: 2,
          platform: 'api',
          action: 'assertStatusCode',
          expectedValue: 200,
          timeoutMs: 1_000,
          timestamp: 2,
        },
        {
          id: 'api-step-3',
          stepNumber: 3,
          platform: 'api',
          action: 'assertJsonPath',
          attributeName: '$.name',
          expectedValue: 'Ada',
          timeoutMs: 1_000,
          timestamp: 3,
        },
        {
          id: 'api-step-4',
          stepNumber: 4,
          platform: 'api',
          action: 'assertHeader',
          attributeName: 'x-trace',
          expectedValue: 'fixture',
          timeoutMs: 1_000,
          timestamp: 4,
        },
        {
          id: 'api-step-5',
          stepNumber: 5,
          platform: 'api',
          action: 'httpRequest',
          apiPayload: {
            method: 'GET',
            url: 'https://fixture.local/users/{{userName}}',
            headers: {},
            queryParams: {},
            bodyType: 'none',
            extractedVariables: [],
          },
          timeoutMs: 1_000,
          timestamp: 5,
        },
      ],
      createdAt: 1,
      updatedAt: 5,
    };

    const runner = new ApiFunctionalRunner({
      secretResolver: async (reference) => {
        expect(reference.key).toBe('api.token');
        return 'fixture-token';
      },
      fetchImplementation: async (input, init) => {
        requests.push({ url: String(input), headers: init?.headers });
        return new Response(JSON.stringify({ name: 'Ada' }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-trace': 'fixture' },
        });
      },
    });

    const summary = await runner.run(session, { executionMode: 'native' }, () => undefined);

    expect(summary.status).toBe('passed');
    expect(summary.passedSteps).toBe(5);
    expect(summary.failedSteps).toBe(0);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe('https://fixture.local/users/1?source=recorder');
    expect(requests[0]?.headers).toEqual({ Authorization: 'Bearer fixture-token' });
    expect(requests[1]?.url).toBe('https://fixture.local/users/Ada');
  });

  it('blocks when a referenced secret is unavailable', async () => {
    const session: SessionIR = {
      id: 'api-session-2',
      projectId: 'api-project-1',
      name: 'Missing secret fixture',
      platform: 'api',
      targetConfig: {},
      environmentVariables: { API_TOKEN: { kind: 'secret', key: 'api.token' } },
      steps: [
        {
          id: 'api-step-1',
          stepNumber: 1,
          platform: 'api',
          action: 'httpRequest',
          apiPayload: {
            method: 'GET',
            url: 'https://fixture.local/health',
            headers: { Authorization: 'Bearer {{API_TOKEN}}' },
            queryParams: {},
            bodyType: 'none',
            extractedVariables: [],
          },
          timeoutMs: 1_000,
          timestamp: 1,
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };

    const summary = await new ApiFunctionalRunner({
      fetchImplementation: async () => new Response('{}', { status: 200 }),
    }).run(session, { executionMode: 'native' }, () => undefined);

    expect(summary.status).toBe('blocked');
    expect(summary.failedSteps).toBe(0);
    expect(summary.error).toContain('api.token');
  });

  it('runs against a loopback HTTP fixture with the real fetch boundary', async () => {
    const server = createServer((socket) => {
      socket.once('data', (buffer) => {
        const requestLine = buffer.toString('utf8').split('\r\n', 1)[0] ?? '';
        const path = requestLine.split(' ')[1] ?? '/';
        const body = JSON.stringify({ path, healthy: true });
        socket.end(
          `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
        );
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });

    try {
      const address = server.address() as AddressInfo;
      const session: SessionIR = {
        id: 'api-session-3',
        projectId: 'api-project-1',
        name: 'Loopback fixture',
        platform: 'api',
        targetConfig: {},
        environmentVariables: {},
        steps: [
          {
            id: 'api-step-1',
            stepNumber: 1,
            platform: 'api',
            action: 'httpRequest',
            apiPayload: {
              method: 'GET',
              url: `http://127.0.0.1:${address.port}/health`,
              headers: {},
              queryParams: {},
              bodyType: 'none',
              extractedVariables: [],
            },
            timeoutMs: 1_000,
            timestamp: 1,
          },
          {
            id: 'api-step-2',
            stepNumber: 2,
            platform: 'api',
            action: 'assertJsonPath',
            attributeName: '$.healthy',
            expectedValue: true,
            timeoutMs: 1_000,
            timestamp: 2,
          },
        ],
        createdAt: 1,
        updatedAt: 2,
      };

      const summary = await new ApiFunctionalRunner().run(session, { executionMode: 'native' }, () => undefined);

      expect(summary.status).toBe('passed');
      expect(summary.passedSteps).toBe(2);
      expect(summary.metrics?.lastStatusCode).toBe(200);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
