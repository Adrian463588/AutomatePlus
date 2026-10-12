import { AutomationError } from '@automate-plus/contracts';
import { ActionIR, WEB_ACTIONS } from '@automate-plus/ir-schema';
import type { InteractiveStepExecutor } from './interactive-player.js';

export class WebInteractiveStepExecutor implements InteractiveStepExecutor {
  private currentUrl = '';

  public constructor(initialUrl?: string) {
    if (initialUrl) {
      this.currentUrl = initialUrl;
    }
  }

  public getCurrentUrl(): string {
    return this.currentUrl;
  }

  public async execute(step: ActionIR): Promise<void> {
    if (step.platform !== 'web') {
      throw new AutomationError(
        'CAPABILITY_ERROR',
        `Web executor cannot execute action with platform "${step.platform}".`,
      );
    }

    if (!WEB_ACTIONS.includes(step.action as (typeof WEB_ACTIONS)[number])) {
      throw new AutomationError(
        'CAPABILITY_ERROR',
        `Action "${step.action}" is not supported for platform "web".`,
      );
    }

    switch (step.action) {
      case 'navigate': {
        const urlValue = typeof step.value === 'string' ? step.value.trim() : '';
        if (!urlValue) {
          throw new Error('Navigate action requires a target URL.');
        }
        try {
          new URL(urlValue);
        } catch {
          throw new Error(`Invalid URL format: "${urlValue}".`);
        }
        this.currentUrl = urlValue;
        break;
      }

      case 'fill': {
        if (!step.locators || step.locators.length === 0) {
          throw new Error('Fill action requires at least one locator candidate.');
        }
        if (step.value === undefined || step.value === null) {
          throw new Error('Fill action requires an input value.');
        }
        break;
      }

      case 'click':
      case 'doubleClick':
      case 'rightClick':
      case 'hover': {
        if (!step.locators || step.locators.length === 0) {
          throw new Error(`${step.action} action requires at least one locator candidate.`);
        }
        break;
      }

      case 'assertUrl': {
        const expected = step.expectedValue?.trim() ?? '';
        if (!expected) {
          throw new Error('assertUrl requires an expected URL.');
        }
        if (this.currentUrl && !this.currentUrl.includes(expected) && !expected.includes(this.currentUrl)) {
          try {
            new URL(expected);
            this.currentUrl = expected;
          } catch {
            throw new Error(`URL assertion failed. Expected "${expected}", current "${this.currentUrl}".`);
          }
        } else if (!this.currentUrl) {
          this.currentUrl = expected;
        }
        break;
      }

      case 'assertVisible':
      case 'assertHidden': {
        if (!step.locators || step.locators.length === 0) {
          throw new Error(`${step.action} action requires at least one locator candidate.`);
        }
        break;
      }

      case 'assertText': {
        if (!step.locators || step.locators.length === 0) {
          throw new Error('assertText action requires at least one locator candidate.');
        }
        if (step.expectedValue === undefined || step.expectedValue === null) {
          throw new Error('assertText action requires an expectedValue.');
        }
        break;
      }

      case 'assertValue': {
        if (!step.locators || step.locators.length === 0) {
          throw new Error('assertValue action requires at least one locator candidate.');
        }
        if (step.expectedValue === undefined || step.expectedValue === null) {
          throw new Error('assertValue action requires an expectedValue.');
        }
        break;
      }

      case 'assertAttribute': {
        if (!step.locators || step.locators.length === 0) {
          throw new Error('assertAttribute action requires at least one locator candidate.');
        }
        if (!step.attributeName) {
          throw new Error('assertAttribute action requires an attributeName.');
        }
        break;
      }

      case 'waitFor':
      case 'sleep': {
        const timeout = Math.min(step.timeoutMs ?? 50, 100);
        await new Promise((resolve) => setTimeout(resolve, timeout));
        break;
      }

      case 'clear':
      case 'pressKey':
      case 'scroll':
      case 'dragAndDrop':
      case 'takeScreenshot': {
        break;
      }

      default:
        throw new AutomationError(
          'CAPABILITY_ERROR',
          `Action "${step.action}" is not supported for platform "web".`,
        );
    }
  }
}
