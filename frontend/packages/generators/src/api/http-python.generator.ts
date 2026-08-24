import { ActionIR, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class HttpPythonGenerator extends BaseCodeGenerator {
  public readonly framework = 'http';
  public readonly language = 'python';
  public readonly supportedPlatforms = ['api'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    const fnName = session.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return [
      `import os`,
      `import requests`,
      `import pytest`,
      ``,
      `def test_${fnName}():`,
      `    session = requests.Session()`,
      `    variables = {}`,
      `    last_response = None`,
      `    last_response_time_ms = 0`,
      ``,
      `    def require_response():`,
      `        if last_response is None:`,
      `            raise AssertionError("API assertion requires a preceding httpRequest step.")`,
      `        return last_response`,
      ``,
      `    def read_json_path(value, path):`,
      `        current = value`,
      `        for key in path.lstrip('$.').split('.'):` ,
      `            if not key:`,
      `                continue`,
      `            current = current.get(key) if isinstance(current, dict) else None`,
      `        return current`,
    ].join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    if (action.action === 'httpRequest' && action.apiPayload) {
      const { method, url, headers, bodyContent, extractedVariables } = action.apiPayload;
      const headersStr = this.getPythonRecord(headers);
      const queryParamsStr = this.getPythonRecord(action.apiPayload.queryParams);
      const dataStr = bodyContent === undefined ? 'None' : this.getPythonValue(bodyContent);

      const extractionLines = (extractedVariables || []).map(
        (v) => `    variables[${this.getPythonValue(v.variableName)}] = read_json_path(require_response().json(), ${this.getPythonValue(v.jsonPath)})`
      );
      const requestStartedAt = `request_started_at_step_${action.stepNumber}`;

      return [
        `    import time`,
        `    ${requestStartedAt} = time.perf_counter()`,
        `    last_response = session.request(`,
        `        method=${this.getPythonValue(method)},`,
        `        url=${this.getPythonValue(url)},`,
        `        params=${queryParamsStr},`,
        `        headers=${headersStr},`,
        `        data=${dataStr}`,
        `    )`,
        `    last_response_time_ms = (time.perf_counter() - ${requestStartedAt}) * 1000`,
        ...extractionLines,
      ].join('\n');
    }

    if (action.action === 'assertStatusCode') {
      return `    assert require_response().status_code == ${this.requireExpectedNumber(action, 100, 599)}`;
    }

    if (action.action === 'assertJsonPath') {
      const path = action.attributeName || action.assertion?.jsonPath || '';
      return `    assert read_json_path(require_response().json(), ${this.getPythonValue(path)}) == ${this.getPythonValue(action.expectedValue)}`;
    }

    if (action.action === 'assertHeader') {
      return `    assert ${this.getPythonValue(action.expectedValue)} in require_response().headers.get(${this.getPythonValue(action.attributeName)}, "")`;
    }

    if (action.action === 'assertResponseTime') {
      return `    require_response()\n    assert last_response_time_ms <= ${this.requireExpectedNumber(action, 1)}`;
    }

    if (action.action === 'sleep') {
      return `    import time; time.sleep(${(action.timeoutMs ?? 1000) / 1000})`;
    }

    return this.unsupportedAction(action);
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return '';
  }
}
