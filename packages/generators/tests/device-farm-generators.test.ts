import { describe, expect, it } from 'vitest';
import { APPIUM_RUNTIME_CONTEXT, CapabilityError } from '@automate-plus/contracts';
import { SessionIR } from '@automate-plus/ir-schema';
import { GeneratorFactory } from '../src/index.js';

const appiumLanguages = ['java', 'kotlin', 'typescript', 'javascript'] as const;

const session: SessionIR = {
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  projectId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  name: 'AndroidRuntimeContext',
  platform: 'android',
  targetConfig: {
    appPackage: 'com.notifplus',
    appActivity: '.MainActivity',
  },
  environmentVariables: {},
  steps: [
    {
      id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      stepNumber: 1,
      platform: 'android',
      action: 'tap',
      locators: [{ strategy: 'text', value: 'Riwayat', score: 100 }],
      timeoutMs: 5000,
      timestamp: 1,
      optional: false,
    },
  ],
  createdAt: 1,
  updatedAt: 1,
};

describe('Appium device-farm generation', () => {
  it('publishes multi-device capability metadata and requires worker context', async () => {
    for (const language of appiumLanguages) {
      const project = await GeneratorFactory.getGenerator('appium', language).generateFullProject(session);
      const source = project.files.find((file) => file.content.includes('AUTOMATEPLUS_APPIUM_URL'))?.content ?? '';

      expect(project.manifest.supportedDeviceStrategies).toEqual(['single', 'all-devices', 'split-iterations']);
      expect(project.manifest.parallelSessionModel).toBe('multi-session');
      expect(project.manifest.requiredRuntimePacks).toEqual(['adb', 'appium', 'appium-uiautomator2']);
      expect(project.manifest.requiresPhysicalDevice).toBe(true);
      expect(project.manifest.runtimeContext).toEqual(APPIUM_RUNTIME_CONTEXT);
      expect(source).toContain('AUTOMATEPLUS_APPIUM_URL');
      expect(source).toContain('AUTOMATEPLUS_DEVICE_UDID');
      expect(source).toContain('AUTOMATEPLUS_SYSTEM_PORT');
      expect(source).toContain('AUTOMATEPLUS_MJPEG_SERVER_PORT');
      expect(source).not.toContain('127.0.0.1');
      expect(source).not.toContain('4723');
    }
  });

  it('rejects an incomplete runtime context instead of using generator defaults', async () => {
    const generator = GeneratorFactory.getGenerator('appium', 'typescript');
    const incompleteContext = {
      ...APPIUM_RUNTIME_CONTEXT,
      variables: APPIUM_RUNTIME_CONTEXT.variables.filter((variable) => variable.key !== 'systemPort'),
    };

    await expect(generator.generateFullProject(session, { runtimeContext: incompleteContext })).rejects.toBeInstanceOf(CapabilityError);
  });
});
