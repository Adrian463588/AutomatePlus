import { describe, expect, it } from 'vitest';
import { ActionIR, SessionIR, validateSessionIR } from '@automate-plus/ir-schema';
import { GeneratorFactory } from '@automate-plus/generators';
import { InteractivePlayer } from '@automate-plus/runner-core';

// ComponentTest boundary: the executor is injected; this suite never opens a browser.
describe('ComponentTest fixture: SauceDemo Web generator', () => {
  const saucedemoSteps: ActionIR[] = [
    {
      id: 'a1000000-0000-4000-8000-000000000001',
      schemaVersion: 2,
      stepNumber: 1,
      platform: 'web',
      action: 'navigate',
      value: 'https://www.saucedemo.com/',
      timeoutMs: 5000,
      timestamp: 1000,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000002',
      schemaVersion: 2,
      stepNumber: 2,
      platform: 'web',
      action: 'fill',
      value: 'standard_user',
      locators: [
        { strategy: 'testId', value: 'username', score: 100 },
        { strategy: 'css', value: '#user-name', score: 80 },
        { strategy: 'role', value: 'textbox[name="Username"]', score: 75 },
      ],
      timeoutMs: 5000,
      timestamp: 1050,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000003',
      schemaVersion: 2,
      stepNumber: 3,
      platform: 'web',
      action: 'fill',
      value: 'secret_sauce',
      locators: [
        { strategy: 'testId', value: 'password', score: 100 },
        { strategy: 'css', value: '#password', score: 80 },
      ],
      timeoutMs: 5000,
      timestamp: 1100,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000004',
      schemaVersion: 2,
      stepNumber: 4,
      platform: 'web',
      action: 'click',
      locators: [
        { strategy: 'testId', value: 'login-button', score: 100 },
        { strategy: 'css', value: '#login-button', score: 80 },
        { strategy: 'role', value: 'button[name="Login"]', score: 75 },
      ],
      timeoutMs: 5000,
      timestamp: 1150,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000005',
      schemaVersion: 2,
      stepNumber: 5,
      platform: 'web',
      action: 'assertUrl',
      expectedValue: 'https://www.saucedemo.com/inventory.html',
      timeoutMs: 5000,
      timestamp: 1200,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000006',
      schemaVersion: 2,
      stepNumber: 6,
      platform: 'web',
      action: 'assertVisible',
      locators: [
        { strategy: 'testId', value: 'inventory-container', score: 100 },
        { strategy: 'css', value: '.inventory_list', score: 80 },
      ],
      timeoutMs: 5000,
      timestamp: 1250,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000007',
      schemaVersion: 2,
      stepNumber: 7,
      platform: 'web',
      action: 'click',
      locators: [
        { strategy: 'testId', value: 'add-to-cart-sauce-labs-backpack', score: 100 },
        { strategy: 'css', value: '#add-to-cart-sauce-labs-backpack', score: 80 },
      ],
      timeoutMs: 5000,
      timestamp: 1300,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000008',
      schemaVersion: 2,
      stepNumber: 8,
      platform: 'web',
      action: 'click',
      locators: [
        { strategy: 'testId', value: 'shopping-cart-link', score: 100 },
        { strategy: 'css', value: '.shopping_cart_link', score: 80 },
      ],
      timeoutMs: 5000,
      timestamp: 1350,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000009',
      schemaVersion: 2,
      stepNumber: 9,
      platform: 'web',
      action: 'assertVisible',
      locators: [
        { strategy: 'testId', value: 'item-4-title-link', score: 100 },
        { strategy: 'css', value: '.inventory_item_name', score: 80 },
      ],
      timeoutMs: 5000,
      timestamp: 1400,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000010',
      schemaVersion: 2,
      stepNumber: 10,
      platform: 'web',
      action: 'click',
      locators: [
        { strategy: 'testId', value: 'checkout', score: 100 },
        { strategy: 'css', value: '#checkout', score: 80 },
      ],
      timeoutMs: 5000,
      timestamp: 1450,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000011',
      schemaVersion: 2,
      stepNumber: 11,
      platform: 'web',
      action: 'fill',
      value: 'Standard',
      locators: [
        { strategy: 'testId', value: 'firstName', score: 100 },
        { strategy: 'css', value: '#first-name', score: 80 },
      ],
      timeoutMs: 5000,
      timestamp: 1500,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000012',
      schemaVersion: 2,
      stepNumber: 12,
      platform: 'web',
      action: 'fill',
      value: 'User',
      locators: [
        { strategy: 'testId', value: 'lastName', score: 100 },
        { strategy: 'css', value: '#last-name', score: 80 },
      ],
      timeoutMs: 5000,
      timestamp: 1550,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000013',
      schemaVersion: 2,
      stepNumber: 13,
      platform: 'web',
      action: 'fill',
      value: '94043',
      locators: [
        { strategy: 'testId', value: 'postalCode', score: 100 },
        { strategy: 'css', value: '#postal-code', score: 80 },
      ],
      timeoutMs: 5000,
      timestamp: 1600,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000014',
      schemaVersion: 2,
      stepNumber: 14,
      platform: 'web',
      action: 'click',
      locators: [
        { strategy: 'testId', value: 'continue', score: 100 },
        { strategy: 'css', value: '#continue', score: 80 },
      ],
      timeoutMs: 5000,
      timestamp: 1650,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000015',
      schemaVersion: 2,
      stepNumber: 15,
      platform: 'web',
      action: 'click',
      locators: [
        { strategy: 'testId', value: 'finish', score: 100 },
        { strategy: 'css', value: '#finish', score: 80 },
      ],
      timeoutMs: 5000,
      timestamp: 1700,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000016',
      schemaVersion: 2,
      stepNumber: 16,
      platform: 'web',
      action: 'assertText',
      expectedValue: 'Thank you for your order!',
      locators: [
        { strategy: 'testId', value: 'complete-header', score: 100 },
        { strategy: 'css', value: '.complete-header', score: 80 },
      ],
      timeoutMs: 5000,
      timestamp: 1750,
    },
  ];

  const saucedemoSession: SessionIR = {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    schemaVersion: 2,
    projectId: 'c9a646d3-9c61-4cd7-bf11-7360058b730f',
    name: 'Saucedemo Purchase Journey',
    platform: 'web',
    targetConfig: {
      startUrl: 'https://www.saucedemo.com/',
      viewport: { width: 1280, height: 800 },
    },
    environmentVariables: {},
    steps: saucedemoSteps,
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
  };

  it('validates canonical SessionIR schema for Saucedemo flow', () => {
    const validation = validateSessionIR(saucedemoSession);
    expect(validation.success).toBe(true);
    expect(saucedemoSession.steps).toHaveLength(16);
    expect(saucedemoSession.targetConfig.startUrl).toBe('https://www.saucedemo.com/');
  });

  it('generates executable Playwright TypeScript project for Saucedemo', async () => {
    const generator = GeneratorFactory.getGenerator('playwright', 'typescript');
    const project = await generator.generateFullProject(saucedemoSession);

    expect(project.framework).toBe('playwright');
    expect(project.language).toBe('typescript');
    expect(project.files.length).toBeGreaterThanOrEqual(1);

    const testFile = project.files.find((f) => f.relativePath.includes('saucedemo'));
    expect(testFile).toBeDefined();
    expect(testFile?.content).toContain('https://www.saucedemo.com/');
    expect(testFile?.content).toContain('standard_user');
    expect(testFile?.content).toContain('secret_sauce');
    expect(testFile?.content).toContain('inventory.html');
    expect(testFile?.content).toContain('Thank you for your order!');
    expect(testFile?.content).not.toContain('TODO');
  });

  it('generates executable Playwright Python project for Saucedemo', async () => {
    const generator = GeneratorFactory.getGenerator('playwright', 'python');
    const project = await generator.generateFullProject(saucedemoSession);

    expect(project.framework).toBe('playwright');
    expect(project.language).toBe('python');

    const testFile = project.files[0];
    expect(testFile?.content).toContain('https://www.saucedemo.com/');
    expect(testFile?.content).toContain('page.goto');
    expect(testFile?.content).toContain('standard_user');
    expect(testFile?.content).toContain('secret_sauce');
  });

  it('generates executable Cypress TypeScript project for Saucedemo', async () => {
    const generator = GeneratorFactory.getGenerator('cypress', 'typescript');
    const project = await generator.generateFullProject(saucedemoSession);

    expect(project.framework).toBe('cypress');
    const testFile = project.files[0];
    expect(testFile?.content).toContain('cy.visit');
    expect(testFile?.content).toContain('https://www.saucedemo.com/');
    expect(testFile?.content).toContain('standard_user');
  });

  it('generates executable Selenium Java project for Saucedemo', async () => {
    const generator = GeneratorFactory.getGenerator('selenium', 'java');
    const project = await generator.generateFullProject(saucedemoSession);

    expect(project.framework).toBe('selenium');
    expect(project.language).toBe('java');

    const testFile = project.files[0];
    expect(testFile?.content).toContain('driver.get("https://www.saucedemo.com/")');
    expect(testFile?.content).toContain('standard_user');
  });

  it('generates executable Robot Framework test suite for Saucedemo', async () => {
    const generator = GeneratorFactory.getGenerator('robot', 'robot');
    const project = await generator.generateFullProject(saucedemoSession);

    expect(project.framework).toBe('robot');
    const testFile = project.files[0];
    expect(testFile?.content).toContain('*** Test Cases ***');
    expect(testFile?.content).toContain('https://www.saucedemo.com/');
  });

  it('executes Saucedemo flow via InteractivePlayer runner', async () => {
    const executedActions: string[] = [];
    const player = new InteractivePlayer({
      execute: async (step) => {
        executedActions.push(step.action);
      },
    });

    const logs: string[] = [];
    const summary = await player.run(saucedemoSession, { executionMode: 'interactive' }, (log) => {
      logs.push(log.message);
    });

    expect(summary.status).toBe('passed');
    expect(summary.passedSteps).toBe(16);
    expect(summary.failedSteps).toBe(0);
    expect(executedActions).toHaveLength(16);
    expect(executedActions[0]).toBe('navigate');
    expect(executedActions[15]).toBe('assertText');
  });
});
