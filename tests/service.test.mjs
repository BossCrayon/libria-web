import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubReleaseService, partitionReleases, formatVersion, formatFileSize, formatReleaseDate,
  extractApkAsset, ReleaseServiceError } from '../js/github-release-service.js';
import { renderMarkdown } from '../js/markdown.js';
import { RELEASES } from './fixtures.mjs';

const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const okFetch = (data, calls = []) => async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => data }; };
const mk = (fetchImpl, extra = {}) => new GitHubReleaseService({ fetchImpl, storage: memStore(), ...extra });

test('formatVersion strips v and Libria prefix', () => {
  assert.equal(formatVersion('v1.5.0'), '1.5.0');
  assert.equal(formatVersion('Libria v1.5.0'), '1.5.0');
  assert.equal(formatVersion({ tag_name: 'v2.0.1', name: 'whatever' }), '2.0.1');
  assert.equal(formatVersion({ tag_name: '', name: 'Libria 3.1.0' }), '3.1.0');
});

test('formatFileSize / formatReleaseDate', () => {
  assert.equal(formatFileSize(29779353), '28.4 MB');
  assert.equal(formatFileSize(0), '');
  assert.equal(formatReleaseDate('2026-10-03T23:59:00Z'), 'October 3, 2026');
  assert.equal(formatReleaseDate('2026-10-03T10:00:00Z', 'month'), 'October 2026');
  assert.equal(formatReleaseDate('nope'), '');
});

test('extractApkAsset prefers libria-named release APK, ignores non-APK', () => {
  const apk = extractApkAsset(RELEASES[1].assets);
  assert.equal(apk.name, 'libria-1.5.0.apk');
  assert.equal(apk.url, 'https://github.com/BossCrayon/libria-web/releases/download/x/libria-1.5.0.apk');
  assert.equal(extractApkAsset([{
    name: 'app-release.apk',
    browser_download_url: 'https://github.com/BossCrayon/libria-web/releases/download/2.0.0/app-release.apk',
    state: 'uploaded',
  }]).name, 'app-release.apk');
  assert.equal(extractApkAsset([{ name: 'a.txt' }]), null);
  assert.equal(extractApkAsset([]), null);
  assert.equal(extractApkAsset(undefined), null);
});

test('fetchAllReleases excludes drafts/pre-releases, sorts newest first', async () => {
  const list = await mk(okFetch(RELEASES)).fetchAllReleases();
  assert.deepEqual(list.map((r) => r.version), ['1.5.0', '1.4.0', '1.3.0']);
  assert.equal(list[0].title, 'Libria 1.5.0');
});

test('latest is not duplicated in previous; missing APK is null', async () => {
  const { latest, previous } = partitionReleases(await mk(okFetch(RELEASES)).fetchAllReleases());
  assert.equal(latest.version, '1.5.0');
  assert.deepEqual(previous.map((r) => r.version), ['1.4.0', '1.3.0']);
  assert.equal(previous[0].apk, null);
});

test('new release becomes latest with no code change', async () => {
  const newer = { ...RELEASES[1], id: 160, tag_name: 'v1.6.0', name: 'v1.6.0', published_at: '2026-11-01T00:00:00Z' };
  const { latest, previous } = partitionReleases(await mk(okFetch([...RELEASES, newer])).fetchAllReleases());
  assert.equal(latest.version, '1.6.0');
  assert.equal(previous[0].version, '1.5.0');
});

test('caching: second call makes no request; stale cache used on failure', async () => {
  const calls = []; let t = 0;
  const svc = mk(okFetch(RELEASES, calls), { now: () => t });
  await svc.fetchAllReleases(); await svc.fetchAllReleases();
  assert.equal(calls.length, 1);
  assert.equal((await svc.fetchLatestRelease()).version, '1.5.0'); // served from list cache
  assert.equal(calls.length, 1);
  t = 99 * 60 * 1000;
  svc.fetchImpl = async () => { throw new Error('offline'); };
  assert.equal((await svc.fetchAllReleases()).length, 3);
});

test('a release cached without an APK refreshes after one minute', async () => {
  const storage = memStore();
  const releaseWithoutApk = { ...RELEASES[1], assets: [] };
  const releaseWithApk = {
    ...RELEASES[1],
    assets: [{
      name: 'app-release.apk',
      browser_download_url: 'https://github.com/BossCrayon/libria-web/releases/download/2.0.0/app-release.apk',
      state: 'uploaded',
      size: 125002568,
    }],
  };
  let t = 0;
  let response = [releaseWithoutApk];
  let calls = 0;
  const svc = mk(async () => {
    calls++;
    return { ok: true, status: 200, json: async () => response };
  }, { storage, now: () => t });

  assert.equal((await svc.fetchAllReleases())[0].apk, null);
  response = [releaseWithApk];
  t = 60 * 1000;

  assert.equal((await svc.fetchAllReleases())[0].apk.name, 'app-release.apk');
  assert.equal(calls, 2);
});

test('errors are typed', async () => {
  const mkErr = (status) => mk(async () => ({ ok: false, status, json: async () => ({}) }));
  await assert.rejects(mkErr(403).fetchAllReleases(), (e) => e instanceof ReleaseServiceError && e.kind === 'rate_limit');
  await assert.rejects(mkErr(404).fetchAllReleases(), (e) => e.kind === 'not_found');
  await assert.rejects(mkErr(500).fetchAllReleases(), (e) => e.kind === 'http');
  await assert.rejects(mk(async () => { throw new TypeError('x'); }).fetchAllReleases(), (e) => e.kind === 'network');
});

test('requests are unauthenticated', async () => {
  let init; const svc = mk(async (u, i) => { init = i; return { ok: true, status: 200, json: async () => [] }; });
  await svc.fetchAllReleases();
  assert.deepEqual(Object.keys(init.headers), ['Accept']);
});

test('markdown: renders supported syntax', () => {
  const html = renderMarkdown("# Title\n- one **b**\n- two `c`\n\n1. a\n2. b\n\n```\n<x>\n```\nsee [l](https://e.com)");
  assert.match(html, /<h3>Title<\/h3>/);
  assert.match(html, /<ul><li>one <strong>b<\/strong><\/li><li>two <code>c<\/code><\/li><\/ul>/);
  assert.match(html, /<ol><li>a<\/li><li>b<\/li><\/ol>/);
  assert.match(html, /<pre><code>&lt;x&gt;<\/code><\/pre>/);
  assert.match(html, /<a href="https:\/\/e\.com"[^>]*>l<\/a>/);
});

test('markdown: no script, no javascript: links, no raw html', () => {
  const html = renderMarkdown(RELEASES[1].body + '\n<img src=x onerror=alert(1)>\n[x](data:text/html,hi)');
  assert.ok(!/<script/i.test(html));
  assert.ok(!/<img/i.test(html));
  assert.ok(!/href="javascript/i.test(html));
  assert.ok(!/href="data:/i.test(html));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="https:\/\/example\.com\/a\?x=1&amp;y=2"/);
  assert.match(html, /github\.com\/BossCrayon\/libria-web\/compare/);
});

test('calls only the libria-web endpoints', async () => {
  const calls = [];
  const svc = mk(okFetch(RELEASES, calls));
  await svc.fetchAllReleases();
  const svc2 = mk(okFetch(RELEASES[1], calls));
  await svc2.fetchLatestRelease();
  assert.deepEqual(calls, [
    'https://api.github.com/repos/BossCrayon/libria-web/releases?per_page=30',
    'https://api.github.com/repos/BossCrayon/libria-web/releases/latest',
  ]);
});

test('latest endpoint response is normalized (fallback path)', async () => {
  const l = await mk(okFetch(RELEASES[1])).fetchLatestRelease();
  assert.equal(l.title, 'Libria 1.5.0');
  assert.equal(l.apk.name, 'libria-1.5.0.apk');
});
