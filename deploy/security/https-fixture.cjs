// Disposable test transport only. Never used by application/runtime packaging.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const cp = require('node:child_process');
const { pathToFileURL } = require('node:url');
module.exports = async function ({ app, vite, owned, logger }) {
  assert.equal(process.env.SEC01_ACCEPTANCE, 'RUN_ON_APPROVED_DISPOSABLE');
  const origin = 'https://127.0.0.1:5210';
  await new Promise((resolve, reject) => {
    const check = net.createServer();
    check.once('error', reject);
    check.listen(5210, '127.0.0.1', () => check.close(resolve));
  });
  const keyPath = path.join(owned, 'tls-private.key');
  const certPath = path.join(owned, 'tls-certificate.pem');
  const configPath = path.join(owned, 'tls-test.cnf');
  assert.ok(!fs.existsSync(keyPath) && !fs.existsSync(certPath));
  fs.writeFileSync(
    configPath,
    '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=IP:127.0.0.1,DNS:localhost\n',
    { flag: 'wx' },
  );
  const cert = cp.spawnSync(
    'C:/Program Files/Git/usr/bin/openssl.exe',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-config',
      configPath,
      '-keyout',
      keyPath,
      '-out',
      certPath,
    ],
    { windowsHide: true, stdio: 'ignore', timeout: 30000 },
  );
  assert.equal(cert.status, 0, 'TEMPORARY_CERTIFICATE_GENERATION_FAILED');
  let replacement, frontend, proxy;
  try {
    await app.close();
    await new Promise((resolve) => {
      if (vite.exitCode !== null) return resolve();
      vite.once('exit', resolve);
      vite.kill();
    });
    process.env.SPA_ORIGIN = origin;
    process.env.VITE_API_BASE_URL = '/api';
    assert.equal(process.env.NODE_ENV, 'test'); // Existing Secure-cookie policy stays intact.
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require('../../apps/api/dist/src/app.module.js');
    replacement = await NestFactory.create(AppModule, { logger });
    await replacement.listen(3116, '127.0.0.1');
    const viteModule = await import(
      pathToFileURL(path.resolve(__dirname, '../../node_modules/vite/dist/node/index.js')).href
    );
    frontend = await viteModule.createServer({
      root: path.resolve(__dirname, '../../apps/web'),
      server: { host: '127.0.0.1', port: 5206, strictPort: true, hmr: false },
    });
    await frontend.listen();
    proxy = https.createServer(
      { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
      (request, response) => {
        const api = request.url.startsWith('/api/');
        const upstream = http.request(
          {
            hostname: '127.0.0.1',
            port: api ? 3116 : 5206,
            path: api ? request.url.slice(4) : request.url,
            method: request.method,
            headers: request.headers,
          },
          (incoming) => {
            response.writeHead(incoming.statusCode, incoming.headers);
            incoming.pipe(response);
          },
        );
        upstream.on('error', () => {
          response.writeHead(502);
          response.end();
        });
        request.pipe(upstream);
      },
    );
    await new Promise((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(5210, '127.0.0.1', resolve);
    });
    return {
      origin,
      async close() {
        await new Promise((resolve) => proxy.close(resolve));
        await frontend.close();
        await replacement.close();
      },
    };
  } catch (error) {
    if (proxy) await new Promise((resolve) => proxy.close(resolve));
    if (frontend) await frontend.close();
    if (replacement) await replacement.close();
    throw error;
  }
};
