import { ActionIR, SessionIR } from '@automate-plus/ir-schema';

export interface GeneratorOptions {
  indentation?: string;
  pomMode?: boolean;
  timeoutMs?: number;
  headless?: boolean;
}

export interface GeneratedFile {
  relativePath: string;
  content: string;
  language: string;
}

export interface GeneratedProject {
  framework: string;
  language: string;
  files: GeneratedFile[];
  manifest: CapabilityManifest;
  entrypoint: string;
  runtimeRequirements?: string[];
  checksums?: Record<string, string>;
}

export interface CapabilityManifest {
  id: string;
  platform: 'web' | 'android' | 'api';
  framework: string;
  language: string;
  outputFormat: 'typescript' | 'javascript' | 'python' | 'java' | 'kotlin' | 'robot' | 'yaml';
  supportedActions: string[];
  supportedAssertions: string[];
  requiredRuntimes: string[];
  requiresProject?: 'android-gradle' | 'none';
  runnerCommandId: string;
  version: string;
}

export interface CapabilityResult {
  supported: boolean;
  unsupportedActions?: string[];
  unsupportedAssertions?: string[];
  reason?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface ICodeGenerator {
  readonly framework: string;
  readonly language: string;
  readonly supportedPlatforms: readonly ('web' | 'android' | 'api')[];
  readonly manifest: CapabilityManifest;

  supports(action: ActionIR): boolean;
  supportsSession?(session: SessionIR): CapabilityResult;
  generateHeader(session: SessionIR, options?: GeneratorOptions): string;
  generateStep(action: ActionIR, session: SessionIR, options?: GeneratorOptions): string;
  generateFooter(session: SessionIR, options?: GeneratorOptions): string;
  generateFullProject(session: SessionIR, options?: GeneratorOptions): Promise<GeneratedProject>;
  validate?(project: GeneratedProject): Promise<ValidationResult>;
}
