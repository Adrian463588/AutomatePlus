import { createServer } from 'node:http';
import { K6StressRunner } from '../packages/stress-engine/dist/index.js';

const server = createServer((_request, response) => {
  const body = JSON.stringify({ healthy: true });
  response.writeHead(200, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

try {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture did not expose a TCP port');

  const session = {
    id: '00000000-0000-4000-8000-000000000001',
    projectId: '00000000-0000-4000-8000-000000000002',
    name: 'Local k6 fixture',
    platform: 'api',
    targetConfig: {},
    environmentVariables: {},
    steps: [
      {
        id: '00000000-0000-4000-8000-000000000003',
        stepNumber: 1,
        platform: 'api',
        action: 'httpRequest',
        apiPayload: {
          method: 'GET',
          url: `http://127.0.0.1:${address.port}/health`,
          headers: {},
          queryParams: {},
          bodyType: 'none',
          extractedVariables: [],
        },
        timeoutMs: 5_000,
        timestamp: 1,
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  };

  const runner = new K6StressRunner();
  const metrics = await runner.runStressTest(
    session,
    { targetRps: 5, durationSeconds: 1, maxVUs: 5 },
    (event) => {
      if (event.type === 'stderr') process.stderr.write(`${event.message}\n`);
    },
  );

  if (metrics.totalRequests <= 0 || metrics.actualRps <= 0 || metrics.errorRate > 0) {
    throw new Error(`Unexpected k6 fixture metrics: ${JSON.stringify(metrics)}`);
  }
  process.stdout.write(`${JSON.stringify(metrics)}\n`);
} finally {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
