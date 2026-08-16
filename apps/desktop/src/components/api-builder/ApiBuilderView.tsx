import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore.js';
import {
  Send,
  Plus,
  Trash2,
  CheckCircle2,
  Server,
  ShieldCheck,
} from 'lucide-react';

export const ApiBuilderView: React.FC = () => {
  const { activeSession, addStep } = useAppStore();

  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>('POST');
  const [url, setUrl] = useState(
    activeSession?.ir.targetConfig.baseUrl
      ? `${activeSession.ir.targetConfig.baseUrl}/v1/auth/login`
      : 'https://api.example.com/v1/auth/login'
  );
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>([
    { key: 'Content-Type', value: 'application/json' },
  ]);
  const [bodyContent, setBodyContent] = useState(
    JSON.stringify({ email: 'user@example.com', password: 'secretpassword' }, null, 2)
  );
  const [activeTab, setActiveTab] = useState<'body' | 'headers' | 'assertions' | 'extract'>('body');
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [isSending, setIsSending] = useState(false);

  const handleAddHeader = () => {
    setHeaders([...headers, { key: '', value: '' }]);
  };

  const handleRemoveHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
  };

  const handleSendAndRecord = async () => {
    setIsSending(true);
    // Simulate HTTP execution
    await new Promise((resolve) => setTimeout(resolve, 150));

    const simulatedResponse = {
      status: 200,
      statusText: 'OK',
      durationMs: 45,
      data: {
        token: 'eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: { id: 101, email: 'user@example.com', role: 'admin' },
      },
    };
    setLastResponse(simulatedResponse);
    setIsSending(false);

    // Append to test session steps
    const headersMap: Record<string, string> = {};
    headers.forEach((h) => {
      if (h.key) headersMap[h.key] = h.value;
    });

    addStep({
      id: crypto.randomUUID(),
      schemaVersion: 1,
      stepNumber: (activeSession?.ir.steps.length ?? 0) + 1,
      platform: 'api',
      action: 'httpRequest',
      apiPayload: {
        method,
        url,
        headers: headersMap,
        queryParams: {},
        bodyType: 'json',
        bodyContent,
        extractedVariables: [{ variableName: 'AUTH_TOKEN', jsonPath: '$.token' }],
      },
      timeoutMs: 5000,
      timestamp: Date.now(),
      optional: false,
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950/60 text-xs overflow-hidden select-none border-r border-slate-800">
      {/* Top Request Bar */}
      <div className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center gap-3">
        <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-md p-1">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as any)}
            className="bg-transparent font-bold text-xs text-amber-400 focus:outline-none px-2 cursor-pointer"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>

        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-indigo-500"
          placeholder="https://api.example.com/..."
        />

        <button
          onClick={handleSendAndRecord}
          disabled={isSending}
          className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-md shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{isSending ? 'Sending...' : 'Send & Record'}</span>
        </button>
      </div>

      {/* Main Split: Builder Tabs (Left) + Response Viewer (Right) */}
      <div className="flex-1 flex min-h-0">
        {/* Request Configuration Section */}
        <div className="flex-1 flex flex-col border-r border-slate-800">
          {/* Subtabs */}
          <div className="h-9 bg-slate-900/80 border-b border-slate-800 px-3 flex items-center gap-1">
            <button
              onClick={() => setActiveTab('body')}
              className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                activeTab === 'body' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Body (JSON)
            </button>
            <button
              onClick={() => setActiveTab('headers')}
              className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                activeTab === 'headers' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Headers ({headers.length})
            </button>
            <button
              onClick={() => setActiveTab('assertions')}
              className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                activeTab === 'assertions' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Assertions
            </button>
          </div>

          {/* Subtab Content */}
          <div className="flex-1 p-3 overflow-auto bg-slate-950">
            {activeTab === 'body' && (
              <textarea
                value={bodyContent}
                onChange={(e) => setBodyContent(e.target.value)}
                className="w-full h-full bg-slate-900 text-slate-200 font-mono text-[11px] p-3 rounded border border-slate-800 focus:outline-none focus:border-indigo-500 resize-none"
              />
            )}

            {activeTab === 'headers' && (
              <div className="space-y-2">
                {headers.map((header, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Header Name (e.g. Authorization)"
                      value={header.key}
                      onChange={(e) => {
                        const newHeaders = [...headers];
                        newHeaders[index].key = e.target.value;
                        setHeaders(newHeaders);
                      }}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white font-mono"
                    />
                    <input
                      type="text"
                      placeholder="Header Value"
                      value={header.value}
                      onChange={(e) => {
                        const newHeaders = [...headers];
                        newHeaders[index].value = e.target.value;
                        setHeaders(newHeaders);
                      }}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white font-mono"
                    />
                    <button
                      onClick={() => handleRemoveHeader(index)}
                      className="p-1 text-slate-500 hover:text-rose-400 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={handleAddHeader}
                  className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Header
                </button>
              </div>
            )}

            {activeTab === 'assertions' && (
              <div className="space-y-2">
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="font-semibold text-white">Status Code is 200 OK</span>
                  </div>
                  <span className="text-[10px] bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded font-mono">
                    200
                  </span>
                </div>
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    <span className="font-semibold text-white">JSONPath: $.token exists</span>
                  </div>
                  <span className="text-[10px] bg-indigo-950 text-indigo-400 px-1.5 py-0.5 rounded font-mono">
                    String
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Response Viewer Section */}
        <div className="w-1/2 flex flex-col bg-slate-950">
          <div className="h-9 bg-slate-900/80 border-b border-slate-800 px-4 flex items-center justify-between">
            <span className="font-semibold text-slate-300">Live Response</span>
            {lastResponse && (
              <div className="flex items-center gap-3 font-mono text-[11px]">
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {lastResponse.status} {lastResponse.statusText}
                </span>
                <span className="text-slate-400">{lastResponse.durationMs}ms</span>
              </div>
            )}
          </div>

          <div className="flex-1 p-3 overflow-auto font-mono text-[11px] text-slate-200">
            {lastResponse ? (
              <pre className="m-0 bg-slate-900 p-3 rounded border border-slate-800 overflow-auto">
                <code>{JSON.stringify(lastResponse.data, null, 2)}</code>
              </pre>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-1">
                <Server className="w-6 h-6 text-slate-700" />
                <p>No response yet. Click &quot;Send &amp; Record&quot; to test endpoint.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
