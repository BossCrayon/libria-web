import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { GitHubReleaseService, partitionReleases } from '../js/github-release-service.js';
import { RELEASES } from './fixtures.mjs';

const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
globalThis.document = dom.window.document;
const ui = await import('../js/components/release-ui.js');

const svc = new GitHubReleaseService({ storage: null, fetchImpl: async () => ({ ok: true, status: 200, json: async () => RELEASES }) });
const { latest, previous } = partitionReleases(await svc.fetchAllReleases());
const $ = (s) => document.querySelector(s);

test('hero + latest card point at the real APK URL', () => {
  ui.renderLatest($('#latest-release'), latest);
  ui.applyHeroDownload(latest, { button: $('#hero-download'), meta: $('#hero-meta') });
  const expected = 'https://github.com/BossCrayon/libria-web/releases/download/x/libria-1.5.0.apk';
  assert.equal($('#hero-download').href, expected);
  assert.equal($('#latest-release .btn--primary').href, expected);
  assert.equal($('.latest-title').textContent, 'Libria 1.5.0');
  assert.match($('#hero-meta').textContent, /1\.5\.0 for Android, 28\.4 MB/);
  assert.match($('.meta').textContent, /Released October 2026/);
  assert.ok($('.latest-notes .prose ul li'));
  assert.equal($('.latest-notes script'), null);
});

test('previous versions: no duplicate latest, APK-less release has no broken button', () => {
  ui.renderPrevious($('#previous-versions'), previous);
  const titles = [...document.querySelectorAll('.version h3')].map((e) => e.textContent);
  assert.deepEqual(titles, ['Libria 1.4.0', 'Libria 1.3.0']);
  const first = document.querySelectorAll('.version')[0];
  assert.equal(first.querySelector('a.btn--primary'), null);
  assert.match(first.textContent, /APK unavailable/);
  assert.ok(first.querySelector('a[href*="releases/tag/v1.4.0"]'));
  assert.ok(document.querySelectorAll('.version')[1].querySelector('a.btn--primary'));
});

test('"show older" collapses long histories', () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ ...previous[1], id: 1000 + i, title: `Libria 0.${i}.0` }));
  const el = document.createElement('div');
  ui.renderPrevious(el, many, 5);
  assert.equal(el.querySelectorAll('.version').length, 5);
  el.querySelector('.show-more button').click();
  assert.equal(el.querySelectorAll('.version').length, 8);
});

test('error state is graceful and has a retry + GitHub link', () => {
  const el = document.createElement('div'); let retried = false;
  ui.renderError(el, { kind: 'network' }, { onRetry: () => { retried = true; } });
  assert.match(el.textContent, /Release information is temporarily unavailable/);
  el.querySelector('button').click();
  assert.ok(retried);
  assert.ok(el.querySelector('a[href="https://github.com/BossCrayon/libria-web/releases"]'));
});

test('nav + footer links match the spec', () => {
  const texts = (sel) => [...document.querySelectorAll(sel + ' a')].map((a) => a.textContent.trim());
  assert.deepEqual(texts('#site-nav'), ['Home', 'Features', 'Download', 'Releases', 'GitHub']);
  assert.deepEqual(texts('footer nav'), ['Home', 'Features', 'Download', 'Releases', 'GitHub']);
  assert.ok($('.nav-toggle'));
});

test('private repo is never referenced anywhere in the shipped site', () => {
  const files = ['../index.html', '../README.md', '../js/main.js', '../js/config.js', '../js/nav.js',
    '../js/github-release-service.js', '../js/markdown.js', '../js/components/release-ui.js', '../css/styles.css'];
  for (const f of files) {
    const t = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/BossCrayon\/Libria(?![-\w])/i.test(t), `${f} references the private repo`);
    assert.ok(!/repos\/BossCrayon\/Libria(?![-\w])/i.test(t), `${f} calls the private repo API`);
  }
});

test('static HTML: fallback download link and no tokens', () => {
  const raw = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(raw, /id="hero-download"[^>]*href="https:\/\/github\.com\/BossCrayon\/libria-web\/releases\/latest"/);
  const all = ['../index.html', '../js/main.js', '../js/github-release-service.js', '../js/config.js', '../js/nav.js']
    .map((p) => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n');
  assert.ok(!/ghp_|github_pat_|Authorization|Bearer/i.test(all));
});
