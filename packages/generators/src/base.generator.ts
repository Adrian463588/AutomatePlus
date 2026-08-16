import {
  ActionIR,
  LocatorCandidate,
  SecretRef,
  SessionIR,
} from '@automate-plus/ir-schema';
import {
  CapabilityManifest,
  CapabilityResult,
  GeneratedFile,
  GeneratedProject,
  GeneratorOptions,
  ICodeGenerator,
  ValidationResult,
} from '@automate-plus/contracts';

export abstract class BaseCodeGenerator implements ICodeGenerator {
  public abstract readonly framework: string;
  public abstract readonly language: string;
  public abstract readonly supportedPlatforms: readonly ('web' | 'android' | 'api')[];
  public readonly manifest?: CapabilityManifest;

  public supports(action: ActionIR): boolean {
    return this.supportedPlatforms.includes(action.platform);
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
    const header = this.generateHeader(session, options);
    const steps = session.steps
      .map((step) => this.generateStep(step, session, options))
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

    return {
      framework: this.framework,
      language: this.language,
      files,
    };
  }

  public async validate?(project: GeneratedProject): Promise<ValidationResult> {
    return { valid: true };
  }

  protected getPrimaryLocator(action: ActionIR): LocatorCandidate | undefined {
    if (!action.locators || action.locators.length === 0) return undefined;
    return action.locators[0];
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
