const asset = (name, size, extra = {}) => ({ name, size, state: 'uploaded', download_count: 3,
  browser_download_url: `https://github.com/BossCrayon/libria-web/releases/download/x/${name}`, ...extra });
export const raw = (tag, name, date, body, assets, extra = {}) => ({
  id: Number(tag.replace(/\D/g, '')), tag_name: tag, name, draft: false, prerelease: false,
  published_at: date, created_at: date, html_url: `https://github.com/BossCrayon/libria-web/releases/tag/${tag}`,
  body, assets, ...extra });

export const RELEASES = [
  raw('v1.3.0', 'v1.3.0', '2026-09-10T10:00:00Z', '- Older', [asset('libria-1.3.0.apk', 25000000)]),
  raw('v1.5.0', 'v1.5.0', '2026-10-03T10:00:00Z',
    "## What's new\n- Improved **reader**\n- Better download handling\n- See [docs](https://example.com/a?x=1&y=2) and `code`\n- <script>alert(1)</script>\n- [bad](javascript:alert(1))\n\n**Full Changelog**: https://github.com/BossCrayon/libria-web/compare/v1.4.0...v1.5.0",
    [asset('notes.txt', 100), asset('app-debug.apk', 99999999), asset('libria-1.5.0.apk', 29779353)]),
  raw('v1.6.0-beta', 'v1.6.0-beta', '2026-10-04T00:00:00Z', 'beta', [asset('libria-1.6.0-beta.apk', 1)], { prerelease: true }),
  raw('v1.7.0', 'v1.7.0', '2026-10-05T00:00:00Z', 'draft', [], { draft: true }),
  raw('v1.4.0', 'Libria v1.4.0', '2026-10-01T10:00:00Z', '', []),   // no APK, no notes
];
