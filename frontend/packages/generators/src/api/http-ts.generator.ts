import { ActionIR, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class HttpTsGenerator extends BaseCodeGenerator {
  public readonly framework = 'http';
  public readonly language = 'typescript';
  public readonly supportedPlatforms = ['api'] as const;

  public generateHeader(_session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `import axios, { AxiosResponse } from 'axios';`,
      `import assert from 'node:assert/strict';`,
      ``,
      `const readJsonPath = (value: unknown, path: string): unknown => path.replace(/^\\$\\.?/, '').split('.').filter(Boolean).reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value);`,
      `const getResponseHeader = (headers: AxiosResponse['headers'], name: string): string | undefined => {`,
      `  const key = Object.keys(headers ?? {}).find((candidate) => candidate.toLowerCase() === name.toLowerCase());`,
      `  const value = key ? headers[key] : undefined;`,
      `  return Array.isArray(value) ? value.join(', ') : value === undefined ? undefined : String(value);`,
      `};`,
      `let lastResponse: AxiosResponse | undefined;`,
      `let lastResponseTimeMs = 0;`,
      `const variables: Record<string, unknown> = {};`,
      `const requireResponse = (): AxiosResponse => {`,
      `  if (!lastResponse) throw new Error('API assertion requires a preceding httpRequest step.');`,
      `  return lastResponse;`,
      `};`,
      ``,
      `async function main(): Promise<void> {`,
    ].join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    if (action.action === 'httpRequest' && action.apiPayload) {
      const { method, url, headers, bodyContent, extractedVariables } = action.apiPayload;
      const headersStr = this.getJsRecord(headers);
      const queryParamsStr = this.getJsRecord(action.apiPayload.queryParams);
      const dataStr = bodyContent === undefined ? 'undefined' : this.getJsValue(bodyContent);

      const extractionLines = (extractedVariables || []).map(
        (v) => `  variables[${this.getJsValue(v.variableName)}] = readJsonPath(requireResponse().data, ${this.getJsValue(v.jsonPath)});`
      );
      const requestStartedAt = `requestStartedAtStep${action.stepNumber}`;

      return [
        `  const ${requestStartedAt} = Date.now();`,
        `  lastResponse = await axios.request({`,
        `    method: ${this.getJsValue(method.toLowerCase())},`,
        `    url: ${this.getJsValue(url)},`,
        `    params: ${queryParamsStr},`,
        `    headers: ${headersStr},`,
        `    data: ${dataStr},`,
        `    validateStatus: () => true,`,
        `  });`,
        `  lastResponseTimeMs = Date.now() - ${requestStartedAt};`,
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
      `main().catch((error: unknown) => {`,
      `  console.error(error instanceof Error ? error.message : String(error));`,
      `  process.exitCode = 1;`,
      `});`,
    ].join('\n');
  }
}
