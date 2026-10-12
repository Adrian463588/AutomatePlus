import React, { useState } from 'react';
import { Bot, Check, Copy, Play, Search, Smartphone, Globe, Code, Layers } from 'lucide-react';
import { mcpBridge, MCP_TOOLS } from '../../services/mcpBridge.js';

export const McpBridgeView: React.FC = () => {
  const [activeToolIndex, setActiveToolIndex] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [executionOutput, setExecutionOutput] = useState<string | null>(null);

  // Form states for tool parameters
  const [targetUrl, setTargetUrl] = useState('https://www.saucedemo.com/');
  const [webPreset, setWebPreset] = useState<'saucedemo' | 'orangehrm'>('saucedemo');
  const [webFramework, setWebFramework] = useState('playwright');
  const [appPackage, setAppPackage] = useState('com.notifplus');
  const [phoneFarmIterations, setPhoneFarmIterations] = useState(3);
  const [genPlatform, setGenPlatform] = useState<'web' | 'android' | 'api'>('web');
  const [genFramework, setGenFramework] = useState('playwright');
  const [genLanguage, setGenLanguage] = useState('typescript');

  const mcpConfigJson = JSON.stringify(
    {
      mcpServers: {
        automateplus: {
          command: 'node',
          args: ['scripts/mcp-server.mjs'],
          description: 'AutomatePlus MCP Server - Web, Android, Phone Farm runner & Universal Script Generator',
        },
      },
    },
    null,
    2,
  );

  const handleCopyConfig = async () => {
    try {
      await navigator.clipboard.writeText(mcpConfigJson);
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleRunTool = async () => {
    setIsExecuting(true);
    setExecutionOutput(null);
    try {
      const activeTool = MCP_TOOLS[activeToolIndex];
      let response: any;

      if (activeTool.name === 'automateplus_inspect_web_elements') {
        response = await mcpBridge.handleMcpRequest({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: activeTool.name,
            arguments: { url: targetUrl },
          },
        });
      } else if (activeTool.name === 'automateplus_run_web') {
        response = await mcpBridge.handleMcpRequest({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: activeTool.name,
            arguments: {
              targetUrl,
              flowPreset: webPreset,
              exportFramework: webFramework,
              exportLanguage: 'typescript',
            },
          },
        });
      } else if (activeTool.name === 'automateplus_run_android') {
        response = await mcpBridge.handleMcpRequest({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: activeTool.name,
            arguments: {
              appPackage,
              appActivity: '.MainActivity',
              exportFramework: 'appium',
              exportLanguage: 'typescript',
            },
          },
        });
      } else if (activeTool.name === 'automateplus_run_phone_farm') {
        response = await mcpBridge.handleMcpRequest({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: activeTool.name,
            arguments: {
              appPackage,
              deviceIds: ['emulator-5554'],
              iterations: phoneFarmIterations,
              strategy: 'all-devices',
            },
          },
        });
      } else if (activeTool.name === 'automateplus_generate_test_script') {
        response = await mcpBridge.handleMcpRequest({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: activeTool.name,
            arguments: {
              platform: genPlatform,
              framework: genFramework,
              language: genLanguage,
              targetUrl,
              appPackage,
            },
          },
        });
      }

      if (response?.result?.content?.[0]?.text) {
        setExecutionOutput(response.result.content[0].text);
      } else {
        setExecutionOutput(JSON.stringify(response, null, 2));
      }
    } catch (err) {
      setExecutionOutput(`Error executing MCP tool: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-950 text-slate-100 flex flex-col gap-6">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-950 border border-cyan-800 rounded text-cyan-400">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wide flex items-center gap-2">
              Model Context Protocol (MCP) Bridge
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 font-mono">
                Active v1.6.0
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Bi-directional AI Agent Bridge for Web Automation, Mobile Appium, Phone Farming & Universal Script Generation.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyConfig}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-xs font-mono text-slate-200 transition tactile-active"
          aria-label="Copy MCP Agent Configuration JSON"
          title={copiedConfig ? 'Agent config copied to clipboard' : 'Copy agent configuration to clipboard'}
        >
          {copiedConfig ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
          <span>{copiedConfig ? 'Config Copied' : 'Copy Agent Config'}</span>
        </button>
      </div>

      {/* Grid: Instructions & Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Server Info & Capabilities */}
        <div className="flex flex-col gap-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded flex flex-col gap-3">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>Protocol & Host Info</span>
            </h2>
            <div className="text-xs text-slate-400 flex flex-col gap-1.5 font-mono">
              <div><span className="text-slate-500">Protocol:</span> JSON-RPC 2.0 (stdio)</div>
              <div><span className="text-slate-500">Version:</span> 2024-11-05</div>
              <div><span className="text-slate-500">Server:</span> automate-plus-mcp</div>
              <div><span className="text-slate-500">Tools:</span> 5 Registered Tools</div>
              <div><span className="text-slate-500">Generators:</span> 27 Matrix Combinations</div>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-800 text-xs text-slate-400">
              Run standalone via CLI:
              <pre className="mt-1 p-2 bg-slate-950 rounded text-[11px] text-cyan-300 overflow-x-auto font-mono">
                node scripts/mcp-server.mjs
              </pre>
            </div>
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded flex flex-col gap-2">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              MCP Tools Catalog
            </h2>
            <div className="flex flex-col gap-1 mt-1">
              {MCP_TOOLS.map((tool, idx) => (
                <button
                  key={tool.name}
                  type="button"
                  onClick={() => setActiveToolIndex(idx)}
                  className={`text-left p-2 rounded text-xs transition flex flex-col gap-0.5 tactile-active ${
                    activeToolIndex === idx
                      ? 'bg-cyan-950 border border-cyan-800 text-cyan-300 font-semibold'
                      : 'hover:bg-slate-800 text-slate-400'
                  }`}
                  aria-label={`Select tool ${tool.name}`}
                  title={tool.description}
                >
                  <span className="font-mono">{tool.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center & Right: Interactive Tool Tester */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-200 font-mono">
                  {MCP_TOOLS[activeToolIndex].name}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {MCP_TOOLS[activeToolIndex].description}
                </p>
              </div>

              <button
                type="button"
                id="mcp-run-tool-button"
                disabled={isExecuting}
                onClick={handleRunTool}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 text-emerald-100 rounded text-xs font-semibold shadow-sm transition tactile-active"
                aria-label={`Execute MCP tool ${MCP_TOOLS[activeToolIndex].name}`}
                title={isExecuting ? 'Executing tool in progress' : `Execute MCP tool ${MCP_TOOLS[activeToolIndex].name}`}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isExecuting ? 'Running…' : 'Execute Tool'}</span>
              </button>
            </div>

            {/* Inputs based on selected tool */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-800">
              {activeToolIndex === 0 && (
                <div className="sm:col-span-2 flex flex-col gap-1">
                  <label htmlFor="inspect-target-url" className="text-xs text-slate-300">Target Web URL</label>
                  <input
                    id="inspect-target-url"
                    type="text"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    className="p-2 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-100"
                    aria-label="Target Web URL"
                  />
                </div>
              )}

              {activeToolIndex === 1 && (
                <>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="web-target-url" className="text-xs text-slate-300">Target URL</label>
                    <input
                      id="web-target-url"
                      type="text"
                      value={targetUrl}
                      onChange={(e) => setTargetUrl(e.target.value)}
                      className="p-2 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-100"
                      aria-label="Target URL"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="web-flow-preset" className="text-xs text-slate-300">Preset Flow</label>
                    <select
                      id="web-flow-preset"
                      value={webPreset}
                      onChange={(e) => {
                        const val = e.target.value as 'saucedemo' | 'orangehrm';
                        setWebPreset(val);
                        setTargetUrl(val === 'saucedemo' ? 'https://www.saucedemo.com/' : 'https://opensource-demo.orangehrmlive.com/');
                      }}
                      className="p-2 bg-slate-950 border border-slate-700 rounded text-xs text-slate-100"
                      aria-label="Preset Flow"
                    >
                      <option value="saucedemo">SauceDemo Swag Labs</option>
                      <option value="orangehrm">OrangeHRM Portal</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="web-export-framework" className="text-xs text-slate-300">Export Script Framework</label>
                    <select
                      id="web-export-framework"
                      value={webFramework}
                      onChange={(e) => setWebFramework(e.target.value)}
                      className="p-2 bg-slate-950 border border-slate-700 rounded text-xs text-slate-100"
                      aria-label="Export Script Framework"
                    >
                      <option value="playwright">Playwright (TypeScript)</option>
                      <option value="cypress">Cypress (TypeScript)</option>
                      <option value="selenium">Selenium WebDriver (TypeScript)</option>
                      <option value="puppeteer">Puppeteer (TypeScript)</option>
                      <option value="robot">Robot Framework (Robot)</option>
                    </select>
                  </div>
                </>
              )}

              {activeToolIndex === 2 && (
                <>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="android-app-package" className="text-xs text-slate-300">App Package</label>
                    <input
                      id="android-app-package"
                      type="text"
                      value={appPackage}
                      onChange={(e) => setAppPackage(e.target.value)}
                      className="p-2 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-100"
                      aria-label="App Package"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="android-framework" className="text-xs text-slate-300">Framework</label>
                    <select
                      id="android-framework"
                      disabled
                      value="appium"
                      className="p-2 bg-slate-950 border border-slate-700 rounded text-xs text-slate-400 opacity-80"
                      aria-label="Framework"
                      title="Appium WDIO TypeScript"
                    >
                      <option value="appium">Appium WDIO (TypeScript)</option>
                    </select>
                  </div>
                </>
              )}

              {activeToolIndex === 3 && (
                <>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="farm-app-package" className="text-xs text-slate-300">Target App Package</label>
                    <input
                      id="farm-app-package"
                      type="text"
                      value={appPackage}
                      onChange={(e) => setAppPackage(e.target.value)}
                      className="p-2 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-100"
                      aria-label="Target App Package"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="farm-iterations" className="text-xs text-slate-300">Loop Iterations</label>
                    <input
                      id="farm-iterations"
                      type="number"
                      min={1}
                      max={10}
                      value={phoneFarmIterations}
                      onChange={(e) => setPhoneFarmIterations(Number(e.target.value) || 1)}
                      className="p-2 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-100"
                      aria-label="Loop Iterations"
                    />
                  </div>
                </>
              )}

              {activeToolIndex === 4 && (
                <>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="gen-platform" className="text-xs text-slate-300">Platform</label>
                    <select
                      id="gen-platform"
                      value={genPlatform}
                      onChange={(e) => {
                        const p = e.target.value as 'web' | 'android' | 'api';
                        setGenPlatform(p);
                        if (p === 'web') setGenFramework('playwright');
                        else if (p === 'android') setGenFramework('appium');
                        else setGenFramework('http');
                      }}
                      className="p-2 bg-slate-950 border border-slate-700 rounded text-xs text-slate-100"
                      aria-label="Platform"
                    >
                      <option value="web">Web</option>
                      <option value="android">Android Mobile</option>
                      <option value="api">API</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="gen-framework" className="text-xs text-slate-300">Framework</label>
                    <select
                      id="gen-framework"
                      value={genFramework}
                      onChange={(e) => setGenFramework(e.target.value)}
                      className="p-2 bg-slate-950 border border-slate-700 rounded text-xs text-slate-100"
                      aria-label="Framework"
                    >
                      {genPlatform === 'web' && (
                        <>
                          <option value="playwright">Playwright</option>
                          <option value="cypress">Cypress</option>
                          <option value="selenium">Selenium WebDriver</option>
                          <option value="puppeteer">Puppeteer</option>
                          <option value="robot">Robot Framework</option>
                        </>
                      )}
                      {genPlatform === 'android' && (
                        <>
                          <option value="appium">Appium</option>
                          <option value="espresso">Espresso</option>
                          <option value="robolectric">Robolectric</option>
                          <option value="maestro">Maestro</option>
                        </>
                      )}
                      {genPlatform === 'api' && (
                        <>
                          <option value="http">HTTP Client</option>
                          <option value="k6">k6 Load Generator</option>
                        </>
                      )}
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Results output panel */}
            <div className="flex flex-col gap-1.5 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Execution & Output Logs</span>
                {executionOutput && (
                  <span className="text-emerald-400 font-mono">Response Received</span>
                )}
              </div>
              <pre
                id="mcp-execution-output"
                className="p-3 bg-slate-950 border border-slate-800 rounded font-mono text-xs text-slate-300 overflow-x-auto max-h-80 select-text"
              >
                {executionOutput || '// Click "Execute Tool" above to test MCP response directly in-app…'}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default McpBridgeView;
