import { GeneratorFactory } from '@automate-plus/generators';

const combinations = GeneratorFactory.getSupportedCombinations();
const forbidden = [
  /\bTODO\b/u,
  /50%,50%/u,
  /com\.example(?:\.|\/)/u,
  /(?:api\.)?[^\s"']+\.local(?:\/|["'])/u,
  /(?:localhost|127\.0\.0\.1):4723/u,
  /(?:serial|udid)\s*[:=]\s*["'](?:QSWSEMRKNFZ9LJRC|RRCN3008VYE)["']/iu,
];

function sessionFor(platform) {
  const common = {
    id: `00000000-0000-4000-8000-${platform === 'web' ? '000000000101' : platform === 'android' ? '000000000102' : '000000000103'}`,
    projectId: '00000000-0000-4000-8000-000000000100',
    name: `Verified ${platform} target`,
    platform,
    environmentVariables: {},
    createdAt: 1,
    updatedAt: 1,
  };
  if (platform === 'web') {
    return {
      ...common,
      targetConfig: { startUrl: 'https://www.saucedemo.com/', viewport: { width: 1280, height: 800 } },
      steps: [{
        id: '00000000-0000-4000-8000-000000000111',
        schemaVersion: 2,
        stepNumber: 1,
        platform,
        action: 'navigate',
        value: 'https://www.saucedemo.com/',
        timeoutMs: 5_000,
        timestamp: 1,
      }],
    };
  }
  if (platform === 'android') {
    return {
      ...common,
      targetConfig: { appPackage: 'com.notifplus', appActivity: 'com.notifplus.MainActivity' },
      steps: [{
        id: '00000000-0000-4000-8000-000000000112',
        schemaVersion: 2,
        stepNumber: 1,
        platform,
        action: 'tap',
        locators: [{ strategy: 'text', value: 'Riwayat', score: 100 }],
        timeoutMs: 5_000,
        timestamp: 1,
      }],
    };
  }
  return {
    ...common,
    targetConfig: { baseUrl: 'https://petstore.swagger.io/v2' },
    steps: [{
      id: '00000000-0000-4000-8000-000000000113',
      schemaVersion: 2,
      stepNumber: 1,
      platform,
      action: 'httpRequest',
      apiPayload: {
        method: 'GET',
        url: 'https://petstore.swagger.io/v2/store/inventory',
        headers: {},
        queryParams: {},
        bodyType: 'none',
        extractedVariables: [],
      },
      timeoutMs: 5_000,
      timestamp: 1,
    }],
  };
}

function assertNoForbiddenOutput(framework, language, files) {
  for (const file of files) {
    for (const pattern of forbidden) {
      if (pattern.test(file.content)) {
        throw new Error(`${framework}/${language} emitted forbidden output in ${file.relativePath}: ${pattern}`);
      }
    }
  }
}

function assertSupportContract(framework, language, files) {
  const content = files.map((file) => file.content).join('\n');
  if (language === 'python' && framework === 'playwright' && !content.includes('pytest-playwright==')) {
    throw new Error('playwright/python must declare pytest-playwright');
  }
  if (language === 'java') {
    const expected = {
      appium: 'io.appium',
      http: 'io.rest-assured',
      playwright: 'com.microsoft.playwright',
      selenium: 'org.seleniumhq.selenium',
    }[framework];
    if (expected && !content.includes(expected)) throw new Error(`${framework}/java has no ${expected} dependency`);
  }
  if (language === 'kotlin' && framework === 'appium' && !content.includes('io.appium:java-client')) {
    throw new Error('appium/kotlin must declare java-client');
  }
  if ((framework === 'espresso' || framework === 'robolectric') && !content.includes('com.android')) {
    throw new Error(`${framework}/${language} must declare an Android Gradle project contract`);
  }
}

if (combinations.length !== 27) throw new Error(`Expected 27 generators, received ${combinations.length}`);

for (const combination of combinations) {
  const generator = GeneratorFactory.getGenerator(combination.framework, combination.language);
  const session = sessionFor(generator.supportedPlatforms[0]);
  const project = await generator.generateFullProject(session);
  if (project.entrypoint !== project.files[0]?.relativePath) throw new Error(`${combination.framework}/${combination.language} entrypoint mismatch`);
  if (!project.files.some((file) => file.relativePath === 'automateplus.manifest.json')) throw new Error(`${combination.framework}/${combination.language} manifest missing`);
  if (new Set(project.files.map((file) => file.relativePath)).size !== project.files.length) throw new Error(`${combination.framework}/${combination.language} duplicate generated paths`);
  assertNoForbiddenOutput(combination.framework, combination.language, project.files);
  assertSupportContract(combination.framework, combination.language, project.files);
}

console.log(`generator matrix passed: ${combinations.length} capability combinations generated and validated`);
