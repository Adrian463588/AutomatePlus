import { describe, expect, it } from 'vitest';
import { ActionIR, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorFactory } from '../src/index.js';

const requestAction: ActionIR = {
  id: '00000000-0000-4000-8000-000000000201',
  stepNumber: 1,
  platform: 'api',
  action: 'httpRequest',
  apiPayload: {
    method: 'POST',
    url: 'https://example.test/api/quote?existing=a%27b',
    headers: {
      'X-Quoted-Header': 'value\'with\\newline\n',
      Authorization: { kind: 'secret', key: 'API-KEY' },
    },
    queryParams: {
      filter: 'a&b',
      token: { kind: 'secret', key: 'QUERY-SECRET' },
    },
    bodyType: 'raw',
    bodyContent: 'body\'with\\newline\n',
    extractedVariables: [{ variableName: 'token.value', jsonPath: '$.data.token' }],
  },
  timeoutMs: 5000,
  timestamp: 1,
  optional: false,
};

const assertionActions: ActionIR[] = [
  {
    id: '00000000-0000-4000-8000-000000000202',
    stepNumber: 2,
    platform: 'api',
    action: 'assertResponseTime',
    expectedValue: '750',
    timeoutMs: 5000,
    timestamp: 2,
    optional: false,
  },
  {
    id: '00000000-0000-4000-8000-000000000203',
    stepNumber: 3,
    platform: 'api',
    action: 'assertJsonPath',
    attributeName: '$.data.token',
    expectedValue: 'expected',
    timeoutMs: 5000,
    timestamp: 3,
    optional: false,
  },
  {
    id: '00000000-0000-4000-8000-000000000204',
    stepNumber: 4,
    platform: 'api',
    action: 'assertHeader',
    attributeName: 'X-Quoted-Header',
    expectedValue: 'value\'with',
    timeoutMs: 5000,
    timestamp: 4,
    optional: false,
  },
];

function createApiSession(): SessionIR {
  return {
    id: '00000000-0000-4000-8000-000000000210',
    projectId: '00000000-0000-4000-8000-000000000211',
    name: 'API session: quoted \'name\'',
    platform: 'api',
    targetConfig: { baseUrl: 'https://example.test' },
    environmentVariables: {},
    steps: [requestAction, ...assertionActions],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('API generator contract', () => {
  it.each([
    ['typescript', 'process.env["API-KEY"] ?? \'\'', 'expect(lastResponseTimeMs).toBeLessThanOrEqual(750)'],
    ['javascript', 'process.env["API-KEY"] ?? \'\'', 'expect(lastResponseTimeMs).toBeLessThanOrEqual(750)'],
    ['python', 'os.getenv("API-KEY", \'\')', 'assert last_response_time_ms <= 750'],
    ['java', 'System.getenv("API-KEY")', 'assertTrue(lastResponseTimeMs <= 750);'],
  ] as const)('escapes API values and implements response-time assertions for %s', async (language, secretExpression, responseTimeExpression) => {
    const project = await GeneratorFactory.getGenerator('http', language).generateFullProject(createApiSession());
    const code = project.files[0].content;

    expect(code).toContain(secretExpression);
    expect(code).toContain(responseTimeExpression);
    if (language === 'typescript' || language === 'javascript') {
      expect(code).toContain('quoted \'name\'');
    }
    expect(code).toContain('existing=a%27b');
    expect(code).toContain(language === 'java' ? '.queryParam(' : 'params');
    expect(code).not.toContain('kind:');
    expect(code).not.toContain("url: 'https://example.test/api/quote?existing=a%27b'");
    expect(code).not.toContain("variables['token.value']");
    expect(code).not.toContain('unsupportedAction');
  });

  it('keeps the HTTP capability manifest and implementation aligned for response time', () => {
    const manifest = GeneratorFactory.getGenerator('http', 'typescript').manifest;

    expect(manifest.supportedActions).toContain('assertResponseTime');
    expect(manifest.supportedAssertions).toContain('assertResponseTime');
  });

  it('uses unique request timing variables when a session has multiple requests', async () => {
    const secondRequest: ActionIR = {
      ...requestAction,
      id: '00000000-0000-4000-8000-000000000205',
      stepNumber: 2,
    };
    const session = { ...createApiSession(), steps: [requestAction, secondRequest] };

    const expectations = {
      typescript: ['const requestStartedAtStep1 = Date.now();', 'const requestStartedAtStep2 = Date.now();'],
      javascript: ['const requestStartedAtStep1 = Date.now();', 'const requestStartedAtStep2 = Date.now();'],
      python: ['request_started_at_step_1 = time.perf_counter()', 'request_started_at_step_2 = time.perf_counter()'],
      java: ['long requestStartedAtStep1 = System.nanoTime();', 'long requestStartedAtStep2 = System.nanoTime();'],
    } as const;

    for (const language of Object.keys(expectations) as Array<keyof typeof expectations>) {
      const project = await GeneratorFactory.getGenerator('http', language).generateFullProject(session);
      const code = project.files[0].content;

      for (const expected of expectations[language]) expect(code).toContain(expected);
      expect(code).not.toContain('const requestStartedAt = Date.now();');
      expect(code).not.toContain('long requestStartedAt = System.nanoTime();');
    }
  });

  it('requires explicit k6 stress configuration instead of fabricated defaults', async () => {
    const project = await GeneratorFactory.getGenerator('k6', 'javascript').generateFullProject({
      ...createApiSession(),
      steps: [requestAction],
    });
    const code = project.files[0].content;

    expect(code).toContain('const targetRps = Number(__ENV.TARGET_RPS);');
    expect(code).toContain('const duration = __ENV.DURATION;');
    expect(code).toContain('const preAllocatedVUs = Number(__ENV.PREALLOCATED_VUS);');
    expect(code).toContain('const maxVUs = Number(__ENV.MAX_VUS);');
    expect(code).not.toContain('|| 50');
    expect(code).not.toContain("|| '30s'");
    expect(code).not.toContain('|| 20');
    expect(code).not.toContain('|| 100');
    expect(code).toContain('encodeURIComponent');
  });
});
