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
    expect((response.result as any).serverInfo.version).toBe('1.7.0');
    expect((response.result as any).protocolVersion).toBe('2024-11-05');
  });

  it('exposes all 11 registered tools in tools/list', async () => {
    const response = await mcpBridge.handleMcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    const tools = (response.result as any).tools;
    expect(tools).toHaveLength(11);
    const toolNames = tools.map((t: any) => t.name);
    expect(toolNames).toContain('run_automation_task');
    expect(toolNames).toContain('inspect_element_context');
    expect(toolNames).toContain('generate_runnable_test_script');
    expect(toolNames).toContain('run_load_test');
    expect(toolNames).toContain('test_web_page');
    expect(toolNames).toContain('automateplus_inspect_web_elements');
    expect(toolNames).toContain('automateplus_run_web');
    expect(toolNames).toContain('automateplus_run_android');
    expect(toolNames).toContain('automateplus_run_phone_farm');
    expect(toolNames).toContain('automateplus_run_k6');
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

  describe('Standard MCP Tools (RFC 2.0)', () => {
    it('executes run_automation_task for web platform', async () => {
      const response = await mcpBridge.handleMcpRequest({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'run_automation_task',
          arguments: {
            platform: 'web',
            task_id: 'task-web-saucedemo-01',
            params: {
              targetUrl: 'https://www.saucedemo.com/',
              flowPreset: 'saucedemo',
              exportFramework: 'playwright',
            },
          },
        },
      });

      const result = JSON.parse((response.result as any).content[0].text);
      expect(result.status).toBe('SUCCESS');
      expect(result.task_id).toBe('task-web-saucedemo-01');
      expect(result.platform).toBe('web');
      expect(result.logs.length).toBeGreaterThan(0);
    });

    it('executes run_automation_task for appium platform', async () => {
      const response = await mcpBridge.handleMcpRequest({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'run_automation_task',
          arguments: {
            platform: 'appium',
            task_id: 'task-appium-01',
            params: {
              appPackage: 'com.notifplus',
              appActivity: '.MainActivity',
              exportFramework: 'appium',
            },
          },
        },
      });

      const result = JSON.parse((response.result as any).content[0].text);
      expect(result.status).toBe('SUCCESS');
      expect(result.platform).toBe('appium');
    });

    it('executes run_automation_task for phone_farming platform', async () => {
      const response = await mcpBridge.handleMcpRequest({
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: {
          name: 'run_automation_task',
          arguments: {
            platform: 'phone_farming',
            task_id: 'task-farm-01',
            params: {
              appPackage: 'com.notifplus',
              deviceIds: ['emulator-5554'],
              iterations: 1,
            },
          },
        },
      });

      const result = JSON.parse((response.result as any).content[0].text);
      expect(result.status).toBe('SUCCESS');
      expect(result.platform).toBe('phone_farming');
    });

    it('executes run_automation_task for k6 load test platform', async () => {
      const response = await mcpBridge.handleMcpRequest({
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/call',
        params: {
          name: 'run_automation_task',
          arguments: {
            platform: 'k6',
            task_id: 'task-k6-load-01',
            params: {
              targetUrl: 'https://api.example.com',
              duration: '10s',
              targetRps: 100,
            },
          },
        },
      });

      const result = JSON.parse((response.result as any).content[0].text);
      expect(result.status).toBe('SUCCESS');
      expect(result.platform).toBe('k6');
      expect(result.summary.generator).toBe('k6');
      expect(result.generatedFiles).toBeDefined();
    });

    it('inspects DOM elements via inspect_element_context for web', async () => {
      const response = await mcpBridge.handleMcpRequest({
        jsonrpc: '2.0',
        id: 14,
        method: 'tools/call',
        params: {
          name: 'inspect_element_context',
          arguments: {
            platform: 'web',
            url: 'https://www.saucedemo.com/',
          },
        },
      });

      const elements = JSON.parse((response.result as any).content[0].text);
      expect(Array.isArray(elements)).toBe(true);
      expect(elements.length).toBeGreaterThanOrEqual(4);
      expect(elements.some((el: any) => el.id === 'user-name')).toBe(true);
      expect(elements.some((el: any) => el.id === 'password')).toBe(true);
    });

    it('inspects Android UI hierarchy via inspect_element_context for android', async () => {
      const response = await mcpBridge.handleMcpRequest({
        jsonrpc: '2.0',
        id: 15,
        method: 'tools/call',
        params: {
          name: 'inspect_element_context',
          arguments: {
            platform: 'android',
          },
        },
      });

      const elements = JSON.parse((response.result as any).content[0].text);
      expect(Array.isArray(elements)).toBe(true);
      expect(elements.length).toBeGreaterThanOrEqual(3);
      expect(elements.some((el: any) => el.resourceId?.includes('btn_start'))).toBe(true);
    });

    it('generates runnable Playwright test script via generate_runnable_test_script', async () => {
      const response = await mcpBridge.handleMcpRequest({
        jsonrpc: '2.0',
        id: 16,
        method: 'tools/call',
        params: {
          name: 'generate_runnable_test_script',
          arguments: {
            session_id: 'session-pw-test-01',
            framework: 'playwright',
            target_scenario: 'saucedemo-checkout',
          },
        },
      });

      const result = JSON.parse((response.result as any).content[0].text);
      expect(result.framework).toBe('playwright');
      expect(result.status).toBe('SUCCESS');
      const testFile = Object.entries(result.files).find(([name]) => name.endsWith('.ts'))?.[1] as string;
      expect(testFile).toBeDefined();
      expect(testFile).toContain(`import { test, expect } from '@playwright/test';`);
      expect(testFile).not.toContain('TO' + 'DO');
    });

    it('generates runnable k6 load test script via generate_runnable_test_script', async () => {
      const response = await mcpBridge.handleMcpRequest({
        jsonrpc: '2.0',
        id: 17,
        method: 'tools/call',
        params: {
          name: 'generate_runnable_test_script',
          arguments: {
            session_id: 'session-k6-test-01',
            framework: 'k6',
            target_scenario: 'api-load-test',
          },
        },
      });

      const result = JSON.parse((response.result as any).content[0].text);
      expect(result.framework).toBe('k6');
      expect(result.status).toBe('SUCCESS');
      const k6File = Object.entries(result.files).find(([name]) => name.endsWith('.js'))?.[1] as string;
      expect(k6File).toBeDefined();
      expect(k6File).toContain(`import http from 'k6/http';`);
      expect(k6File).not.toContain('TO' + 'DO');
    });

    it('executes k6 load test via dedicated run_load_test tool', async () => {
      const response = await mcpBridge.handleMcpRequest({
        jsonrpc: '2.0',
        id: 18,
        method: 'tools/call',
        params: {
          name: 'run_load_test',
          arguments: {
            targetUrl: 'https://reqres.in/api/users',
            targetRps: 50,
            durationSeconds: 5,
            maxVUs: 10,
          },
        },
      });

      const result = JSON.parse((response.result as any).content[0].text);
      expect(result.status).toBe('SUCCESS');
      expect(result.summary.generator).toBe('k6');
      expect(result.summary.achievedRps).toBe(50);
      expect(result.generatedFiles).toBeDefined();
      const script = Object.values(result.generatedFiles)[0] as string;
      expect(script).toContain('k6/http');
    });

    it('executes web testing journey via dedicated test_web_page tool', async () => {
      const response = await mcpBridge.handleMcpRequest({
        jsonrpc: '2.0',
        id: 19,
        method: 'tools/call',
        params: {
          name: 'test_web_page',
          arguments: {
            url: 'https://www.saucedemo.com/',
            flowPreset: 'saucedemo',
            exportFramework: 'playwright',
          },
        },
      });

      const result = JSON.parse((response.result as any).content[0].text);
      expect(result.status).toBe('SUCCESS');
      expect(result.platform).toBe('web');
      expect(result.summary.passedSteps).toBeGreaterThanOrEqual(4);
      const pwFile = Object.values(result.generatedFiles)[0] as string;
      expect(pwFile).toContain('@playwright/test');
    });

    it('executes k6 load test via automateplus_run_k6 legacy alias', async () => {
      const response = await mcpBridge.handleMcpRequest({
        jsonrpc: '2.0',
        id: 20,
        method: 'tools/call',
        params: {
          name: 'automateplus_run_k6',
          arguments: {
            targetUrl: 'https://reqres.in/api/users',
            targetRps: 20,
            durationSeconds: 5,
            maxVUs: 5,
          },
        },
      });

      const result = JSON.parse((response.result as any).content[0].text);
      expect(result.status).toBe('passed');
      expect(result.summary.generator).toBe('k6');
    });
  });
});
