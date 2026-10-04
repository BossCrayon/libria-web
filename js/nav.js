// Mobile menu: progressive enhancement. Without JS the links simply stay visible.
const header = document.querySelector('.site-header');
const toggle = header && header.querySelector('.nav-toggle');
if (toggle) {
  document.documentElement.classList.add('js');
  const close = () => { header.classList.remove('nav-open'); toggle.setAttribute('aria-expanded', 'false'); };
  toggle.addEventListener('click', () => {
    const open = header.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  header.querySelectorAll('nav a').forEach((a) => a.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
