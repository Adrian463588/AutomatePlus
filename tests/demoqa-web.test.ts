import { describe, expect, it } from 'vitest';
import { ActionIR, SessionIR, validateSessionIR } from '@automate-plus/ir-schema';
import { GeneratorFactory } from '@automate-plus/generators';
import { InteractivePlayer } from '@automate-plus/runner-core';

describe('DemoQA Web Automation Suite', () => {
  const demoqaSteps: ActionIR[] = [
    {
      id: 'd1000000-0000-4000-8000-000000000001',
      schemaVersion: 2,
      stepNumber: 1,
      platform: 'web',
      action: 'navigate',
      value: 'https://demoqa.com/text-box',
      timeoutMs: 5000,
      timestamp: 1000,
    },
    {
      id: 'd1000000-0000-4000-8000-000000000002',
      schemaVersion: 2,
      stepNumber: 2,
      platform: 'web',
      action: 'fill',
      value: 'Adrian AutomatePlus',
      locators: [
        { strategy: 'testId', value: 'userName', score: 100 },
        { strategy: 'css', value: '#userName', score: 85 },
        { strategy: 'role', value: 'textbox[name="Full Name"]', score: 70 },
      ],
      timeoutMs: 5000,
      timestamp: 1050,
    },
    {
      id: 'd1000000-0000-4000-8000-000000000003',
      schemaVersion: 2,
      stepNumber: 3,
      platform: 'web',
      action: 'fill',
      value: 'adrian@automateplus.local',
      locators: [
        { strategy: 'testId', value: 'userEmail', score: 100 },
        { strategy: 'css', value: '#userEmail', score: 85 },
      ],
      timeoutMs: 5000,
      timestamp: 1100,
    },
    {
      id: 'd1000000-0000-4000-8000-000000000004',
      schemaVersion: 2,
      stepNumber: 4,
      platform: 'web',
      action: 'fill',
      value: 'Jakarta Indonesia',
      locators: [
        { strategy: 'testId', value: 'currentAddress', score: 100 },
        { strategy: 'css', value: '#currentAddress', score: 85 },
      ],
      timeoutMs: 5000,
      timestamp: 1150,
    },
    {
      id: 'd1000000-0000-4000-8000-000000000005',
      schemaVersion: 2,
      stepNumber: 5,
      platform: 'web',
      action: 'fill',
      value: 'Jakarta Indonesia',
      locators: [
        { strategy: 'testId', value: 'permanentAddress', score: 100 },
        { strategy: 'css', value: '#permanentAddress', score: 85 },
      ],
      timeoutMs: 5000,
      timestamp: 1200,
    },
    {
      id: 'd1000000-0000-4000-8000-000000000006',
      schemaVersion: 2,
      stepNumber: 6,
      platform: 'web',
      action: 'click',
      locators: [
        { strategy: 'testId', value: 'submit', score: 100 },
        { strategy: 'css', value: '#submit', score: 85 },
      ],
      timeoutMs: 5000,
      timestamp: 1250,
    },
    {
      id: 'd1000000-0000-4000-8000-000000000007',
      schemaVersion: 2,
      stepNumber: 7,
      platform: 'web',
      action: 'assertVisible',
      locators: [
        { strategy: 'testId', value: 'output', score: 100 },
        { strategy: 'css', value: '#output', score: 85 },
      ],
      timeoutMs: 5000,
      timestamp: 1300,
    },
    {
      id: 'd1000000-0000-4000-8000-000000000008',
      schemaVersion: 2,
      stepNumber: 8,
      platform: 'web',
      action: 'assertText',
      expectedValue: 'Name:Adrian AutomatePlus',
      locators: [
        { strategy: 'testId', value: 'name', score: 100 },
        { strategy: 'css', value: '#name', score: 85 },
      ],
      timeoutMs: 5000,
      timestamp: 1350,
    },
  ];

  const demoqaSession: SessionIR = {
    id: 'd1000000-0000-4000-8000-000000000000',
    schemaVersion: 2,
    projectId: 'c9a646d3-9c61-4cd7-bf11-7360058b730f',
    name: 'DemoQA TextBox Automation',
    platform: 'web',
    targetConfig: {
      startUrl: 'https://demoqa.com/text-box',
      viewport: { width: 1280, height: 800 },
    },
    environmentVariables: {},
    steps: demoqaSteps,
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
  };

  it('validates canonical SessionIR schema for DemoQA flow', () => {
    const validation = validateSessionIR(demoqaSession);
    expect(validation.success).toBe(true);
    expect(demoqaSession.steps).toHaveLength(8);
    expect(demoqaSession.targetConfig.startUrl).toBe('https://demoqa.com/text-box');
  });

  it('generates executable Playwright TypeScript project for DemoQA', async () => {
    const generator = GeneratorFactory.getGenerator('playwright', 'typescript');
    const project = await generator.generateFullProject(demoqaSession);

    expect(project.framework).toBe('playwright');
    expect(project.language).toBe('typescript');
    const testFile = project.files.find((f) => f.relativePath.includes('demoqa'));
    expect(testFile?.content).toContain('https://demoqa.com/text-box');
    expect(testFile?.content).toContain('Adrian AutomatePlus');
    expect(testFile?.content).toContain('adrian@automateplus.local');
    expect(testFile?.content).not.toContain('TODO');
  });

  it('generates executable Playwright Python project for DemoQA', async () => {
    const generator = GeneratorFactory.getGenerator('playwright', 'python');
    const project = await generator.generateFullProject(demoqaSession);

    expect(project.framework).toBe('playwright');
    expect(project.language).toBe('python');
    const testFile = project.files[0];
    expect(testFile?.content).toContain('https://demoqa.com/text-box');
    expect(testFile?.content).toContain('page.goto');
    expect(testFile?.content).toContain('Adrian AutomatePlus');
  });

  it('generates executable Cypress TypeScript project for DemoQA', async () => {
    const generator = GeneratorFactory.getGenerator('cypress', 'typescript');
    const project = await generator.generateFullProject(demoqaSession);

    expect(project.framework).toBe('cypress');
    const testFile = project.files[0];
    expect(testFile?.content).toContain('cy.visit');
    expect(testFile?.content).toContain('https://demoqa.com/text-box');
  });

  it('generates executable Selenium Java project for DemoQA', async () => {
    const generator = GeneratorFactory.getGenerator('selenium', 'java');
    const project = await generator.generateFullProject(demoqaSession);

    expect(project.framework).toBe('selenium');
    expect(project.language).toBe('java');
    const testFile = project.files[0];
    expect(testFile?.content).toContain('driver.get("https://demoqa.com/text-box")');
    expect(testFile?.content).toContain('Adrian AutomatePlus');
  });

  it('generates executable Robot Framework test suite for DemoQA', async () => {
    const generator = GeneratorFactory.getGenerator('robot', 'robot');
    const project = await generator.generateFullProject(demoqaSession);

    expect(project.framework).toBe('robot');
    const testFile = project.files[0];
    expect(testFile?.content).toContain('*** Test Cases ***');
    expect(testFile?.content).toContain('https://demoqa.com/text-box');
  });

  it('executes DemoQA flow via InteractivePlayer runner', async () => {
    const executedActions: string[] = [];
    const player = new InteractivePlayer({
      execute: async (step) => {
        executedActions.push(step.action);
      },
    });

    const logs: string[] = [];
    const summary = await player.run(demoqaSession, { executionMode: 'interactive' }, (log) => {
      logs.push(log.message);
    });

    expect(summary.status).toBe('passed');
    expect(summary.passedSteps).toBe(8);
    expect(summary.failedSteps).toBe(0);
    expect(executedActions).toHaveLength(8);
    expect(executedActions[0]).toBe('navigate');
    expect(executedActions[7]).toBe('assertText');
  });
});
