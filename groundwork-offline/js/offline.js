// Groundwork offline support (installed copy only).
const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
function note(text, onTap) {
  const b = document.createElement(onTap ? 'button' : 'div');
  b.textContent = text; b.setAttribute('role', 'status');
  b.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 66px);z-index:50;background:#f3a83c;color:#1c1200;border:0;border-radius:999px;padding:9px 16px;font:500 13px var(--font);box-shadow:0 6px 18px rgba(0,0,0,.3);max-width:86vw;text-align:center';
  if (onTap) b.addEventListener('click', onTap); else setTimeout(() => b.remove(), 3200);
  document.body.append(b);
}
if ('serviceWorker' in navigator && secure) {
  const firstRun = !navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => { if (firstRun) note('Saved on this device · works offline now'); }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!firstRun) note('New version downloaded · tap to reload', () => location.reload()); });
}
try { navigator.storage?.persist?.().catch(() => {}); } catch { /* not supported */ }
