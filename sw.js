/* Ear & Pen service worker: the app opens and dictation works without internet (same approach as Pip's Sky Islands).
   Own files: network first (always fresh when online), but never wait long: offline or on a weak connection
   the saved copy opens right away. Fonts and the Firebase library: saved and served from the cache, so the app
   looks the same offline. Claude and the voice server go straight to the network (voice audio is kept by the app itself).
   A new version waits until the person taps "Обновить" (the app sends "skip"); right after the app opens it applies itself. */
const V = 'ep-v28', RT = 'ep-rt-v1';
const CORE = ['./', 'index.html', 'styles.css', 'js/app.js', 'js/merge.js', 'js/cloud.js', 'prompts.js', 'content.js', 'config.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.svg', 'icons/badge-96.png', 'favicon.ico'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Source+Sans+3:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';

async function saveFonts() {
  try {
    const c = await caches.open(RT);
    const res = await fetch(FONT_CSS, { mode: 'cors' });
    if (!res.ok) return;
    const css = await res.clone().text();
    await c.put(FONT_CSS, res);
    const urls = [...new Set((css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g) || []).map(m => m.slice(4, -1)))];
    await Promise.all(urls.map(u => c.match(u).then(m => m || fetch(u, { mode: 'cors' }).then(r => { if (r.ok) return c.put(u, r); }).catch(() => {}))));
  } catch (e) {}
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))));
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V && k !== RT).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
    .then(saveFonts));
});

const fromCache = r => caches.match(r, { ignoreSearch: true, ignoreVary: true })
  .then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : undefined));

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    // ask the server every time (a 304 is cheap): GitHub Pages lets browsers keep files for 10 minutes,
    // which mixed a new page with old code right after an update
    const net = (r.mode === 'navigate' ? fetch(r.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(new Request(r, { cache: 'no-cache' }))).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r.mode === 'navigate' ? 'index.html' : r, cp)); }
      return res;
    });
    e.respondWith((async () => {
      if (self.navigator && self.navigator.onLine === false) { const m = await fromCache(r); if (m) { net.catch(() => {}); return m; } }
      // weak connection: wait at most 3 seconds, then open the saved copy (the fresh one is still saved for next time)
      const timer = new Promise(res => setTimeout(() => res('slow'), 3000));
      const first = await Promise.race([net.catch(() => 'fail'), timer]);
      if (first !== 'slow' && first !== 'fail') return first;
      const m = await fromCache(r);
      if (m) { net.catch(() => {}); return m; }
      return net.catch(() => Response.error());
    })());
    return;
  }
  const fonts = u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
  const sdk = u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/');
  if (fonts || sdk) {
    e.respondWith(caches.open(RT).then(c => c.match(r, { ignoreVary: true }).then(m => m || fetch(r).then(res => {
      if (res.ok || res.type === 'opaque') c.put(r, res.clone());
      return res;
    }))));
  }
});

/* daily practice reminders (sent by the Ear & Pen server) */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Ear & Pen', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: d.tag || 'ep', renotify: false, data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const w = list.find(c => new URL(c.url).origin === location.origin);
    if (w) return w.focus().then(c => c && c.navigate ? c.navigate(url).catch(() => c) : c);
    return self.clients.openWindow(url);
  }));
});
