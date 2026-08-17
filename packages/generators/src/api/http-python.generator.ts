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
      `import requests`,
      `import pytest`,
      ``,
      `def test_${fnName}():`,
      `    session = requests.Session()`,
      `    variables = {}`,
      `    last_response = None`,
    ].join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    if (action.action === 'httpRequest' && action.apiPayload) {
      const { method, url, headers, bodyContent, extractedVariables } = action.apiPayload;
      const headersStr = JSON.stringify(headers);
      const dataStr = bodyContent ? JSON.stringify(bodyContent) : 'None';

      const extractionLines = (extractedVariables || []).map(
        (v) => `    variables["${v.variableName}"] = last_response.json().get("${v.jsonPath.replace(/^\./, '')}")`
      );

      return [
        `    last_response = session.request(`,
        `        method="${method}",`,
        `        url="${url}",`,
        `        headers=${headersStr},`,
        `        data=${dataStr}`,
        `    )`,
        ...extractionLines,
      ].join('\n');
    }

    if (action.action === 'assertStatusCode') {
      return `    assert last_response.status_code == ${this.requireExpectedNumber(action, 100, 599)}`;
    }

    if (action.action === 'assertJsonPath') {
      const key = action.attributeName?.replace(/^\./, '') || '';
      return `    assert last_response.json().get("${key}") == ${this.getPythonValue(action.expectedValue)}`;
    }

    if (action.action === 'assertHeader') {
      return `    assert "${action.expectedValue}" in last_response.headers.get("${action.attributeName}", "")`;
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
