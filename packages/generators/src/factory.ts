import { ICodeGenerator } from '@automate-plus/contracts';

// Web
import { PlaywrightTsGenerator } from './web/playwright-ts.generator.js';
import { PlaywrightJsGenerator } from './web/playwright-js.generator.js';
import { PlaywrightPythonGenerator } from './web/playwright-python.generator.js';
import { PlaywrightJavaGenerator } from './web/playwright-java.generator.js';
import { CypressTsGenerator } from './web/cypress-ts.generator.js';
import { CypressJsGenerator } from './web/cypress-js.generator.js';
import { PuppeteerTsGenerator } from './web/puppeteer-ts.generator.js';
import { PuppeteerJsGenerator } from './web/puppeteer-js.generator.js';
import { SeleniumTsGenerator } from './web/selenium-ts.generator.js';
import { SeleniumJsGenerator } from './web/selenium-js.generator.js';
import { SeleniumPythonGenerator } from './web/selenium-python.generator.js';
import { SeleniumJavaGenerator } from './web/selenium-java.generator.js';
import { RobotFrameworkGenerator } from './web/robot-framework.generator.js';

// Android
import { AppiumJavaGenerator } from './android/appium-java.generator.js';
import { AppiumKotlinGenerator } from './android/appium-kotlin.generator.js';
import { AppiumTsGenerator } from './android/appium-ts.generator.js';
import { AppiumJsGenerator } from './android/appium-js.generator.js';
import { EspressoKotlinGenerator } from './android/espresso-kotlin.generator.js';
import { EspressoJavaGenerator } from './android/espresso-java.generator.js';
import { RobolectricKotlinGenerator } from './android/robolectric-kotlin.generator.js';
import { RobolectricJavaGenerator } from './android/robolectric-java.generator.js';
import { MaestroYamlGenerator } from './android/maestro-yaml.generator.js';

// API
import { K6StressGenerator } from './api/k6-stress.generator.js';
import { HttpTsGenerator } from './api/http-ts.generator.js';
import { HttpJsGenerator } from './api/http-js.generator.js';
import { HttpPythonGenerator } from './api/http-python.generator.js';
import { HttpJavaGenerator } from './api/http-java.generator.js';

export class GeneratorFactory {
  private static generators: Map<string, ICodeGenerator> = new Map();

  static {
    // Web
    this.register(new PlaywrightTsGenerator());
    this.register(new PlaywrightJsGenerator());
    this.register(new PlaywrightPythonGenerator());
    this.register(new PlaywrightJavaGenerator());
    this.register(new CypressTsGenerator());
    this.register(new CypressJsGenerator());
    this.register(new PuppeteerTsGenerator());
    this.register(new PuppeteerJsGenerator());
    this.register(new SeleniumTsGenerator());
    this.register(new SeleniumJsGenerator());
    this.register(new SeleniumPythonGenerator());
    this.register(new SeleniumJavaGenerator());
    this.register(new RobotFrameworkGenerator());

    // Android
    this.register(new AppiumJavaGenerator());
    this.register(new AppiumKotlinGenerator());
    this.register(new AppiumTsGenerator());
    this.register(new AppiumJsGenerator());
    this.register(new EspressoKotlinGenerator());
    this.register(new EspressoJavaGenerator());
    this.register(new RobolectricKotlinGenerator());
    this.register(new RobolectricJavaGenerator());
    this.register(new MaestroYamlGenerator());

    // API
    this.register(new K6StressGenerator());
    this.register(new HttpTsGenerator());
    this.register(new HttpJsGenerator());
    this.register(new HttpPythonGenerator());
    this.register(new HttpJavaGenerator());
  }

  public static register(generator: ICodeGenerator): void {
    const key = `${generator.framework.toLowerCase()}:${generator.language.toLowerCase()}`;
    this.generators.set(key, generator);
  }

  public static getGenerator(framework: string, language: string): ICodeGenerator {
    const key = `${framework.toLowerCase()}:${language.toLowerCase()}`;
    const gen = this.generators.get(key);
    if (!gen) {
      throw new Error(
        `CapabilityError: No code generator registered for framework '${framework}' with language '${language}'. Please check the capability matrix.`
      );
    }
    return gen;
  }

  public static getSupportedCombinations(): Array<{ framework: string; language: string; platforms: readonly string[] }> {
    return Array.from(this.generators.values()).map((g) => ({
      framework: g.framework,
      language: g.language,
      platforms: g.supportedPlatforms,
    }));
  }

  public static getSupportedLanguagesForFramework(framework: string): string[] {
    const fw = framework.toLowerCase();
    const langs: string[] = [];
    for (const [key, gen] of this.generators.entries()) {
      if (key.startsWith(fw + ':')) {
        langs.push(gen.language);
      }
    }
    return langs;
  }

  public static isCombinationSupported(framework: string, language: string): boolean {
    const key = `${framework.toLowerCase()}:${language.toLowerCase()}`;
    return this.generators.has(key);
  }
}
