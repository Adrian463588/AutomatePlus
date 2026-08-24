import { ActionIR, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class HttpJsGenerator extends BaseCodeGenerator {
  public readonly framework = 'http';
  public readonly language = 'javascript';
  public readonly supportedPlatforms = ['api'] as const;

  public generateHeader(_session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `import axios from 'axios';`,
      `import assert from 'node:assert/strict';`,
      ``,
      `const readJsonPath = (value, path) => path.replace(/^\\$\\.?/, '').split('.').filter(Boolean).reduce((current, key) => current && typeof current === 'object' ? current[key] : undefined, value);`,
      `const getResponseHeader = (headers, name) => {`,
      `  const key = Object.keys(headers ?? {}).find((candidate) => candidate.toLowerCase() === String(name).toLowerCase());`,
      `  return key ? headers[key] : undefined;`,
      `};`,
      `let lastResponse;`,
      `let lastResponseTimeMs = 0;`,
      `const variables = {};`,
      `const requireResponse = () => {`,
      `  if (!lastResponse) throw new Error('API assertion requires a preceding httpRequest step.');`,
      `  return lastResponse;`,
      `};`,
      ``,
      `async function main() {`,
    ].join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    if (action.action === 'httpRequest' && action.apiPayload) {
      const { method, url, headers, bodyContent, extractedVariables } = action.apiPayload;
      const headersStr = this.getJsRecord(headers);
      const queryParamsStr = this.getJsRecord(action.apiPayload.queryParams);
      const dataStr = bodyContent === undefined ? 'undefined' : this.getJsValue(bodyContent);

      const extractionLines = (extractedVariables || []).map(
        (v) => `    variables[${this.getJsValue(v.variableName)}] = readJsonPath(requireResponse().data, ${this.getJsValue(v.jsonPath)});`
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
      return `  assert.equal(requireResponse().status, ${this.requireExpectedNumber(action, 100, 599)});`;
    }

    if (action.action === 'assertJsonPath') {
      return `  assert.deepEqual(readJsonPath(requireResponse().data, ${this.getJsValue(action.attributeName || action.assertion?.jsonPath)}), ${this.getJsValue(action.expectedValue)});`;
    }

    if (action.action === 'assertHeader') {
      return `  assert.ok(String(getResponseHeader(requireResponse().headers, ${this.getJsValue(action.attributeName)}) ?? '').includes(String(${this.getJsValue(action.expectedValue)})));`;
    }

    if (action.action === 'assertResponseTime') {
      return `  requireResponse();\n  assert.ok(lastResponseTimeMs <= ${this.requireExpectedNumber(action, 1)});`;
    }

    if (action.action === 'sleep') {
      return `  await new Promise((resolve) => setTimeout(resolve, ${action.timeoutMs ?? 1000}));`;
    }

    return this.unsupportedAction(action);
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `}`,
      ``,
      `main().catch((error) => {`,
      `  console.error(error instanceof Error ? error.message : String(error));`,
      `  process.exitCode = 1;`,
      `});`,
    ].join('\n');
  }
}
