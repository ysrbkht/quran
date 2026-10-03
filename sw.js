const APP_CACHE_NAME = 'quran-app-v5';
const IMAGE_CACHE_NAME = 'quran-cache-v1';

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap',
  'https://cdn.fontcdn.ir/Font/Persian/Vazir/Vazir.css',
  'https://cdn.fontcdn.ir/Font/Persian/Vazir/Vazir.woff2',
  'https://cdn.fontcdn.ir/Font/Persian/Vazir/Vazir.woff',
  'https://cdn.fontcdn.ir/Font/Persian/Vazir/Vazir.ttf'
];

// الگوی تشخیص تصاویر قرآن (هم cache key و هم URL گیت‌هاب)
const QURAN_IMAGE_RE = /Quran\d{3}\.jpg/;

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_CACHE_NAME).then(cache => {
      return Promise.allSettled(
        urlsToCache.map(url =>
          cache.add(url).catch(err => console.log('Failed to cache', url, err))
        )
      );
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.startsWith('quran-app-') && cacheName !== APP_CACHE_NAME) {
            return caches.delete(cacheName);
          }
          // پاک‌سازی کش‌های قدیمی تصاویر (اصلاح #11)
          if (cacheName.startsWith('quran-image-') && cacheName !== IMAGE_CACHE_NAME) {
            return caches.delete(cacheName);
          }
          if (cacheName.startsWith('quran-cache-') && cacheName !== IMAGE_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // تصاویر قرآن: Cache First (اصلاح #2 - شامل URL گیت‌هاب هم می‌شود)
  if (url.includes('images/Quran') || QURAN_IMAGE_RE.test(url)) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) return cachedResponse;

        return fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(IMAGE_CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          // اصلاح #5: پاسخ معتبر برگردان، نه undefined
          return new Response('', { status: 503, statusText: 'Offline' });
        });
      })
    );
    return;
  }

  // فونت‌ها و CSS: Cache First + پس‌زمینه آپدیت
  if (
    url.includes('Vazir') || url.includes('vazirmatn') ||
    url.includes('fontcdn') || url.includes('fonts.googleapis') ||
    url.includes('fonts.gstatic') || url.includes('Amiri')
  ) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(APP_CACHE_NAME).then(cache => {
                cache.put(event.request, networkResponse.clone());
              });
            }
          }).catch(() => {});
          return cachedResponse;
        }
        return fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(APP_CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // سایر (HTML, JS, manifest): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            caches.open(APP_CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse.clone());
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(APP_CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(async () => {
        // اصلاح #5: در صورت آفلاین بودن، همیشه پاسخ معتبر برگردان
        if (event.request.mode === 'navigate') {
          const fallback = await caches.match('./index.html');
          if (fallback) return fallback;
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
