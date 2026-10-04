// Public website + release repo. The private app repository is intentionally never referenced.
// Single place to change repository details and tuning values.
export const CONFIG = Object.freeze({
  owner: 'BossCrayon',
  repo: 'libria-web',
  repoUrl: 'https://github.com/BossCrayon/libria-web',
  releasesUrl: 'https://github.com/BossCrayon/libria-web/releases',
  latestReleasePageUrl: 'https://github.com/BossCrayon/libria-web/releases/latest',

  apiBase: 'https://api.github.com',
  perPage: 30,                       // one request is enough for the whole history
  cacheTtlMs: 10 * 60 * 1000,        // 10 minutes; GitHub allows 60 unauthenticated requests/hour/IP
  requestTimeoutMs: 10000,

  apkNameHint: 'libria',             // preferred substring in the APK filename
  previousVisibleCount: 5,           // older versions shown before "Show all"
});
