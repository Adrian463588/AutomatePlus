import { ActionIR, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class HttpJavaGenerator extends BaseCodeGenerator {
  public readonly framework = 'http';
  public readonly language = 'java';
  public readonly supportedPlatforms = ['api'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    const className = this.toPascalCase(session.name) + 'ApiTest';
    return [
      `package com.automateplus.tests;`,
      ``,
      `import io.restassured.RestAssured;`,
      `import io.restassured.response.Response;`,
      `import io.restassured.specification.RequestSpecification;`,
      `import org.junit.jupiter.api.Test;`,
      `import java.util.HashMap;`,
      `import java.util.Map;`,
      `import static org.hamcrest.Matchers.*;`,
      `import static org.junit.jupiter.api.Assertions.*;`,
      ``,
      `public class ${className} {`,
      `    private Response lastResponse;`,
      `    private Map<String, Object> variables = new HashMap<>();`,
      ``,
      `    @Test`,
      `    public void testApiSession() {`,
    ].join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    if (action.action === 'httpRequest' && action.apiPayload) {
      const { method, url, headers, bodyContent } = action.apiPayload;
      const headersLines = Object.entries(headers || {}).map(
        ([k, v]) => `            .header("${k}", "${v}")`
      );
      const bodyLine = bodyContent ? `            .body(${JSON.stringify(bodyContent)})` : '';

      return [
        `        lastResponse = RestAssured.given()`,
        ...headersLines,
        bodyLine,
        `            .when()`,
        `            .${method.toLowerCase()}("${url}");`,
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (action.action === 'assertStatusCode') {
      return `        lastResponse.then().statusCode(${this.requireExpectedNumber(action, 100, 599)});`;
    }

    if (action.action === 'assertJsonPath') {
      const path = action.attributeName?.replace(/^\./, '') || '';
      return `        lastResponse.then().body("${path}", equalTo(${this.getJavaValue(action.expectedValue)}));`;
    }

    if (action.action === 'assertHeader') {
      return `        lastResponse.then().header("${action.attributeName}", containsString(${this.getJavaValue(action.expectedValue)}));`;
    }

    if (action.action === 'sleep') {
      return `        try { Thread.sleep(${action.timeoutMs ?? 1000}); } catch (InterruptedException ignored) {}`;
    }

    return this.unsupportedAction(action);
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `    }`,
      `}`,
    ].join('\n');
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
      .replace(/^[a-z]/, (c) => c.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '');
  }
}
