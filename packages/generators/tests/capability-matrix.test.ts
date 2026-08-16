import { describe, expect, it } from 'vitest';
import { CapabilityError } from '@automate-plus/contracts';
import { ActionIR, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorFactory } from '../src/index.js';

const combinations = [
  ['playwright', 'typescript'], ['playwright', 'javascript'], ['playwright', 'python'], ['playwright', 'java'],
  ['cypress', 'typescript'], ['cypress', 'javascript'], ['puppeteer', 'typescript'], ['puppeteer', 'javascript'],
  ['selenium', 'typescript'], ['selenium', 'javascript'], ['selenium', 'python'], ['selenium', 'java'], ['robot', 'robot'],
  ['appium', 'java'], ['appium', 'kotlin'], ['appium', 'typescript'], ['appium', 'javascript'],
  ['espresso', 'kotlin'], ['espresso', 'java'], ['robolectric', 'kotlin'], ['robolectric', 'java'], ['maestro', 'yaml'],
  ['k6', 'javascript'], ['http', 'typescript'], ['http', 'javascript'], ['http', 'python'], ['http', 'java'],
] as const;

function createSession(platform: 'web' | 'android' | 'api', action: ActionIR['action']): SessionIR {
  const step: ActionIR = platform === 'web'
    ? { id: '00000000-0000-4000-8000-000000000101', stepNumber: 1, platform, action: 'navigate', value: 'http://127.0.0.1:4173', timeoutMs: 5000, timestamp: Date.now(), optional: false }
    : platform === 'android'
      ? { id: '00000000-0000-4000-8000-000000000102', stepNumber: 1, platform, action: 'tap', locators: [{ strategy: 'resourceId', value: 'com.example:id/action', score: 100 }], timeoutMs: 5000, timestamp: Date.now(), optional: false }
      : { id: '00000000-0000-4000-8000-000000000103', stepNumber: 1, platform, action: 'httpRequest', apiPayload: { method: 'GET', url: 'http://127.0.0.1:4173/health', headers: {}, queryParams: {}, bodyType: 'none', extractedVariables: [] }, timeoutMs: 5000, timestamp: Date.now(), optional: false };
  return {
    id: '00000000-0000-4000-8000-000000000100',
    projectId: '00000000-0000-4000-8000-000000000001',
    name: `matrix-${platform}-${action}`,
    platform,
    targetConfig: {},
    environmentVariables: {},
    steps: [step],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('Capability matrix generated-project contract', () => {
  it('registers and materializes all 27 valid combinations', async () => {
    expect(GeneratorFactory.getSupportedCombinations()).toHaveLength(27);
    for (const [framework, language] of combinations) {
      const generator = GeneratorFactory.getGenerator(framework, language);
      const platform = generator.supportedPlatforms[0];
      const project = await generator.generateFullProject(createSession(platform, 'navigate'));
      expect(project.manifest.id).toBe(`${framework}-${language}`);
      expect(project.entrypoint).toBe(project.files[0].relativePath);
      expect(project.files.some((file) => file.relativePath === 'automateplus.manifest.json')).toBe(true);
      expect(project.files.every((file) => !/(^|\n)\s*(\/\/|#)\s*Action:/u.test(file.content))).toBe(true);
    }
  });

  it('rejects an action excluded by the selected capability manifest before generation', async () => {
    const generator = GeneratorFactory.getGenerator('cypress', 'typescript');
    const invalidSession = createSession('web', 'assertAttribute');
    invalidSession.steps[0] = {
      id: '00000000-0000-4000-8000-000000000104',
      stepNumber: 1,
      platform: 'web',
      action: 'assertAttribute',
      locators: [{ strategy: 'css', value: '#submit', score: 100 }],
      attributeName: 'aria-label',
      expectedValue: 'Submit',
      timeoutMs: 5000,
      timestamp: Date.now(),
      optional: false,
    };
    await expect(generator.generateFullProject(invalidSession)).rejects.toBeInstanceOf(CapabilityError);
  });
});
