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
      `describe('${session.name}', () => {`,
      `  let lastResponse;`,
      `  const variables = {};`,
      ``,
      `  it('should execute API test sequence', async () => {`,
    ].join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    if (action.action === 'httpRequest' && action.apiPayload) {
      const { method, url, headers, bodyContent, extractedVariables } = action.apiPayload;
      const headersStr = JSON.stringify(headers);
      const dataStr = bodyContent ? JSON.stringify(bodyContent) : 'undefined';

      const extractionLines = (extractedVariables || []).map(
        (v) => `    variables['${v.variableName}'] = lastResponse.data${v.jsonPath.startsWith('.') ? v.jsonPath : '.' + v.jsonPath};`
      );

      return [
        `    lastResponse = await axios.request({`,
        `      method: '${method.toLowerCase()}',`,
        `      url: '${url}',`,
        `      headers: ${headersStr},`,
        `      data: ${dataStr},`,
        `      validateStatus: () => true,`,
        `    });`,
        ...extractionLines,
      ].join('\n');
    }

    if (action.action === 'assertStatusCode') {
      return `    expect(lastResponse.status).toBe(${this.requireExpectedNumber(action, 100, 599)});`;
    }

    if (action.action === 'assertJsonPath') {
      return `    expect(lastResponse.data${action.attributeName?.startsWith('.') ? action.attributeName : '.' + (action.attributeName || '')}).toEqual(${this.getJsValue(action.expectedValue)});`;
    }

    if (action.action === 'assertHeader') {
      return `    expect(lastResponse.headers['${action.attributeName?.toLowerCase()}']).toContain(${this.getJsValue(action.expectedValue)});`;
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
