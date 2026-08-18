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
      `let lastResponse;`,
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
        `    lastResponse = http.request(${JSON.stringify(method)}, ${JSON.stringify(url)}, ${bodyStr}, { headers: ${headersStr} });`,
        `    check(lastResponse, {`,
        `      'status is 2xx': (r) => r.status >= 200 && r.status < 300,`,
        `    });`,
        `  }`,
      ].join('\n');
    }

    if (action.action === 'assertStatusCode') {
      const expectedStatus = this.requireExpectedNumber(action, 100, 599);
      return `  check(lastResponse, { 'status code matches': (r) => r.status === ${expectedStatus} });`;
    }

    if (action.action === 'sleep') {
      return `  sleep(${(action.timeoutMs ?? 1000) / 1000});`;
    }

    return this.unsupportedAction(action);
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return `}`;
  }
}
