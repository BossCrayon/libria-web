// All GitHub Releases API logic lives here. The UI never calls fetch() itself.
// Public, unauthenticated requests only: no token is used or needed.
import { CONFIG } from './config.js';

export class ReleaseServiceError extends Error {
  /** @param {'network'|'timeout'|'rate_limit'|'not_found'|'http'|'invalid'} kind */
  constructor(kind, message, status) {
    super(message);
    this.name = 'ReleaseServiceError';
    this.kind = kind;
    this.status = status;
  }
}

const CACHE_PREFIX = 'libria:releases:v2:';
const NO_APK_CACHE_TTL_MS = 60 * 1000;

/* ---------- Pure formatting helpers (exported for tests) ---------- */

/** "Libria v1.5.0" / "v1.5.0" / "release-1.5.0" -> "1.5.0" */
export function cleanVersion(input) {
  if (input == null) return '';
  const raw = String(input).trim();
  const numeric = raw.match(/\d+(?:\.\d+)+(?:[-+][\w.]+)?/);
  if (numeric) return numeric[0];
  return raw.replace(/^libria[\s\-_:]*/i, '').replace(/^v(?=\d)/i, '').trim();
}

/** Accepts a raw GitHub release or a string. Returns the bare version, e.g. "1.5.0". */
export function formatVersion(releaseOrString) {
  if (releaseOrString && typeof releaseOrString === 'object') {
    return cleanVersion(releaseOrString.tag_name) || cleanVersion(releaseOrString.name);
  }
  return cleanVersion(releaseOrString);
}

/** style: 'full' -> "October 3, 2026", 'month' -> "October 2026". Always UTC so dates don't shift. */
export function formatReleaseDate(iso, style = 'full') {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const opts = style === 'month'
    ? { month: 'long', year: 'numeric' }
    : { month: 'long', day: 'numeric', year: 'numeric' };
  return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(d);
}

/** 29779353 -> "28.4 MB" (binary units, like Android's download manager). */
export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`;
}

/**
 * Pick the best APK from a release's assets, or null.
 * Prefers: *.apk, filename containing "libria", then non-debug, then the larger file.
 */
export function extractApkAsset(assets, nameHint = CONFIG.apkNameHint) {
  if (!Array.isArray(assets)) return null;
  const hint = String(nameHint || '').toLowerCase();
  const candidates = assets.filter((a) =>
    a && typeof a.name === 'string' && /\.apk$/i.test(a.name) &&
    typeof a.browser_download_url === 'string' && a.browser_download_url.startsWith('https://') &&
    (a.state == null || a.state === 'uploaded'));
  if (!candidates.length) return null;

  const score = (a) => {
    const n = a.name.toLowerCase();
    let s = 0;
    if (hint && n.includes(hint)) s += 10;
    if (!/debug|unsigned|test/.test(n)) s += 3;
    if (/release|universal/.test(n)) s += 1;
    return s;
  };
  const best = [...candidates].sort((a, b) => score(b) - score(a) || (b.size || 0) - (a.size || 0))[0];
  return {
    name: best.name,
    url: best.browser_download_url, // GitHub's real browser download URL, never constructed by hand
    size: Number.isFinite(best.size) ? best.size : null,
    downloadCount: Number.isFinite(best.download_count) ? best.download_count : null,
  };
}

/** Raw GitHub release -> the small shape the UI uses. */
export function toRelease(raw) {
  const version = formatVersion(raw);
  const date = raw.published_at || raw.created_at || '';
  return {
    id: raw.id,
    tag: raw.tag_name || '',
    version,
    title: `Libria ${version}`.trim(),
    publishedAt: date,
    url: raw.html_url,
    body: typeof raw.body === 'string' ? raw.body : '',
    apk: extractApkAsset(raw.assets),
  };
}

/** Latest normal release first. Older ones after it, latest never repeated. */
export function partitionReleases(list) {
  const [latest = null, ...rest] = list;
  return { latest, previous: latest ? rest.filter((r) => r.id !== latest.id) : [] };
}

/* ---------- Service ---------- */

export class GitHubReleaseService {
  constructor(options = {}) {
    const o = { ...CONFIG, ...options };
    this.owner = o.owner;
    this.repo = o.repo;
    this.apiBase = o.apiBase;
    this.perPage = o.perPage;
    this.cacheTtlMs = o.cacheTtlMs;
    this.timeoutMs = o.requestTimeoutMs;
    this.fetchImpl = options.fetchImpl || ((...a) => globalThis.fetch(...a));
    this.storage = 'storage' in options ? options.storage : safeLocalStorage();
    this.now = options.now || (() => Date.now());
  }

  // Delegates so the service exposes the API described in the brief.
  extractApkAsset(assets) { return extractApkAsset(assets, CONFIG.apkNameHint); }
  formatVersion(release) { return formatVersion(release); }
  formatReleaseDate(iso, style) { return formatReleaseDate(iso, style); }
  formatFileSize(bytes) { return formatFileSize(bytes); }

  /** GET /repos/{owner}/{repo}/releases/latest (never a draft or pre-release). */
  async fetchLatestRelease() {
    const all = this._readCache('all');
    if (all && this._fresh(all) && all.data.length) return all.data[0];

    return this._cached('latest', async () => {
      const raw = await this._request(`/repos/${this.owner}/${this.repo}/releases/latest`);
      if (!raw || typeof raw !== 'object') throw new ReleaseServiceError('invalid', 'Unexpected response');
      return toRelease(raw);
    });
  }

  /** GET /repos/{owner}/{repo}/releases, published normal releases, newest first. */
  async fetchAllReleases() {
    return this._cached('all', async () => {
      const raw = await this._request(`/repos/${this.owner}/${this.repo}/releases?per_page=${this.perPage}`);
      if (!Array.isArray(raw)) throw new ReleaseServiceError('invalid', 'Unexpected response');
      return raw
        .filter((r) => r && !r.draft && !r.prerelease)
        .map(toRelease)
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    });
  }

  /* ----- internals ----- */

  async _request(path) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetchImpl(`${this.apiBase}${path}`, {
        headers: { Accept: 'application/vnd.github+json' }, // CORS-safelisted: no preflight
        signal: ctrl.signal,
      });
    } catch (err) {
      throw new ReleaseServiceError(err && err.name === 'AbortError' ? 'timeout' : 'network', 'Could not reach GitHub');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 403 || res.status === 429) throw new ReleaseServiceError('rate_limit', 'GitHub rate limit reached', res.status);
    if (res.status === 404) throw new ReleaseServiceError('not_found', 'No releases found', 404);
    if (!res.ok) throw new ReleaseServiceError('http', `GitHub responded with ${res.status}`, res.status);
    try {
      return await res.json();
    } catch {
      throw new ReleaseServiceError('invalid', 'Unreadable response from GitHub');
    }
  }

  async _cached(key, loader) {
    const hit = this._readCache(key);
    if (hit && this._fresh(hit)) return hit.data;
    try {
      const data = await loader();
      this._writeCache(key, data);
      return data;
    } catch (err) {
      if (hit) return hit.data; // stale beats nothing
      throw err;
    }
  }

  _fresh(entry) {
    const latest = Array.isArray(entry.data) ? entry.data[0] : entry.data;
    const ttl = latest && !latest.apk
      ? Math.min(this.cacheTtlMs, NO_APK_CACHE_TTL_MS)
      : this.cacheTtlMs;
    return this.now() - entry.t < ttl;
  }

  _readCache(key) {
    try {
      const v = this.storage && this.storage.getItem(CACHE_PREFIX + key);
      const parsed = v ? JSON.parse(v) : null;
      return parsed && typeof parsed.t === 'number' && 'data' in parsed ? parsed : null;
    } catch { return null; }
  }

  _writeCache(key, data) {
    try { this.storage && this.storage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: this.now(), data })); } catch { /* storage full or blocked */ }
  }
}

function safeLocalStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}
