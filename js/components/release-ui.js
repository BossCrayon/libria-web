// Presentation only. Receives normalized releases from GitHubReleaseService; never calls the API.
import { CONFIG } from '../config.js';
import { formatReleaseDate, formatFileSize } from '../github-release-service.js';
import { renderMarkdown } from '../markdown.js';

/** Minimal DOM helper. Text children are always inserted as text nodes. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value; // only ever fed by renderMarkdown()
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
  return el;
}

const clear = (el) => { el.replaceChildren(); return el; };

/* ---------- Reusable pieces ---------- */

/** Download + View release buttons. Falls back gracefully when a release has no APK. */
export function createReleaseActions(release, { large = false } = {}) {
  const size = large ? ' btn--lg' : '';
  const download = release.apk
    ? h('a', { class: `btn btn--primary${size}`, href: release.apk.url, rel: 'noopener', 'data-apk': release.apk.name }, 'Download APK')
    : h('span', { class: `btn btn--disabled${size}`, 'aria-disabled': 'true' }, 'APK unavailable');
  const view = h('a', { class: `btn btn--ghost${size}`, href: release.url, rel: 'noopener' }, 'View release');
  return h('div', { class: 'actions' }, download, view);
}

/** Rendered release notes, or a plain empty message. */
export function createReleaseNotes(release) {
  const html = renderMarkdown(release.body);
  return html
    ? h('div', { class: 'prose', html })
    : h('p', { class: 'muted' }, 'No release notes were published for this version.');
}

function createMeta(release, dateStyle, isLatest = false) {
  const date = formatReleaseDate(release.publishedAt, dateStyle);
  const size = release.apk ? formatFileSize(release.apk.size) : '';
  return h('p', { class: 'meta' },
    date && h('time', { datetime: release.publishedAt }, dateStyle === 'full' ? `Released ${date}` : (isLatest ? `Released ${date}` : date)),
    size && h('span', {}, size));
}

/* ---------- Latest release ---------- */

export function renderLatestLoading(el) {
  el.setAttribute('aria-busy', 'true');
  clear(el).append(
    h('div', { class: 'latest-card skeleton', 'aria-hidden': 'true' },
      h('div', { class: 'latest-main' },
        h('span', { class: 'sk sk--badge' }), h('span', { class: 'sk sk--title' }),
        h('span', { class: 'sk sk--line' }), h('span', { class: 'sk sk--button' })),
      h('div', { class: 'latest-notes' },
        h('span', { class: 'sk sk--line' }), h('span', { class: 'sk sk--line' }), h('span', { class: 'sk sk--line sk--short' }))),
    h('p', { class: 'sr-only', role: 'status' }, 'Loading the latest release'));
}

export function renderLatest(el, release) {
  el.setAttribute('aria-busy', 'false');
  clear(el).append(
    h('article', { class: 'latest-card' },
      h('div', { class: 'latest-main' },
        h('span', { class: 'badge' }, 'Latest release'),
        h('h2', { class: 'latest-title' }, release.title),
        createMeta(release, 'month', true),
        createReleaseActions(release, { large: true }),
        h('p', { class: 'install-note' }, release.apk
          ? 'For Android. Your browser may ask you to allow installing apps from this source.'
          : 'This release has no APK attached yet. Check back soon or open the release on GitHub.')),
      h('div', { class: 'latest-notes' },
        h('h3', {}, "What's new"),
        createReleaseNotes(release))));
}

/* ---------- Previous versions ---------- */

export function renderPreviousLoading(el) {
  el.setAttribute('aria-busy', 'true');
  clear(el).append(
    ...[0, 1, 2].map(() => h('div', { class: 'version skeleton', 'aria-hidden': 'true' },
      h('span', { class: 'sk sk--title' }), h('span', { class: 'sk sk--line sk--short' }))),
    h('p', { class: 'sr-only', role: 'status' }, 'Loading previous versions'));
}

function createVersion(release) {
  const notes = release.body && renderMarkdown(release.body);
  return h('article', { class: 'version' },
    h('div', { class: 'version-head' },
      h('div', { class: 'version-info' },
        h('h3', {}, release.title),
        createMeta(release, 'month')),
      createReleaseActions(release)),
    notes && h('details', { class: 'version-notes' },
      h('summary', {}, 'Release notes'),
      h('div', { class: 'prose', html: notes })));
}

export function renderPrevious(el, releases, visible = CONFIG.previousVisibleCount) {
  el.setAttribute('aria-busy', 'false');
  clear(el);
  if (!releases.length) {
    el.append(h('p', { class: 'muted' }, 'Earlier versions will appear here as new releases are published.'));
    return;
  }
  const items = releases.map(createVersion);
  items.slice(0, visible).forEach((i) => el.append(i));
  const hidden = items.slice(visible);
  if (!hidden.length) return;

  const toggle = h('button', {
    type: 'button', class: 'btn btn--ghost',
    onclick: () => {
      hidden.forEach((i) => el.insertBefore(i, wrapper));
      wrapper.remove();
    },
  }, `Show ${hidden.length} older ${hidden.length === 1 ? 'version' : 'versions'}`);
  const wrapper = h('div', { class: 'show-more' }, toggle);
  el.append(wrapper);
}

/* ---------- Errors ---------- */

const ERROR_COPY = {
  rate_limit: 'GitHub is limiting requests from your network right now. Try again in a few minutes, or open the releases page.',
  not_found: 'No release has been published yet.',
  default: 'Release information is temporarily unavailable.',
};

export function renderError(el, error, { onRetry, title = 'Release information is temporarily unavailable.' } = {}) {
  el.setAttribute('aria-busy', 'false');
  const detail = ERROR_COPY[error && error.kind] || ERROR_COPY.default;
  clear(el).append(
    h('div', { class: 'state', role: 'alert' },
      h('p', { class: 'state-title' }, error && error.kind === 'not_found' ? 'No releases yet.' : title),
      detail !== title && h('p', { class: 'muted' }, detail),
      h('div', { class: 'actions' },
        onRetry && error && error.kind !== 'not_found' && h('button', { type: 'button', class: 'btn btn--primary', onclick: onRetry }, 'Try again'),
        h('a', { class: 'btn btn--ghost', href: CONFIG.releasesUrl, rel: 'noopener' }, 'Open releases on GitHub'))));
}

/* ---------- Hero download button ---------- */

/** Points the hero CTA at the latest APK. Always leaves a working link in place. */
export function applyHeroDownload(release, { button, meta }) {
  if (!button) return;
  if (!release) { button.href = CONFIG.latestReleasePageUrl; return; }
  button.href = release.apk ? release.apk.url : release.url;
  if (meta) {
    const size = release.apk ? formatFileSize(release.apk.size) : '';
    meta.textContent = release.apk
      ? `Version ${release.version} for Android${size ? `, ${size}` : ''}`
      : `Version ${release.version}: APK not attached yet`;
  }
}
