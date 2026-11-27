#!/usr/bin/env python3
"""XueXiHanyu homelab release tool. Runs ON the homelab host (python3 stdlib + docker).

Usage:  python3 release.py <command> <release-dir> [options]

Commands (run in this order; each refuses to continue on any unexpected state):
  preflight  Record the running baseline, verify schema/migration parity (read-only SELECT).
  build      Build api + web images from <release-dir>/src (never uses previous images as base).
  stage      Run candidate images in throwaway containers on 127.0.0.1 and verify them.
  rollout    Switch running api/web to the candidates; automatic rollback on failed health.
  verify     Re-run post-rollout checks against the live containers.
  rollback   Restore the images recorded in rollout.json (pinned rollback tags).

Never: runs migrations, touches the db service, edits env/secret files, deletes images.
"""
import hashlib, json, os, pathlib, re, subprocess, sys, tempfile, time, urllib.error, urllib.request

PROJECT = 'clp-homelab'
BASE = pathlib.Path('/home/nam/apps/xuexihanyu-releases')
LIVE_WEB_PORT = 8083          # existing 127.0.0.1 binding of the web service
STAGE_WEB_PORT = 18084
STAGE_API_PORT = 18085
SERVICES = ('web', 'api', 'db')
os.umask(0o077)


class Stop(Exception):
    pass


def log(msg):
    print(time.strftime('%H:%M:%S'), msg, flush=True)


def run(args, timeout=300, check=True, **kw):
    p = subprocess.run(args, capture_output=True, timeout=timeout, **kw)
    if check and p.returncode:
        raise Stop('COMMAND_FAILED: %s\n%s' % (' '.join(args[:4]), p.stderr.decode(errors='replace')[-2000:]))
    return p.stdout


def jrun(args, **kw):
    return json.loads(run(args, **kw))


def sha(data):
    return hashlib.sha256(data).hexdigest()


def inspect(service):
    return jrun(['docker', 'inspect', '%s-%s-1' % (PROJECT, service)])[0]


def stamp(c):
    cfg = dict(c['Config'])
    return {'container': c['Id'], 'imageId': c['Image'], 'imageRef': cfg['Image'],
            'configDigest': sha(json.dumps(cfg, sort_keys=True).encode()),
            'mountsDigest': sha(json.dumps(c['Mounts'], sort_keys=True).encode()),
            'health': c['State'].get('Health', {}).get('Status')}


def snapshot():
    return {s: stamp(inspect(s)) for s in SERVICES}


def compose_cmd():
    labels = inspect('web')['Config']['Labels']
    assert labels['com.docker.compose.project'] == PROJECT, 'WRONG_PROJECT'
    cmd = ['docker', 'compose', '-p', PROJECT]
    env_file = labels.get('com.docker.compose.project.environment_file')
    if env_file:
        cmd += ['--env-file', env_file]
    files = labels['com.docker.compose.project.config_files'].split(',')
    for f in files:
        if not pathlib.Path(f).is_file():
            raise Stop('COMPOSE_FILE_MISSING: ' + f)
        cmd += ['-f', f]
    return cmd, files


def http(url, timeout=10):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


def release_dir(arg):
    root = pathlib.Path(arg).resolve()
    if root.parent != BASE or not re.fullmatch(r'[a-z0-9][a-z0-9.-]{3,80}', root.name):
        raise Stop('RELEASE_DIR_MUST_BE_UNDER_%s' % BASE)
    if not (root / 'src' / 'RELEASE-SOURCE.json').is_file():
        raise Stop('MISSING src/RELEASE-SOURCE.json (ship the release with deploy/homelab/ship.sh)')
    return root


def read(root, name):
    p = root / name
    if not p.is_file():
        raise Stop('MISSING_RECEIPT: ' + name + ' (run the previous phase first)')
    return json.loads(p.read_text())


def write(root, name, data):
    (root / name).write_text(json.dumps(data, indent=2) + '\n')
    log('wrote ' + str(root / name))


def applied_migrations():
    out = run(['docker', 'exec', '%s-db-1' % PROJECT, 'sh', '-c',
               'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c '
               '"SET default_transaction_read_only = on; SELECT migration_name FROM _prisma_migrations '
               'WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name"'])
    return [l for l in out.decode().split('\n') if l]


def source_migrations(root):
    d = root / 'src' / 'prisma' / 'migrations'
    return sorted(p.name for p in d.iterdir() if p.is_dir())


# ---------------------------------------------------------------- phases
def preflight(root, opts):
    src = read(root / 'src', 'RELEASE-SOURCE.json')
    snap = snapshot()
    for s in SERVICES:
        if s != 'db' and snap[s]['health'] != 'healthy':
            raise Stop('BASELINE_UNHEALTHY: ' + s)
    for key, svc in (('--expect-web', 'web'), ('--expect-api', 'api')):
        if opts.get(key) and opts[key] != snap[svc]['imageId']:
            raise Stop('BASELINE_CHANGED: %s running %s, expected %s' % (svc, snap[svc]['imageId'], opts[key]))
    web = inspect('web')
    if web['Config'].get('User') != 'nginx' or not web['HostConfig'].get('ReadonlyRootfs'):
        raise Stop('WEB_HARDENING_CHANGED')
    db, repo = applied_migrations(), source_migrations(root)
    missing, unknown = [m for m in repo if m not in db], [m for m in db if m not in repo]
    if unknown:
        raise Stop('SOURCE_BEHIND_DATABASE: applied migrations absent from source: %s' % unknown)
    if missing:
        raise Stop('MIGRATION_REQUIRED: %s. This tool never migrates. Get explicit Owner approval, '
                   'take and verify a backup, and run the migrate image separately.' % missing)
    cmd, files = compose_cmd()
    config = jrun(cmd + ['config', '--format', 'json'])
    status, _, body = http('http://127.0.0.1:%d/api/health/ready' % LIVE_WEB_PORT)
    if status != 200 or json.loads(body)['dependencies']['database'] != 'up':
        raise Stop('LIVE_NOT_READY')
    write(root, 'preflight.json', {'status': 'PREFLIGHT_PASS', 'at': time.time(), 'source': src,
                                   'snapshot': snap, 'composeFiles': files,
                                   'composeConfigDigest': sha(json.dumps(config, sort_keys=True).encode()),
                                   'migrations': db})
    log('PREFLIGHT_PASS web=%s api=%s migrations=%d' % (snap['web']['imageId'][:19], snap['api']['imageId'][:19], len(db)))


def build(root, opts):
    read(root, 'preflight.json')
    src = root / 'src'
    images = {}
    for role, dockerfile, target in (('api', 'api.Dockerfile', 'runtime'), ('web', 'web.Dockerfile', 'runtime')):
        tag = 'xuexihanyu-%s:%s' % (role, root.name)
        log('building ' + tag)
        with (root / ('build-%s.log' % role)).open('wb') as fh:
            # No --pull: base images resolve from the host cache first; their IDs are recorded below.
            p = subprocess.run(['docker', 'build', '--platform', 'linux/amd64', '--target', target,
                                '-f', 'deploy/oci01b2/' + dockerfile, '-t', tag, '.'],
                               cwd=src, stdout=fh, stderr=subprocess.STDOUT, timeout=2400)
        if p.returncode:
            raise Stop('BUILD_FAILED_%s (see build-%s.log)' % (role, role))
        img = jrun(['docker', 'image', 'inspect', tag])[0]
        if img['Architecture'] != 'amd64' or img['Config'].get('User') != {'api': 'node', 'web': 'nginx'}[role]:
            raise Stop('IMAGE_AUDIT_FAILED_' + role)
        images[role] = {'tag': tag, 'id': img['Id']}
    # Web asset manifest straight from the built image.
    listing = run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'sh', images['web']['id'], '-c',
                   'cd /usr/share/nginx/html && find . -type f | sort | xargs sha256sum'])
    manifest = [{'path': l[66:].lstrip('./').strip(), 'sha256': l[:64]} for l in listing.decode().splitlines() if l]
    if not any(m['path'] == 'index.html' for m in manifest):
        raise Stop('WEB_IMAGE_HAS_NO_INDEX')
    leaked = run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'sh', images['api']['id'], '-c',
                  'find / -xdev -name ".env*" -not -path "/proc/*" 2>/dev/null | head -5'])
    if leaked.strip():
        raise Stop('API_IMAGE_CONTAINS_ENV_FILE')
    bases = {}
    for ref in ('node:22-bookworm-slim', 'nginx:stable-bookworm'):
        p = subprocess.run(['docker', 'image', 'inspect', '--format', '{{.Id}} {{json .RepoDigests}}', ref], capture_output=True)
        bases[ref] = p.stdout.decode().strip()
    write(root, 'build.json', {'status': 'BUILD_PASS', 'images': images, 'baseImages': bases, 'webManifest': manifest})
    log('BUILD_PASS api=%s web=%s assets=%d' % (images['api']['id'][:19], images['web']['id'][:19], len(manifest)))


def verify_web(port, manifest):
    for f in manifest:
        status, _, body = http('http://127.0.0.1:%d/%s' % (port, f['path']))
        if status != 200 or sha(body) != f['sha256']:
            raise Stop('ASSET_MISMATCH: ' + f['path'])
    status, _, body = http('http://127.0.0.1:%d/api/health/ready' % port)
    if status != 200 or json.loads(body)['dependencies']['database'] != 'up':
        raise Stop('READY_THROUGH_WEB_FAILED')
    status, headers, _ = http('http://127.0.0.1:%d/api/auth/me' % port)
    if status != 401 or 'application/json' not in (headers.get('content-type') or ''):
        raise Stop('ANONYMOUS_SESSION_BOUNDARY_FAILED')
    status, headers, _ = http('http://127.0.0.1:%d/api/dictionary/admin/categories' % port)
    if status != 401:
        raise Stop('DICTIONARY_CATEGORIES_ROUTE_FAILED: %s' % status)


def stage(root, opts):
    pre, b = read(root, 'preflight.json'), read(root, 'build.json')
    if snapshot() != pre['snapshot']:
        raise Stop('RUNTIME_CHANGED_SINCE_PREFLIGHT')
    api, web = inspect('api'), inspect('web')
    names = {'api': 'clp-stage-api-' + root.name, 'web': 'clp-stage-web-' + root.name}
    env_fd, env_path = tempfile.mkstemp(prefix='clp-stage-', dir='/dev/shm')
    try:
        with os.fdopen(env_fd, 'w') as fh:     # secrets never appear on a command line
            fh.write('\n'.join(api['Config'].get('Env') or []) + '\n')
        nets = sorted(api['NetworkSettings']['Networks'])
        args = ['docker', 'run', '-d', '--name', names['api'], '--read-only', '--tmpfs', '/tmp', '--cap-drop=ALL',
                '--security-opt', 'no-new-privileges:true', '--init', '--env-file', env_path,
                '--network', nets[0], '-p', '127.0.0.1:%d:3000' % STAGE_API_PORT, b['images']['api']['id']]
        run(args)
        for n in nets[1:]:
            run(['docker', 'network', 'connect', n, names['api']])
    finally:
        os.unlink(env_path)
    try:
        for _ in range(60):
            try:
                status, _, body = http('http://127.0.0.1:%d/health/ready' % STAGE_API_PORT, timeout=3)
                if status == 200 and json.loads(body)['dependencies']['database'] == 'up':
                    break
            except (OSError, ValueError, KeyError):
                pass
            time.sleep(2)
        else:
            raise Stop('STAGE_API_NOT_READY (docker logs %s)' % names['api'])
        status, headers, _ = http('http://127.0.0.1:%d/auth/me' % STAGE_API_PORT)
        if status != 401:
            raise Stop('STAGE_API_SESSION_BOUNDARY_FAILED')
        # Candidate web proxies to the LIVE api (service name "api"); stage api is not aliased.
        wargs = ['docker', 'run', '-d', '--name', names['web'], '--read-only', '--cap-drop=ALL',
                 '--security-opt', 'no-new-privileges:true', '--network', sorted(web['NetworkSettings']['Networks'])[0],
                 '-p', '127.0.0.1:%d:8080' % STAGE_WEB_PORT]
        for mount, o in (web['HostConfig'].get('Tmpfs') or {'/tmp': ''}).items():
            wargs += ['--tmpfs', mount + (':' + o if o else '')]
        run(wargs + [b['images']['web']['id']])
        for _ in range(30):
            try:
                verify_web(STAGE_WEB_PORT, b['webManifest'])
                break
            except (Stop, OSError, ValueError) as e:
                last = e
                time.sleep(2)
        else:
            raise Stop('STAGE_WEB_FAILED: %s' % last)
    finally:
        for n in names.values():
            subprocess.run(['docker', 'rm', '-f', n], capture_output=True)
    if snapshot() != pre['snapshot']:
        raise Stop('RUNTIME_CHANGED_DURING_STAGE')
    write(root, 'stage.json', {'status': 'STAGE_PASS', 'assets': len(b['webManifest'])})
    log('STAGE_PASS')


def wait_healthy(service, image_id):
    for _ in range(90):
        c = inspect(service)
        if c['Image'] == image_id and c['State'].get('Health', {}).get('Status') == 'healthy':
            return c
        if c['State']['Status'] in ('exited', 'dead'):
            raise Stop(service.upper() + '_START_FAILED')
        time.sleep(2)
    raise Stop(service.upper() + '_HEALTH_TIMEOUT')


def rollout(root, opts):
    pre, b, _ = read(root, 'preflight.json'), read(root, 'build.json'), read(root, 'stage.json')
    services = opts.get('--services', 'api,web').split(',')
    if not set(services) <= {'api', 'web'} or not services:
        raise Stop('BAD_SERVICES')
    if snapshot() != pre['snapshot']:
        raise Stop('RUNTIME_CHANGED_SINCE_PREFLIGHT')
    if (root / 'rollout.override.yaml').exists():
        raise Stop('ALREADY_ROLLED_OUT_FROM_THIS_RELEASE_DIR')
    cmd, files = compose_cmd()
    before = jrun(cmd + ['config', '--format', 'json'])
    rollback_tags = {}
    for s in ('api', 'web'):
        tag = 'xuexihanyu-%s:rollback-%s' % (s, root.name)
        run(['docker', 'tag', pre['snapshot'][s]['imageId'], tag])
        rollback_tags[s] = tag
    new = {s: (b['images'][s]['tag'] if s in services else pre['snapshot'][s]['imageRef']) for s in ('api', 'web')}
    fwd, back = root / 'rollout.override.yaml', root / 'rollback.override.yaml'
    fwd.write_text('services:\n' + ''.join('  %s:\n    image: %s\n' % (s, new[s]) for s in ('api', 'web')))
    back.write_text('services:\n' + ''.join('  %s:\n    image: %s\n' % (s, rollback_tags[s]) for s in ('api', 'web')))
    after = jrun(cmd + ['-f', str(fwd), 'config', '--format', 'json'])
    expected = json.loads(json.dumps(before))
    for s in ('api', 'web'):
        expected['services'][s]['image'] = new[s]
    if expected != after:
        raise Stop('UNEXPECTED_COMPOSE_CHANGE (only api/web image may differ)')
    receipt = {'status': 'ROLLING_OUT', 'services': services, 'previous': {s: pre['snapshot'][s]['imageId'] for s in ('api', 'web')},
               'rollbackTags': rollback_tags, 'new': {s: b['images'][s]['id'] for s in services},
               'composeFiles': files + [str(fwd)], 'rollbackOverride': str(back)}
    write(root, 'rollout.json', receipt)
    try:
        for s in [x for x in ('api', 'web') if x in services]:
            log('switching ' + s)
            run(cmd + ['-f', str(fwd), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', s], timeout=600)
            wait_healthy(s, b['images'][s]['id'])
        verify_web(LIVE_WEB_PORT, b['webManifest'] if 'web' in services else [])
        if stamp(inspect('db')) != pre['snapshot']['db']:
            raise Stop('DB_CONTAINER_CHANGED')
    except Exception as e:
        log('ROLLOUT FAILED (%s) - restoring previous images' % e)
        run(cmd + ['-f', str(back), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api', 'web'], timeout=600)
        for s in ('api', 'web'):
            wait_healthy(s, pre['snapshot'][s]['imageId'])
        receipt.update(status='ROLLED_BACK_AUTOMATICALLY', error=str(e))
        write(root, 'rollout.json', receipt)
        raise
    receipt['status'] = 'ROLLOUT_PASS'
    write(root, 'rollout.json', receipt)
    log('ROLLOUT_PASS. From now on any manual compose command MUST include -f ' + str(fwd))


def verify(root, opts):
    r, b = read(root, 'rollout.json'), read(root, 'build.json')
    for s in r['services']:
        if inspect(s)['Image'] != b['images'][s]['id']:
            raise Stop('LIVE_IMAGE_IS_NOT_THIS_RELEASE: ' + s)
    verify_web(LIVE_WEB_PORT, b['webManifest'] if 'web' in r['services'] else [])
    log('VERIFY_PASS')


def rollback(root, opts):
    r = read(root, 'rollout.json')
    cmd, _ = compose_cmd()
    back = pathlib.Path(r['rollbackOverride'])
    run(cmd + ['-f', str(back), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api', 'web'], timeout=600)
    for s in ('api', 'web'):
        wait_healthy(s, r['previous'][s])
    verify_web(LIVE_WEB_PORT, [])
    r['status'] = 'ROLLED_BACK'
    write(root, 'rollout.json', r)
    log('ROLLBACK_PASS. Manual compose commands must now end with -f ' + str(back))


PHASES = {'preflight': preflight, 'build': build, 'stage': stage, 'rollout': rollout, 'verify': verify, 'rollback': rollback}

if __name__ == '__main__':
    if len(sys.argv) < 3 or sys.argv[1] not in PHASES:
        print(__doc__)
        sys.exit(2)
    opts, it = {}, iter(sys.argv[3:])
    for a in it:
        opts[a] = next(it)
    try:
        PHASES[sys.argv[1]](release_dir(sys.argv[2]), opts)
    except Stop as e:
        log('STOP: %s' % e)
        sys.exit(1)
