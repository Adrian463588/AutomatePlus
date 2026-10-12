import { describe, it, expect } from 'vitest';
import { mcpBridge, MCP_TOOLS } from '../mcpBridge.js';

describe('AutomatePlus MCP Bridge & AI Agent Tool Provider', () => {
  it('handles JSON-RPC initialize request', async () => {
    const response = await mcpBridge.handleMcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect((response.result as any).serverInfo.name).toBe('automate-plus-mcp');
    expect((response.result as any).serverInfo.version).toBe('1.6.0');
    expect((response.result as any).protocolVersion).toBe('2024-11-05');
  });

  it('exposes all 5 registered tools in tools/list', async () => {
    const response = await mcpBridge.handleMcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    const tools = (response.result as any).tools;
    expect(tools).toHaveLength(5);
    const toolNames = tools.map((t: any) => t.name);
    expect(toolNames).toContain('automateplus_inspect_web_elements');
    expect(toolNames).toContain('automateplus_run_web');
    expect(toolNames).toContain('automateplus_run_android');
    expect(toolNames).toContain('automateplus_run_phone_farm');
    expect(toolNames).toContain('automateplus_generate_test_script');
  });

  it('inspects interactive web elements via automateplus_inspect_web_elements', async () => {
    const response = await mcpBridge.handleMcpRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'automateplus_inspect_web_elements',
        arguments: { url: 'https://www.saucedemo.com/' },
      },
    });

    expect(response.result).toBeDefined();
    const text = (response.result as any).content[0].text;
    const elements = JSON.parse(text);
    expect(elements.length).toBeGreaterThanOrEqual(4);
    expect(elements.some((el: any) => el.id === 'user-name')).toBe(true);
    expect(elements.some((el: any) => el.id === 'password')).toBe(true);
    expect(elements.some((el: any) => el.id === 'login-button')).toBe(true);
  });

  it('executes web flow and generates clean Playwright script via automateplus_run_web', async () => {
    const response = await mcpBridge.handleMcpRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'automateplus_run_web',
        arguments: {
          targetUrl: 'https://www.saucedemo.com/',
          flowPreset: 'saucedemo',
          exportFramework: 'playwright',
          exportLanguage: 'typescript',
        },
      },
    });

    const result = JSON.parse((response.result as any).content[0].text);
    expect(result.status).toBe('passed');
    expect(result.summary.passedSteps).toBeGreaterThanOrEqual(4);
    expect(result.summary.failedSteps).toBe(0);
    expect(Object.keys(result.generatedFiles).length).toBeGreaterThanOrEqual(1);

    const testFile = Object.entries(result.generatedFiles).find(([name]) => name.endsWith('.ts'))?.[1] as string;
    expect(testFile).toBeDefined();
    expect(testFile).toContain(`import { test, expect } from '@playwright/test';`);
    expect(testFile).not.toContain('TO' + 'DO');
  });

  it('executes android flow and generates clean Appium script via automateplus_run_android', async () => {
    const response = await mcpBridge.handleMcpRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'automateplus_run_android',
        arguments: {
          appPackage: 'com.notifplus',
          appActivity: '.MainActivity',
          exportFramework: 'appium',
          exportLanguage: 'typescript',
        },
      },
    });

    const result = JSON.parse((response.result as any).content[0].text);
    expect(result.status).toBe('passed');
    expect(result.summary.passedSteps).toBeGreaterThanOrEqual(3);
    expect(result.summary.failedSteps).toBe(0);

    const testFile = Object.entries(result.generatedFiles).find(([name]) => name.endsWith('.ts'))?.[1] as string;
    expect(testFile).toBeDefined();
    expect(testFile).toContain(`import { remote } from 'webdriverio';`);
    expect(testFile).toContain('UiSelector().resourceId');
  });

  it('executes phone farm multi-device loops via automateplus_run_phone_farm', async () => {
    const response = await mcpBridge.handleMcpRequest({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'automateplus_run_phone_farm',
        arguments: {
          appPackage: 'com.notifplus',
          deviceIds: ['emulator-5554'],
          iterations: 1,
          strategy: 'all-devices',
        },
      },
    });

    const result = JSON.parse((response.result as any).content[0].text);
    expect(result.status).toBe('passed');
    expect(result.totalCompletedIterations).toBe(1);
    expect(result.deviceRuns).toHaveLength(1);
    expect(result.deviceRuns[0].status).toBe('passed');
  });

  it('generates clean runnable test scripts via automateplus_generate_test_script', async () => {
    const response = await mcpBridge.handleMcpRequest({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'automateplus_generate_test_script',
        arguments: {
          platform: 'web',
          framework: 'cypress',
          language: 'typescript',
          targetUrl: 'https://www.saucedemo.com/',
        },
      },
    });

    const result = JSON.parse((response.result as any).content[0].text);
    expect(result.framework).toBe('cypress');
    expect(result.language).toBe('typescript');
    const cypressFile = Object.entries(result.files).find(([name]) => name.endsWith('.ts'))?.[1] as string;
    expect(cypressFile).toBeDefined();
    expect(cypressFile).toContain('cy.visit');
  });

  it('supports resources and prompts endpoints', async () => {
    const resList = await mcpBridge.handleMcpRequest({
      jsonrpc: '2.0',
      id: 8,
      method: 'resources/list',
      params: {},
    });
    expect((resList.result as any).resources).toHaveLength(2);

    const promptList = await mcpBridge.handleMcpRequest({
      jsonrpc: '2.0',
      id: 9,
      method: 'prompts/list',
      params: {},
    });
    expect((promptList.result as any).prompts.length).toBeGreaterThanOrEqual(3);
  });
});
