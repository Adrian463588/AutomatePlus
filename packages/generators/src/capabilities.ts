import {
  APPIUM_RUNTIME_CONTEXT,
  CapabilityManifest,
  DeviceExecutionStrategy,
  ParallelSessionModel,
} from '@automate-plus/contracts';

const WEB_ACTIONS = [
  'navigate', 'click', 'doubleClick', 'rightClick', 'hover', 'fill', 'clear', 'pressKey',
  'scroll', 'dragAndDrop', 'waitFor', 'sleep', 'takeScreenshot', 'assertVisible',
  'assertHidden', 'assertText', 'assertValue', 'assertUrl',
];

const WEB_ACTIONS_BY_FRAMEWORK: Record<string, string[]> = {
  playwright: WEB_ACTIONS,
  cypress: WEB_ACTIONS,
  puppeteer: WEB_ACTIONS.filter((action) => !['dragAndDrop', 'waitFor', 'assertHidden'].includes(action)),
  selenium: WEB_ACTIONS.filter((action) => !['waitFor', 'dragAndDrop'].includes(action)),
  robot: WEB_ACTIONS.filter((action) => !['waitFor'].includes(action)),
};

const ANDROID_ACTIONS_BY_FRAMEWORK: Record<string, string[]> = {
  appium: [
    'tap', 'click', 'doubleTap', 'doubleClick', 'longPress', 'fill', 'clear', 'swipe', 'drag',
    'dragAndDrop', 'back', 'home', 'enter', 'sleep', 'takeScreenshot', 'assertVisible',
    'assertHidden', 'assertText',
  ],
  espresso: ['tap', 'click', 'doubleTap', 'doubleClick', 'longPress', 'fill', 'clear', 'swipe', 'back', 'enter', 'sleep', 'assertVisible', 'assertText'],
  robolectric: ['tap', 'click', 'doubleTap', 'doubleClick', 'fill', 'clear', 'assertVisible', 'assertText'],
  maestro: ['tap', 'click', 'doubleTap', 'doubleClick', 'longPress', 'fill', 'clear', 'back', 'scroll', 'swipe', 'sleep', 'takeScreenshot', 'assertVisible', 'assertText'],
};

const API_ACTIONS_BY_FRAMEWORK: Record<string, string[]> = {
  k6: ['httpRequest', 'sleep', 'assertStatusCode'],
  http: ['httpRequest', 'sleep', 'assertStatusCode', 'assertJsonPath', 'assertHeader'],
};

const ASSERTIONS = [
  'assertVisible', 'assertHidden', 'assertText', 'assertValue', 'assertAttribute',
  'assertUrl', 'assertStatusCode', 'assertJsonPath', 'assertHeader', 'assertResponseTime',
];

const outputFormatFor = (language: string): CapabilityManifest['outputFormat'] => {
  if (language === 'robot') return 'robot';
  if (language === 'yaml') return 'yaml';
  return language as CapabilityManifest['outputFormat'];
};

const runtimeFor = (framework: string, language: string): string[] => {
  if (framework === 'k6') return ['k6'];
  if (framework === 'robot') return ['python', 'robotframework'];
  if (framework === 'selenium' && language === 'python') return ['python', 'selenium'];
  if (framework === 'playwright' && language === 'python') return ['python', 'playwright'];
  if (framework === 'playwright' && language === 'java') return ['jdk', 'playwright-java'];
  if (framework === 'appium' && ['java', 'kotlin'].includes(language)) return ['jdk', 'appium', 'adb'];
  if (framework === 'appium') return ['node', 'appium', 'adb'];
  if (['espresso', 'robolectric'].includes(framework)) return ['jdk', 'gradle', 'android-sdk'];
  if (framework === 'maestro') return ['maestro', 'adb'];
  if (framework === 'http' && language === 'python') return ['python', 'requests'];
  if (framework === 'http' && language === 'java') return ['jdk', 'restassured'];
  return ['node', framework];
};

const deviceStrategiesFor = (
  framework: string,
  platform: CapabilityManifest['platform'],
): readonly DeviceExecutionStrategy[] => {
  if (platform !== 'android') return [];
  if (framework === 'appium') return ['single', 'all-devices', 'split-iterations'];
  if (framework === 'robolectric') return [];
  return ['single'];
};

const parallelSessionModelFor = (
  framework: string,
  platform: CapabilityManifest['platform'],
): ParallelSessionModel => {
  if (platform !== 'android') return 'none';
  if (framework === 'appium') return 'multi-session';
  if (framework === 'robolectric') return 'none';
  return 'single-session';
};

const requiredRuntimePacksFor = (framework: string, platform: CapabilityManifest['platform']): readonly string[] => {
  if (platform !== 'android') return [];
  if (framework === 'appium') return ['adb', 'appium', 'appium-uiautomator2'];
  if (framework === 'maestro') return ['adb', 'maestro'];
  return ['android-sdk', 'gradle', 'jdk'];
};

function actionsFor(framework: string, platform: CapabilityManifest['platform']): string[] {
  if (platform === 'web') return [...(WEB_ACTIONS_BY_FRAMEWORK[framework] ?? [])];
  if (platform === 'android') return [...(ANDROID_ACTIONS_BY_FRAMEWORK[framework] ?? [])];
  return [...(API_ACTIONS_BY_FRAMEWORK[framework] ?? [])];
}

export function createCapabilityManifest(
  framework: string,
  language: string,
  platform: 'web' | 'android' | 'api',
): CapabilityManifest {
  const actions = actionsFor(framework, platform);
  const manifest: CapabilityManifest = {
    id: `${framework}-${language}`,
    platform,
    framework,
    language,
    outputFormat: outputFormatFor(language),
    supportedActions: actions,
    supportedAssertions: ASSERTIONS.filter((assertion) => actions.includes(assertion)),
    requiredRuntimes: runtimeFor(framework, language),
    supportedDeviceStrategies: deviceStrategiesFor(framework, platform),
    parallelSessionModel: parallelSessionModelFor(framework, platform),
    requiredRuntimePacks: requiredRuntimePacksFor(framework, platform),
    requiresPhysicalDevice: platform === 'android' && framework !== 'robolectric',
    ...(framework === 'appium' && platform === 'android' ? { runtimeContext: APPIUM_RUNTIME_CONTEXT } : {}),
    runnerCommandId: `${framework}.${language}.run`,
    version: '2.1.0',
  };

  if (['espresso', 'robolectric'].includes(framework)) manifest.requiresProject = 'android-gradle';
  return manifest;
}
