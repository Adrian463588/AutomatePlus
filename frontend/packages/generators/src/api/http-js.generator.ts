import { ActionIR, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class HttpJsGenerator extends BaseCodeGenerator {
  public readonly framework = 'http';
  public readonly language = 'javascript';
  public readonly supportedPlatforms = ['api'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `const axios = require('axios');`,
      ``,
      `describe(${this.getJsValue(session.name)}, () => {`,
      `  let lastResponse;`,
      `  let lastResponseTimeMs = 0;`,
      `  const variables = {};`,
      `  const readJsonPath = (value, path) => path.replace(/^\\$\\.?/, '').split('.').filter(Boolean).reduce((current, key) => current && typeof current === 'object' ? current[key] : undefined, value);`,
      ``,
      `  it('should execute API test sequence', async () => {`,
    ].join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    if (action.action === 'httpRequest' && action.apiPayload) {
      const { method, url, headers, bodyContent, extractedVariables } = action.apiPayload;
      const headersStr = this.getJsRecord(headers);
      const queryParamsStr = this.getJsRecord(action.apiPayload.queryParams);
      const dataStr = bodyContent === undefined ? 'undefined' : this.getJsValue(bodyContent);

      const extractionLines = (extractedVariables || []).map(
        (v) => `    variables[${this.getJsValue(v.variableName)}] = readJsonPath(lastResponse.data, ${this.getJsValue(v.jsonPath)});`
      );
      const requestStartedAt = `requestStartedAtStep${action.stepNumber}`;

      return [
        `    const ${requestStartedAt} = Date.now();`,
        `    lastResponse = await axios.request({`,
        `      method: ${this.getJsValue(method.toLowerCase())},`,
        `      url: ${this.getJsValue(url)},`,
        `      params: ${queryParamsStr},`,
        `      headers: ${headersStr},`,
        `      data: ${dataStr},`,
        `      validateStatus: () => true,`,
        `    });`,
        `    lastResponseTimeMs = Date.now() - ${requestStartedAt};`,
        ...extractionLines,
      ].join('\n');
    }

    if (action.action === 'assertStatusCode') {
      return `    expect(lastResponse.status).toBe(${this.requireExpectedNumber(action, 100, 599)});`;
    }

    if (action.action === 'assertJsonPath') {
      return `    expect(readJsonPath(lastResponse.data, ${this.getJsValue(action.attributeName || action.assertion?.jsonPath)})).toEqual(${this.getJsValue(action.expectedValue)});`;
    }

    if (action.action === 'assertHeader') {
      return `    expect(lastResponse.headers[${this.getJsValue(action.attributeName?.toLowerCase())}]).toContain(${this.getJsValue(action.expectedValue)});`;
    }

    if (action.action === 'assertResponseTime') {
      return `    expect(lastResponseTimeMs).toBeLessThanOrEqual(${this.requireExpectedNumber(action, 1)});`;
    }

    if (action.action === 'sleep') {
      return `    await new Promise((r) => setTimeout(r, ${action.timeoutMs ?? 1000}));`;
    }

    return this.unsupportedAction(action);
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `  });`,
      `});`,
    ].join('\n');
  }
}
