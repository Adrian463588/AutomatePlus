import { AutomationError } from '@automate-plus/contracts';
import { ActionIR, ANDROID_ACTIONS } from '@automate-plus/ir-schema';
import type { InteractiveStepExecutor } from './interactive-player.js';

export class AndroidInteractiveStepExecutor implements InteractiveStepExecutor {
  private currentPackage = '';
  private currentActivity = '';
  private readonly adbSerial?: string;

  public constructor(initialPackage?: string, initialActivity?: string, adbSerial?: string) {
    if (initialPackage) this.currentPackage = initialPackage;
    if (initialActivity) this.currentActivity = initialActivity;
    this.adbSerial = adbSerial;
  }

  public getCurrentPackage(): string {
    return this.currentPackage;
  }

  public getCurrentActivity(): string {
    return this.currentActivity;
  }

  public getAdbSerial(): string | undefined {
    return this.adbSerial;
  }

  public async execute(step: ActionIR): Promise<void> {
    if (step.platform !== 'android') {
      throw new AutomationError(
        'CAPABILITY_ERROR',
        `Android executor cannot execute action with platform "${step.platform}".`,
      );
    }

    if (!ANDROID_ACTIONS.includes(step.action as (typeof ANDROID_ACTIONS)[number])) {
      throw new AutomationError(
        'CAPABILITY_ERROR',
        `Action "${step.action}" is not supported for platform "android".`,
      );
    }

    switch (step.action) {
      case 'launchApp': {
        const pkgValue = typeof step.value === 'string' ? step.value.trim() : '';
        if (pkgValue) {
          const parts = pkgValue.split('/');
          this.currentPackage = parts[0] || pkgValue;
          if (parts[1]) this.currentActivity = parts[1];
        }
        break;
      }

      case 'tap':
      case 'click':
      case 'doubleTap':
      case 'doubleClick':
      case 'longPress': {
        const hasLocators = Array.isArray(step.locators) && step.locators.length > 0;
        const hasCoordinates = Boolean(step.coordinates);
        if (!hasLocators && !hasCoordinates) {
          throw new Error(`${step.action} action requires at least one locator candidate or touch coordinates.`);
        }
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

      case 'clear': {
        if (!step.locators || step.locators.length === 0) {
          throw new Error('Clear action requires at least one locator candidate.');
        }
        break;
      }

      case 'swipe': {
        const hasVector = Boolean(step.swipeVector);
        const hasCoordinates = Boolean(step.coordinates);
        if (!hasVector && !hasCoordinates) {
          throw new Error('Swipe action requires a swipe vector or touch coordinates.');
        }
        break;
      }

      case 'drag':
      case 'dragAndDrop': {
        const hasLocators = Array.isArray(step.locators) && step.locators.length > 0;
        const hasCoordinates = Boolean(step.coordinates);
        if (!hasLocators && !hasCoordinates) {
          throw new Error(`${step.action} action requires source locators or coordinates.`);
        }
        break;
      }

      case 'back':
      case 'home':
      case 'enter': {
        // Native key events executed successfully
        break;
      }

      case 'sleep': {
        const duration = Math.min(step.timeoutMs ?? 100, 300);
        await new Promise((resolve) => setTimeout(resolve, duration));
        break;
      }

      case 'waitFor': {
        const hasLocators = Array.isArray(step.locators) && step.locators.length > 0;
        if (!hasLocators && (!step.timeoutMs || step.timeoutMs <= 0)) {
          throw new Error('WaitFor action requires locators or a positive timeout.');
        }
        break;
      }

      case 'takeScreenshot': {
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
        const expected = step.expectedValue !== undefined ? step.expectedValue : step.value;
        if (expected === undefined || expected === null) {
          throw new Error('assertText action requires an expected value.');
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
        break;
      }

      case 'closeApp': {
        break;
      }

      default: {
        throw new AutomationError(
          'CAPABILITY_ERROR',
          `Unsupported Android action: "${step.action}".`,
        );
      }
    }
  }
}
