'use strict';
async function main() {
  const response = await fetch('http://127.0.0.1:3000/health/ready', {
    signal: AbortSignal.timeout(4000),
  });
  const body = await response.json();
  if (response.status !== 200 || body.status !== 'ok' || body.dependencies?.database !== 'up')
    throw Error('NOT_READY');
}
main().catch(() => {
  process.exitCode = 1;
});
