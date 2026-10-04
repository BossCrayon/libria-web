// Tiny, safe Markdown renderer for GitHub release notes.
// Everything is HTML-escaped FIRST; only a fixed set of tags is ever produced,
// and links are limited to http(s). No raw HTML from release notes is ever passed through.

const esc = (s) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function shortUrlLabel(escapedUrl) {
  const gh = escapedUrl.match(/^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:pull|issues)\/(\d+)$/);
  if (gh) return `#${gh[1]}`;
  const bare = escapedUrl.replace(/^https?:\/\//, '');
  return bare.length > 48 ? `${bare.slice(0, 45)}...` : bare;
}

const anchor = (url, label) => `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;

function inline(text) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;
  let s = esc(text);

  s = s.replace(/`([^`]+)`/g, (_, c) => keep(`<code>${c}</code>`));        // code spans
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, '');                                // images: dropped
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => keep(anchor(url, label)));
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+?)([.,;:!?)]*)(?=\s|$)/g,         // bare URLs
    (_, pre, url, trail) => `${pre}${keep(anchor(url, shortUrlLabel(url)))}${trail}`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');

  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
}

export function renderMarkdown(source) {
  if (!source || typeof source !== 'string') return '';
  const lines = source
    .replace(/\u0000/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\r\n?/g, '\n')
    .split('\n');

  const out = [];
  let para = [];
  let list = null;      // { type: 'ul' | 'ol', items: [] }
  let fence = null;     // array of code lines while inside ```

  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => {
    if (!list) return;
    out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`);
    list = null;
  };

  for (const line of lines) {
    if (fence) {
      if (/^\s*```/.test(line)) { out.push(`<pre><code>${esc(fence.join('\n'))}</code></pre>`); fence = null; }
      else fence.push(line);
      continue;
    }
    if (/^\s*```/.test(line)) { flushPara(); flushList(); fence = []; continue; }
    if (!line.trim()) { flushPara(); flushList(); continue; }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushPara(); flushList();
      const level = Math.min(heading[1].length + 2, 6); // page already has h1/h2; keep notes below them
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); flushList(); out.push('<hr>'); continue; }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      const type = bullet ? 'ul' : 'ol';
      if (list && list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push((bullet || numbered)[1].replace(/^\[[ xX]\]\s+/, ''));
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) { flushPara(); flushList(); out.push(`<blockquote>${inline(quote[1])}</blockquote>`); continue; }

    flushList();
    para.push(line.trim());
  }
  if (fence) out.push(`<pre><code>${esc(fence.join('\n'))}</code></pre>`);
  flushPara(); flushList();
  return out.join('');
}
