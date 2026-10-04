import './nav.js';
import { GitHubReleaseService, partitionReleases } from './github-release-service.js';
import {
  renderLatest, renderLatestLoading, renderPrevious, renderPreviousLoading, renderError, applyHeroDownload,
} from './components/release-ui.js';

const service = new GitHubReleaseService();

const $ = (sel) => document.querySelector(sel);
const els = {
  latest: $('#latest-release'),
  previous: $('#previous-versions'),
  heroButton: $('#hero-download'),
  heroMeta: $('#hero-meta'),
};

async function load() {
  renderLatestLoading(els.latest);
  renderPreviousLoading(els.previous);

  try {
    // One request covers both sections.
    const { latest, previous } = partitionReleases(await service.fetchAllReleases());
    if (!latest) throw Object.assign(new Error('empty'), { kind: 'not_found' });
    renderLatest(els.latest, latest);
    renderPrevious(els.previous, previous);
    applyHeroDownload(latest, { button: els.heroButton, meta: els.heroMeta });
  } catch (listError) {
    // The list failed. Try the dedicated latest endpoint so the main download still works.
    try {
      const latest = await service.fetchLatestRelease();
      renderLatest(els.latest, latest);
      applyHeroDownload(latest, { button: els.heroButton, meta: els.heroMeta });
    } catch (latestError) {
      renderError(els.latest, latestError, { onRetry: load });
      applyHeroDownload(null, { button: els.heroButton, meta: els.heroMeta });
    }
    renderError(els.previous, listError, { onRetry: load, title: 'Previous versions are temporarily unavailable.' });
  }
}

load();
