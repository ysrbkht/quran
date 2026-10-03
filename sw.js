const APP_CACHE_NAME = 'quran-app-v6';
const IMAGE_CACHE_NAME = 'quran-cache-hq-v1'; // باید با index.html یکی باشد
const QURAN_IMAGE_RE = /Quran\d{3}\.jpg/;
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Vazirmatn:wght@300;400;500;600;700&display=swap';

const urlsToCache = [
  './', './index.html', './manifest.json',
  './icons/maskable_icon_x48.png', './icons/maskable_icon_x96.png',
  './icons/maskable_icon_x192.png', './icons/maskable_icon_x512.png',
  FONT_CSS
];

const isFontUrl = u => /fonts\.googleapis|fonts\.gstatic/.test(u);

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_CACHE_NAME).then(cache =>
      Promise.allSettled(urlsToCache.map(u => cache.add(u)))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(names.map(n => {
      const old = (n.startsWith('quran-app-') && n !== APP_CACHE_NAME) ||
                  (n.startsWith('quran-cache-') && n !== IMAGE_CACHE_NAME) ||
                  n.startsWith('quran-image-');
      return old ? caches.delete(n) : null;
    }))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  // تصاویر قرآن: فقط از کش اصلی (کلید images/QuranXXX.jpg) بخوان؛ ذخیره‌سازی را خود صفحه انجام می‌دهد
  const img = url.match(QURAN_IMAGE_RE);
  if (img) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME)
        .then(c => c.match('images/' + img[0]))
        .then(hit => hit || fetch(req))
        .catch(() => new Response('', { status: 503, statusText: 'Offline' }))
    );
    return;
  }

  // فونت‌ها: کش‌اول + به‌روزرسانی در پس‌زمینه
  if (isFontUrl(url)) {
    event.respondWith(
      caches.match(req).then(cached => {
        const net = fetch(req).then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(APP_CACHE_NAME).then(c => c.put(req, copy));
          }
          return res;
        });
        if (cached) { net.catch(() => {}); return cached; }
        return net.catch(() => new Response('', { status: 503, statusText: 'Offline' }));
      })
    );
    return;
  }

  // بقیه (HTML, manifest, آیکون‌ها): Stale-While-Revalidate
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(APP_CACHE_NAME).then(c => c.put(req, copy));
        }
        return res;
      });
      if (cached) { net.catch(() => {}); return cached; }
      return net.catch(async () => {
        if (req.mode === 'navigate') {
          const fallback = await caches.match('./index.html');
          if (fallback) return fallback;
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
