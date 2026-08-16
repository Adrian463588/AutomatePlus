import { ActionIR, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class K6StressGenerator extends BaseCodeGenerator {
  public readonly framework = 'k6';
  public readonly language = 'javascript';
  public readonly supportedPlatforms = ['api'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `import http from 'k6/http';`,
      `import { check, sleep } from 'k6';`,
      ``,
      `export const options = {`,
      `  scenarios: {`,
      `    constant_rps: {`,
      `      executor: 'constant-arrival-rate',`,
      `      rate: Number(__ENV.TARGET_RPS) || 50,`,
      `      timeUnit: '1s',`,
      `      duration: __ENV.DURATION || '30s',`,
      `      preAllocatedVUs: Number(__ENV.PREALLOCATED_VUS) || 20,`,
      `      maxVUs: Number(__ENV.MAX_VUS) || 100,`,
      `    },`,
      `  },`,
      `  thresholds: {`,
      `    http_req_failed: ['rate<0.01'],`,
      `    http_req_duration: ['p(95)<500'],`,
      `  },`,
      `};`,
      ``,
      `export default function () {`,
    ].join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    if (action.action === 'httpRequest' && action.apiPayload) {
      const { method, url, headers, bodyContent } = action.apiPayload;
      const headersStr = JSON.stringify(headers);
      const bodyStr = bodyContent ? JSON.stringify(bodyContent) : 'null';

      return [
        `  {`,
        `    const res = http.request('${method}', '${url}', ${bodyStr}, { headers: ${headersStr} });`,
        `    check(res, {`,
        `      'status is 2xx': (r) => r.status >= 200 && r.status < 300,`,
        `    });`,
        `  }`,
      ].join('\n');
    }

    if (action.action === 'assertStatusCode') {
      return `  check(res, { 'status code matches': (r) => r.status === ${Number(action.expectedValue) || 200} });`;
    }

    if (action.action === 'sleep') {
      return `  sleep(${(action.timeoutMs ?? 1000) / 1000});`;
    }

    return `  // Action: ${action.action}`;
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return `}`;
  }
}
