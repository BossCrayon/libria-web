const DURATION = 420;
const EASE = 'cubic-bezier(.2, .8, .2, 1)';
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ms = (n) => (reduced() ? 0 : n);

const items = [...document.querySelectorAll('.phone')].map((fig) => {
    const img = fig.querySelector('img');
    const caption = fig.querySelector('figcaption');
    return { img, label: caption ? caption.textContent.trim() : 'Screenshot', btn: null };
}).filter((i) => i.img);

if (items.length) init();

function init() {
    // 1. Make every thumbnail a real button (keyboard + screen reader friendly).
    items.forEach((item, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'phone-btn';
        btn.setAttribute('aria-label', `Enlarge ${item.label} screenshot`);
        item.img.replaceWith(btn);
        btn.append(item.img);
        btn.addEventListener('click', () => open(i));
        item.btn = btn;
    });

    // 2. Build the viewer once.
    const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
    const lb = document.createElement('div');
    lb.className = 'lb';
    lb.hidden = true;
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Screenshot viewer');
    lb.innerHTML = `
    <div class="lb-backdrop"></div>
    <button type="button" class="lb-btn lb-close" aria-label="Close">${icon('M6 6l12 12M18 6L6 18')}</button>
    <button type="button" class="lb-btn lb-prev" aria-label="Previous screenshot">${icon('M15 5l-7 7 7 7')}</button>
    <button type="button" class="lb-btn lb-next" aria-label="Next screenshot">${icon('M9 5l7 7-7 7')}</button>
    <figure class="lb-fig"><img class="lb-img" alt=""><figcaption class="lb-cap"></figcaption></figure>`;
    document.body.append(lb);

    const $ = (s) => lb.querySelector(s);
    const backdrop = $('.lb-backdrop');
    const fig = $('.lb-fig');
    const big = $('.lb-img');
    const cap = $('.lb-cap');
    const closeBtn = $('.lb-close');
    const prevBtn = $('.lb-prev');
    const nextBtn = $('.lb-next');
    const controls = [closeBtn, prevBtn, nextBtn];
    if (items.length < 2) { prevBtn.hidden = true; nextBtn.hidden = true; }

    const state = { open: false, busy: false, index: 0, opener: null };

    const flipTransform = (from, to) => {
        const s = from.width / to.width;
        return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${s})`;
    };

    function show(i) {
        const { img, label } = items[i];
        big.src = img.dataset.full || img.currentSrc || img.src; // optional: data-full="hi-res.jpg"
        big.alt = img.alt;
        cap.textContent = label;
    }

    async function open(i) {
        if (state.open) return;
        state.open = true;
        state.index = i;
        state.opener = document.activeElement;

        const from = items[i].img.getBoundingClientRect();
        const sw = window.innerWidth - document.documentElement.clientWidth;
        document.documentElement.classList.add('lb-lock');
        if (sw > 0) document.documentElement.style.paddingRight = `${sw}px`;

        show(i);
        lb.hidden = false;
        [...document.body.children].forEach((el) => { if (el !== lb) el.inert = true; });
        items[i].btn.classList.add('is-lifted');
        const to = big.getBoundingClientRect();

        state.busy = true;
        controls.forEach((c) => c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms(250), delay: ms(150), fill: 'backwards' }));
        cap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms(250), delay: ms(200), fill: 'backwards' });
        backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms(300) });
        await big.animate(
            [{ transformOrigin: 'top left', transform: flipTransform(from, to) }, { transformOrigin: 'top left', transform: 'none' }],
            { duration: ms(DURATION), easing: EASE },
        ).finished;
        state.busy = false;
        closeBtn.focus({ preventScroll: true });
    }

    async function close() {
        if (!state.open || state.busy) return;
        state.busy = true;
        const item = items[state.index];
        item.btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        const from = big.getBoundingClientRect();
        const to = item.img.getBoundingClientRect();
        const fade = { duration: ms(250), fill: 'forwards' };
        controls.forEach((c) => c.animate([{ opacity: 1 }, { opacity: 0 }], fade));
        cap.animate([{ opacity: 1 }, { opacity: 0 }], fade);
        backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms(DURATION), fill: 'forwards' });
        await big.animate(
            [{ transformOrigin: 'top left', transform: 'none' }, { transformOrigin: 'top left', transform: flipTransform(to, from) }],
            { duration: ms(DURATION), easing: EASE, fill: 'forwards' },
        ).finished;

        lb.hidden = true;
        lb.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        item.btn.classList.remove('is-lifted');
        [...document.body.children].forEach((el) => { el.inert = false; });
        document.documentElement.classList.remove('lb-lock');
        document.documentElement.style.paddingRight = '';
        state.open = false;
        state.busy = false;
        (state.opener && state.opener.focus ? state.opener : item.btn).focus({ preventScroll: true });
    }

    async function go(dir) {
        if (!state.open || state.busy || items.length < 2) return;
        state.busy = true;
        const next = (state.index + dir + items.length) % items.length;
        items[state.index].btn.classList.remove('is-lifted');
        items[next].btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
        items[next].btn.classList.add('is-lifted');

        const out = fig.animate(
            [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 18}px) scale(.98)` }],
            { duration: ms(130), easing: 'ease-in', fill: 'forwards' });
        await out.finished;
        show(next);
        state.index = next;
        const inn = fig.animate(
            [{ opacity: 0, transform: `translateX(${dir * 18}px) scale(.98)` }, { opacity: 1, transform: 'none' }],
            { duration: ms(200), easing: 'ease-out' });
        out.cancel();
        await inn.finished;
        state.busy = false;
    }

    prevBtn.addEventListener('click', () => go(-1));
    nextBtn.addEventListener('click', () => go(1));
    closeBtn.addEventListener('click', close);
    lb.addEventListener('click', (e) => { if (!e.target.closest('.lb-btn, .lb-img')) close(); });

    document.addEventListener('keydown', (e) => {
        if (!state.open) return;
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') go(-1);
        else if (e.key === 'ArrowRight') go(1);
    });

    // Swipe left/right on touch screens.
    let startX = null;
    lb.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', (e) => {
        if (startX == null) return;
        const dx = e.changedTouches[0].clientX - startX;
        startX = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    }, { passive: true });
}