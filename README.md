# Libria website

Static site (HTML, CSS, vanilla JS modules). No build step, no runtime dependencies.
It reads releases from the PUBLIC repo `BossCrayon/libria-web` through GitHub's unauthenticated
Releases API, in the visitor's browser. The private app repo is never referenced.

## Run locally
ES modules need http, so don't open index.html via file://.

    npm start          # or: python3 -m http.server 8080

## Deploy
Put these files in the root of `libria-web` and serve them with GitHub Pages
(Settings > Pages > Deploy from branch > main / root), or any static host.
`node_modules/`, `tests/` and `package.json` are only for development.

## Release workflow
1. Build the APK in the private repo.
2. In `libria-web`: Releases > Draft a new release, tag `v1.2.0`.
3. Upload `libria-1.2.0.apk`, add notes (Markdown), publish.
The site shows it as the latest release within ~10 minutes (browser cache). Drafts and
pre-releases are ignored. The APK is the `.apk` asset, preferring a name containing "libria".

## Structure
    index.html
    css/styles.css
    js/config.js                      repo name, cache TTL
    js/github-release-service.js      ALL GitHub API logic + formatting helpers
    js/markdown.js                    safe Markdown to HTML for release notes
    js/components/release-ui.js       reusable release card / list / error UI
    js/nav.js                         mobile menu
    js/main.js                        wiring
    assets/screenshots/*.svg          placeholders
    tests/                            npm install && npm test

## Replace the placeholder screenshots
Drop real images into assets/screenshots/ (e.g. home.png, 540x1170) and update the six
`<img src>` values in the #preview section of index.html.

## Before launch
Set absolute URLs for `og:image` and add `og:url` once you have a domain.
