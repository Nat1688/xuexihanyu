'use strict';
// Real Docker integration test, explicitly invoked on Mac. Never launches API/DB,
// mounts volumes, publishes ports or changes existing containers. Only GET health.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const image = 'clp-oci01b2-web:r3-review';
function docker(args, allowFailure = false) {
  const r = spawnSync('docker', ['--context', 'colima-clp-arm64', ...args], {
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (r.status !== 0) {
    if (allowFailure) return null;
    throw Error('DOCKER_TEST_COMMAND_FAILED'); // don't echo raw env/logs
  }
  return r.stdout.trim();
}
function inspect(kind, id, expression) {
  return JSON.parse(docker([kind, 'inspect', '--format', '{{json ' + expression + '}}', id]));
}
test(
  'real Nginx read-only/nonroot startup, temp paths and proxy to existing healthy API',
  { timeout: 120000 },
  async () => {
    assert.equal(process.env.CLP_R3_TEST_CONFIRMATION, 'NGINX_EPHEMERAL_ONLY');
    assert.match(docker(['info', '--format', '{{.Architecture}}']), /^(aarch64|arm64)$/);
    const api = docker([
      'ps',
      '--filter',
      'label=com.docker.compose.project=clp-local-trial',
      '--filter',
      'label=com.docker.compose.service=api',
      '--format',
      '{{.ID}}',
    ]);
    assert.match(api, /^[a-f0-9]{12,64}$/); // exactly one pre-existing API
    assert.equal(inspect('container', api, '.State.Health.Status'), 'healthy');
    const networks = inspect('container', api, '.NetworkSettings.Networks');
    const frontend = Object.entries(networks).filter(([name]) => {
      const labels = inspect('network', name, '.Labels');
      return (
        labels?.['com.docker.compose.project'] === 'clp-local-trial' &&
        labels?.['com.docker.compose.network'] === 'frontend'
      );
    });
    assert.equal(frontend.length, 1);
    const networkId = frontend[0][1].NetworkID;
    const imageId = JSON.parse(docker(['image', 'inspect', '--format', '{{json .Id}}', image]));
    assert.equal(inspect('image', imageId, '.Architecture'), 'arm64');
    assert.equal(inspect('image', imageId, '.Config.User'), 'nginx');
    let probe;
    try {
      probe = docker([
        'run',
        '-d',
        '--rm',
        '--pull=never',
        '--name',
        'clp-r3-nginx-test-' + randomUUID(),
        '--label',
        'clp.test=OCI01B2-R3',
        '--read-only',
        '--user',
        'nginx',
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,size=64m,mode=1777',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges:true',
        '--memory',
        '128m',
        '--cpus',
        '0.1',
        '--network',
        networkId,
        imageId,
      ]);
      assert.match(probe, /^[a-f0-9]{64}$/);
      const host = inspect('container', probe, '.HostConfig');
      assert.equal(host.ReadonlyRootfs, true);
      assert.equal(host.Privileged, false);
      assert.ok(host.CapDrop.includes('ALL'));
      assert.ok(host.SecurityOpt.some((s) => /^no-new-privileges(?::true)?$/.test(s)));
      assert.ok(host.Tmpfs['/tmp']);
      assert.ok(!host.Binds?.length && !host.Mounts?.length && !host.VolumesFrom?.length);
      assert.ok(!host.PortBindings || Object.keys(host.PortBindings).length === 0);
      assert.equal(host.PublishAllPorts, false);
      assert.equal(inspect('container', probe, '.Config.User'), 'nginx');
      assert.equal(Object.keys(inspect('container', probe, '.NetworkSettings.Networks')).length, 1);
      const get = (route) => {
        const output = docker(
          [
            'exec',
            probe,
            'curl',
            '--fail',
            '--silent',
            '--max-time',
            '3',
            '--write-out',
            '\n%{http_code}',
            'http://127.0.0.1:8080' + route,
          ],
          true,
        );
        return output?.endsWith('\n200') ? output.slice(0, -4) : null;
      };
      let ready;
      for (let i = 0; i < 30; i++) {
        if (get('/proxy-health') === 'ok') {
          const body = get('/api/health/ready');
          if (body) {
            ready = JSON.parse(body);
            if (ready?.dependencies?.database === 'up') break;
          }
        }
        await delay(1000);
      }
      assert.equal(get('/proxy-health'), 'ok');
      assert.equal(ready?.dependencies?.database, 'up');
      const config = docker(['exec', probe, 'cat', '/etc/nginx/nginx.conf']);
      const expected = fs.readFileSync(path.join(__dirname, 'nginx.conf'), 'utf8');
      assert.equal(config.replace(/\r\n/g, '\n'), expected.trim().replace(/\r\n/g, '\n'));
      assert.notEqual(docker(['exec', probe, 'id', '-u']), '0');
      docker([
        'exec',
        probe,
        'sh',
        '-c',
        'test -r /proc/self/status && grep -q "NoNewPrivs:[[:space:]]*1" /proc/self/status && grep -Eq "^CapEff:[[:space:]]*0+$" /proc/self/status',
      ]);
      docker([
        'exec',
        probe,
        'sh',
        '-c',
        'for d in client_temp proxy_temp fastcgi_temp uwsgi_temp scgi_temp; do test -d "/tmp/$d" && test -w "/tmp/$d" || exit 1; done',
      ]);
      assert.equal(inspect('container', api, '.State.Health.Status'), 'healthy');
      console.log(
        JSON.stringify({
          status: 'PASS',
          imageId,
          apiContainer: api,
          nginxConfigSha256: crypto.createHash('sha256').update(config).digest('hex'),
          readonly: true,
          nonroot: true,
          proxyHealth: 200,
          apiReadiness: 200,
          database: 'up',
          note: 'GET health only; no DB provisioning or persistent volume mounts.',
        }),
      );
    } finally {
      // Only this test's freshly created container ID, never existing services/volumes.
      if (probe && /^[a-f0-9]{64}$/.test(probe)) docker(['stop', '--time', '5', probe]);
    }
  },
);
