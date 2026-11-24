import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { availableParallelism, cpus } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const cli = join(root, 'packages/tinyjs/bin/tinyjs.js');
const example = join(root, 'examples/devtools');
const rounds = 3;
const scenarios = [{ requests: 400, concurrency: 1 }, { requests: 1200, concurrency: 8 }];
const paths = ['/', '/api/products/field-notes'];

async function server<T>(devtools: boolean, measure: (url: string) => Promise<T>): Promise<T> {
  const args = [cli, 'dev', '--port', '0'];
  if (!devtools) args.push('--no-devtools');
  const child = spawn(process.execPath, args, { cwd: example, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let logs = '';
  try {
    const url = await new Promise<string>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Server did not start:\n${logs}`)), 20_000);
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`Server exited with ${code}:\n${logs}`)));
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => { logs = (logs + chunk).slice(-8192); });
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        logs = (logs + chunk).slice(-8192);
        const address = /TinyJS listening on (http:\/\/127\.0\.0\.1:\d+)\r?\n/.exec(logs);
        if (address) resolve(address[1]);
      });
    });
    clearTimeout(timer);
    return await measure(url);
  } finally {
    clearTimeout(timer);
    if (child.pid && child.exitCode === null && child.signalCode === null) child.kill();
    await closed.catch(() => {});
  }
}

function percentile(values: number[], fraction: number) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

async function throughput(url: string, requests: number, concurrency: number) {
  let next = 0;
  const timings: number[] = [];
  const started = performance.now();

  async function worker() {
    while (next < requests) {
      const path = paths[next++ % paths.length];
      const sent = performance.now();
      const response = await fetch(url + path, { signal: AbortSignal.timeout(10_000) });
      if (response.status !== 200) throw new Error(`${path} returned HTTP ${response.status}`);
      await response.arrayBuffer();
      timings.push(performance.now() - sent);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return {
    requestsPerSecond: requests * 1000 / (performance.now() - started),
    p50Ms: percentile(timings, 0.5),
    p95Ms: percentile(timings, 0.95),
  };
}

const results = [];
for (const { concurrency, requests } of scenarios) {
  for (let round = 0; round < rounds; round++) {
    // Alternate run order to reduce startup and thermal bias.
    for (const devtools of round % 2 ? [true, false] : [false, true]) {
      const measurements = await server(devtools, async url => {
        await throughput(url, 160, concurrency);
        return throughput(url, requests, concurrency);
      });
      results.push({ concurrency, requests, round: round + 1, devtools, ...measurements });
    }
  }
}

const rounded = (value: number) => Number(value.toFixed(2));
const run = results.map(result => ({
  ...result,
  requestsPerSecond: rounded(result.requestsPerSecond),
  p50Ms: rounded(result.p50Ms),
  p95Ms: rounded(result.p95Ms),
}));
const medians = scenarios.flatMap(({ concurrency }) => [false, true].map(devtools => {
  const selected = results.filter(result => result.concurrency === concurrency && result.devtools === devtools);
  return {
    concurrency,
    devtools,
    requestsPerSecond: rounded(percentile(selected.map(result => result.requestsPerSecond), 0.5)),
    p50Ms: rounded(percentile(selected.map(result => result.p50Ms), 0.5)),
    p95Ms: rounded(percentile(selected.map(result => result.p95Ms), 0.5)),
  };
}));

console.log(JSON.stringify({
  runtime: `Bun ${Bun.version}`,
  platform: `${process.platform} ${process.arch}`,
  cpu: cpus()[0]?.model,
  logicalProcessors: availableParallelism(),
  dashboardConnected: false,
  paths,
  run,
  medians,
}, null, 2));
