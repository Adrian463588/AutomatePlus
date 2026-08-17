import {
  ActionIR,
  LocatorCandidate,
  SecretRef,
  SessionIR,
  SessionIRSchema,
} from '@automate-plus/ir-schema';
import {
  CapabilityManifest,
  CapabilityResult,
  GeneratedFile,
  GeneratedProject,
  GeneratorOptions,
  ICodeGenerator,
  RuntimeContextSpec,
  ValidationResult,
  CapabilityError,
} from '@automate-plus/contracts';
import { createCapabilityManifest } from './capabilities.js';

export abstract class BaseCodeGenerator implements ICodeGenerator {
  public abstract readonly framework: string;
  public abstract readonly language: string;
  public abstract readonly supportedPlatforms: readonly ('web' | 'android' | 'api')[];
  public get manifest(): CapabilityManifest {
    return createCapabilityManifest(this.framework, this.language, this.supportedPlatforms[0]);
  }

  public supports(action: ActionIR): boolean {
    return this.supportedPlatforms.includes(action.platform) && this.manifest.supportedActions.includes(action.action);
  }

  public supportsSession(session: SessionIR): CapabilityResult {
    const unsupported = session.steps.filter((s) => !this.supports(s));
    if (unsupported.length > 0) {
      return {
        supported: false,
        unsupportedActions: unsupported.map((u) => u.action),
        reason: `Framework '${this.framework}' (${this.language}) does not support platform '${session.platform}' actions: ${unsupported.map((u) => u.action).join(', ')}`,
      };
    }
    return { supported: true };
  }

  public abstract generateHeader(session: SessionIR, options?: GeneratorOptions): string;
  public abstract generateStep(action: ActionIR, session: SessionIR, options?: GeneratorOptions): string;
  public abstract generateFooter(session: SessionIR, options?: GeneratorOptions): string;

  public async generateFullProject(
    session: SessionIR,
    options?: GeneratorOptions
  ): Promise<GeneratedProject> {
    this.validateSessionInput(session);
    const capability = this.supportsSession(session);
    if (!capability.supported) {
      throw new CapabilityError(capability.reason ?? 'Session is not supported by the selected generator', {
        framework: this.framework,
        language: this.language,
        unsupportedActions: capability.unsupportedActions ?? [],
      });
    }

    const header = this.generateHeader(session, options);
    const generatedSteps = session.steps.map((step) => ({
      step,
      code: this.generateStep(step, session, options),
    }));
    const steps = generatedSteps
      .map(({ code }) => code)
      .filter((line) => line.trim().length > 0)
      .join('\n');
    const footer = this.generateFooter(session, options);

    const fullContent = [header, steps, footer].filter(Boolean).join('\n');

    const extension = this.getFileExtension();
    const fileName = `${session.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.test.${extension}`;

    const files: GeneratedFile[] = [
      {
        relativePath: `tests/${fileName}`,
        content: fullContent,
        language: this.language,
      },
    ];

    files.push(...this.generateSupportFiles(session, files[0].relativePath));

    const project: GeneratedProject = {
      framework: this.framework,
      language: this.language,
      files,
      manifest: this.manifest,
      entrypoint: files[0].relativePath,
      runtimeRequirements: this.manifest.requiredRuntimes,
    };

    const validation = await this.validate(project);
    if (!validation.valid) {
      throw new CapabilityError('Generated project failed truthful validation.', {
        framework: this.framework,
        language: this.language,
        errors: validation.errors ?? [],
      });
    }
    return project;
  }

  protected generateSupportFiles(session: SessionIR, entrypoint: string): GeneratedFile[] {
    const projectName = session.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!projectName) {
      throw new CapabilityError('Session name must produce a valid generated project name.', {
        framework: this.framework,
        language: this.language,
        sessionName: session.name,
      });
    }
    const manifestFile: GeneratedFile = {
      relativePath: 'automateplus.manifest.json',
      language: 'json',
      content: JSON.stringify(
        {
          schemaVersion: 1,
          framework: this.framework,
          language: this.language,
          entrypoint,
          capability: this.manifest,
          validation: ['format', 'lint', 'typecheck-or-compile', 'local-smoke'],
        },
        null,
        2,
      ),
    };

    if (this.language === 'typescript' || this.language === 'javascript') {
      const dependency = this.runtimeDependency();
      return [
        manifestFile,
        {
          relativePath: 'package.json',
          language: 'json',
          content: JSON.stringify(
            {
              name: projectName,
              private: true,
              type: 'module',
              scripts: { test: this.testCommand(entrypoint) },
              dependencies: dependency ? { [dependency.name]: dependency.version } : {},
              devDependencies: this.language === 'typescript' ? { typescript: '^5.7.2' } : {},
            },
            null,
            2,
          ),
        },
      ];
    }

    if (this.language === 'python' || this.language === 'robot') {
      return [
        manifestFile,
        { relativePath: 'requirements.txt', language: 'text', content: `${this.pythonDependency()}\n` },
      ];
    }

    if (this.language === 'java') {
      return [
        manifestFile,
        {
          relativePath: 'pom.xml',
          language: 'xml',
          content: this.javaBuildFile(projectName),
        },
      ];
    }

    if (this.language === 'kotlin') {
      return [
        manifestFile,
        {
          relativePath: 'build.gradle.kts',
          language: 'kotlin',
          content: this.kotlinBuildFile(),
        },
      ];
    }

    return [manifestFile];
  }

  private runtimeDependency(): { name: string; version: string } | undefined {
    const dependencies: Record<string, { name: string; version: string }> = {
      playwright: { name: '@playwright/test', version: '^1.49.1' },
      cypress: { name: 'cypress', version: '^13.17.0' },
      puppeteer: { name: 'puppeteer', version: '^23.11.1' },
      selenium: { name: 'selenium-webdriver', version: '^4.27.0' },
      appium: { name: 'webdriverio', version: '^9.15.0' },
      http: { name: 'axios', version: '^1.7.9' },
    };
    return dependencies[this.framework];
  }

  private testCommand(entrypoint: string): string {
    switch (this.framework) {
      case 'playwright':
        return `playwright test ${entrypoint}`;
      case 'cypress':
        return `cypress run --spec ${entrypoint}`;
      case 'k6':
        return `k6 run ${entrypoint}`;
      case 'robot':
        return `robot ${entrypoint}`;
      default:
        return `node ${entrypoint}`;
    }
  }

  private pythonDependency(): string {
    if (this.framework === 'robot') return 'robotframework==7.1.1';
    if (this.framework === 'selenium') return 'selenium==4.27.1';
    return 'requests==2.32.3';
  }

  private javaBuildFile(projectName: string): string {
    const dependency = this.framework === 'selenium'
      ? '<artifactId>selenium-java</artifactId>\n      <version>4.27.0</version>'
      : '<artifactId>rest-assured</artifactId>\n      <version>5.5.0</version>';
    return `<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n  xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>com.automateplus.generated</groupId>\n  <artifactId>${projectName}</artifactId>\n  <version>1.0.0</version>\n  <properties><maven.compiler.release>17</maven.compiler.release></properties>\n  <dependencies><dependency><groupId>org.seleniumhq.selenium</groupId>${dependency}\n  </dependency></dependencies>\n</project>\n`;
  }

  private kotlinBuildFile(): string {
    return `plugins { kotlin("jvm") version "2.0.21" }\n\nrepositories { mavenCentral() }\n\ndependencies {\n  testImplementation(kotlin("test"))\n  testImplementation("io.appium:java-client:9.4.0")\n}\n\ntasks.test { useJUnitPlatform() }\n`;
  }

  public async validate(project: GeneratedProject): Promise<ValidationResult> {
    const errors: string[] = [];
    for (const file of project.files) {
      if (/(^|\n)\s*(\/\/|#)\s*Action:/u.test(file.content)) {
        errors.push(`${file.relativePath} contains an unsupported action comment fallback`);
      }
      if (/\bTODO\b|50%,50%|isRoot\(\)|By\.xpath\("\/\*"\)/u.test(file.content)) {
        errors.push(`${file.relativePath} contains fabricated generator output`);
      }
    }
    if (project.entrypoint !== project.files[0]?.relativePath) {
      errors.push('Generated entrypoint does not reference the first generated test file');
    }
    return { valid: errors.length === 0, errors };
  }

  protected unsupportedAction(action: ActionIR): never {
    throw new CapabilityError(`Action '${action.action}' is not implemented by ${this.framework}/${this.language}.`, {
      framework: this.framework,
      language: this.language,
      action: action.action,
    });
  }

  protected requireLocator(action: ActionIR): LocatorCandidate {
    const locator = this.getPrimaryLocator(action);
    if (!locator) {
      throw new CapabilityError(`Action '${action.action}' requires an explicit locator.`, {
        framework: this.framework,
        language: this.language,
        action: action.action,
        stepId: action.id,
      });
    }
    return locator;
  }

  protected requireDragTarget(action: ActionIR): LocatorCandidate {
    const locator = action.dragTarget?.locators[0];
    if (!locator) {
      throw new CapabilityError(`Action '${action.action}' requires an explicit drag target locator.`, {
        framework: this.framework,
        language: this.language,
        action: action.action,
        stepId: action.id,
      });
    }
    return locator;
  }

  protected requireExpectedNumber(action: ActionIR, minimum?: number, maximum?: number): number {
    const raw = action.expectedValue ?? action.assertion?.expected;
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
    if (!Number.isFinite(value) || (minimum !== undefined && value < minimum) || (maximum !== undefined && value > maximum)) {
      throw new CapabilityError(`Action '${action.action}' requires a valid numeric expected value.`, {
        framework: this.framework,
        language: this.language,
        action: action.action,
        expectedValue: raw,
      });
    }
    return value;
  }

  protected unsupportedLocator(locator: LocatorCandidate): never {
    throw new CapabilityError(`Locator strategy '${locator.strategy}' is not supported by ${this.framework}/${this.language}.`, {
      framework: this.framework,
      language: this.language,
      locatorStrategy: locator.strategy,
    });
  }

  protected requireTargetField(session: SessionIR, field: 'appPackage' | 'appActivity' | 'startUrl'): string {
    const value = session.targetConfig[field];
    if (!value) {
      throw new CapabilityError(`Generation requires targetConfig.${field} from the user IR.`, {
        framework: this.framework,
        language: this.language,
        field,
      });
    }
    return value;
  }

  private validateSessionInput(session: SessionIR): void {
    const parsed = SessionIRSchema.safeParse(session);
    if (!parsed.success) {
      throw new CapabilityError('Session IR validation failed before generation.', {
        framework: this.framework,
        language: this.language,
        issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    if (session.platform !== this.supportedPlatforms[0]) {
      throw new CapabilityError(`Session platform '${session.platform}' is not supported by ${this.framework}/${this.language}.`, {
        framework: this.framework,
        language: this.language,
        platform: session.platform,
      });
    }

    if (session.platform === 'android') {
      this.requireTargetField(session, 'appPackage');
      if (this.framework === 'espresso' || this.framework === 'robolectric') {
        this.requireTargetField(session, 'appActivity');
      }
    }

    const locatorActions = new Set([
      'click', 'doubleClick', 'rightClick', 'hover', 'fill', 'clear', 'waitFor', 'dragAndDrop',
      'tap', 'doubleTap', 'longPress', 'drag', 'pinch', 'assertVisible', 'assertHidden',
      'assertText', 'assertValue', 'assertAttribute',
    ]);
    for (const action of session.steps) {
      if (locatorActions.has(action.action)) this.requireLocator(action);
      if ((action.action === 'drag' || action.action === 'dragAndDrop')) this.requireDragTarget(action);
      if (action.action === 'httpRequest' && !action.apiPayload) this.unsupportedAction(action);
      if (action.action === 'navigate' && !action.value) this.unsupportedAction(action);
      if (action.action === 'fill' && action.value === undefined) this.unsupportedAction(action);
      if (action.action === 'pressKey' && typeof action.value !== 'string') this.unsupportedAction(action);
      if (action.action === 'scroll' && !action.scrollOffset) this.unsupportedAction(action);
      if (action.action === 'swipe' && !action.swipeVector) this.unsupportedAction(action);
      if (['assertText', 'assertValue', 'assertAttribute', 'assertUrl', 'assertStatusCode', 'assertJsonPath', 'assertHeader', 'assertResponseTime'].includes(action.action)
        && action.expectedValue === undefined && action.assertion?.expected === undefined) {
        this.unsupportedAction(action);
      }
      if (['assertAttribute', 'assertJsonPath', 'assertHeader'].includes(action.action) && !action.attributeName && !action.assertion?.jsonPath && !action.assertion?.headerName) {
        this.unsupportedAction(action);
      }
    }
  }

  protected getPrimaryLocator(action: ActionIR): LocatorCandidate | undefined {
    if (!action.locators || action.locators.length === 0) return undefined;
    return action.locators[0];
  }

  protected getRuntimeContext(options?: GeneratorOptions): RuntimeContextSpec {
    const context = options?.runtimeContext ?? this.manifest.runtimeContext;
    if (!context) {
      throw new CapabilityError(`Generation requires a runtime context for ${this.framework}/${this.language}.`, {
        framework: this.framework,
        language: this.language,
      });
    }
    return context;
  }

  protected getRawValue(val?: string | SecretRef): string {
    if (!val) return '';
    if (typeof val === 'object' && 'kind' in val && val.kind === 'secret') {
      return `\${secret.${val.key}}`;
    }
    return typeof val === 'string' ? val : '';
  }

  protected getJsValue(val?: string | SecretRef): string {
    if (!val) return "''";
    if (typeof val === 'object' && 'kind' in val && val.kind === 'secret') {
      return `process.env.${val.key} || ''`;
    }
    return JSON.stringify(val);
  }

  protected getPythonValue(val?: string | SecretRef): string {
    if (!val) return "''";
    if (typeof val === 'object' && 'kind' in val && val.kind === 'secret') {
      return `os.getenv('${val.key}', '')`;
    }
    return JSON.stringify(val);
  }

  protected getJavaValue(val?: string | SecretRef): string {
    if (!val) return '""';
    if (typeof val === 'object' && 'kind' in val && val.kind === 'secret') {
      return `System.getenv("${val.key}")`;
    }
    return JSON.stringify(val);
  }

  protected getFileExtension(): string {
    switch (this.language) {
      case 'typescript':
        return 'ts';
      case 'javascript':
        return 'js';
      case 'python':
        return 'py';
      case 'java':
        return 'java';
      case 'kotlin':
        return 'kt';
      case 'robot':
        return 'robot';
      case 'yaml':
        return 'yaml';
      default:
        return 'txt';
    }
  }
}
