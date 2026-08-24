import { ActionIR, SecretRef, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class K6StressGenerator extends BaseCodeGenerator {
  public readonly framework = 'k6';
  public readonly language = 'javascript';
  public readonly supportedPlatforms = ['api'] as const;

  public generateHeader(_session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `import http from 'k6/http';`,
      `import { check, sleep } from 'k6';`,
      ``,
      `const targetRps = Number(__ENV.TARGET_RPS);`,
      `const duration = __ENV.DURATION;`,
      `const preAllocatedVUs = Number(__ENV.PREALLOCATED_VUS);`,
      `const maxVUs = Number(__ENV.MAX_VUS);`,
      `if (!Number.isFinite(targetRps) || targetRps <= 0) throw new Error('TARGET_RPS must be a positive number.');`,
      `if (!duration) throw new Error('DURATION is required.');`,
      `if (!Number.isInteger(preAllocatedVUs) || preAllocatedVUs <= 0) throw new Error('PREALLOCATED_VUS must be a positive integer.');`,
      `if (!Number.isInteger(maxVUs) || maxVUs < preAllocatedVUs) throw new Error('MAX_VUS must be an integer greater than or equal to PREALLOCATED_VUS.');`,
      ``,
      `export const options = {`,
      `  scenarios: {`,
      `    constant_rps: {`,
      `      executor: 'constant-arrival-rate',`,
      `      rate: targetRps,`,
      `      timeUnit: '1s',`,
      `      duration,`,
      `      preAllocatedVUs,`,
      `      maxVUs,`,
      `    },`,
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
      const headersStr = this.getK6Record(headers);
      const bodyStr = bodyContent === undefined ? 'null' : this.getK6Value(bodyContent);
      const queryEntries = Object.entries(action.apiPayload.queryParams).map(
        ([key, value]) => `    queryParams[${this.getK6Value(key)}] = ${this.getK6Value(value)};`,
      );

      return [
        `  {`,
        `    const queryParams = {};`,
        ...queryEntries,
        `    const queryString = Object.entries(queryParams).map(([key, value]) => \`\${encodeURIComponent(key)}=\${encodeURIComponent(String(value))}\`).join('&');`,
        `    const requestUrl = queryString ? ${this.getJsValue(url)} + (${this.getJsValue(url)}.includes('?') ? '&' : '?') + queryString : ${this.getJsValue(url)};`,
        `    lastResponse = http.request(${this.getJsValue(method)}, requestUrl, ${bodyStr}, { headers: ${headersStr} });`,
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

  private getK6Value(value?: string | number | boolean | null | SecretRef): string {
    if (value === undefined) return "''";
    if (value === null) return 'null';
    if (typeof value === 'object' && value.kind === 'secret') return `__ENV[${JSON.stringify(value.key)}] ?? ''`;
    return JSON.stringify(value);
  }

  private getK6Record(values: Record<string, string | SecretRef> = {}): string {
    return `{ ${Object.entries(values).map(([key, value]) => `${JSON.stringify(key)}: ${this.getK6Value(value)}`).join(', ')} }`;
  }
}
