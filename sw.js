const APP_CACHE_NAME = 'quran-app-v3'; 
const IMAGE_CACHE_NAME = 'quran-cache-v1';

// فایل‌های ضروری برای اجرای آفلاین (شامل فونت‌های Google و Vazir)
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  // فونت وزیرمتن از Google Fonts (فایل CSS)
  'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap',
  // فونت وزیر (پشتیبان)
  'https://cdn.fontcdn.ir/Font/Persian/Vazir/Vazir.css',
  'https://cdn.fontcdn.ir/Font/Persian/Vazir/Vazir.woff2',
  'https://cdn.fontcdn.ir/Font/Persian/Vazir/Vazir.woff',
  'https://cdn.fontcdn.ir/Font/Persian/Vazir/Vazir.ttf'
];

self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(APP_CACHE_NAME)
      .then(cache => {
        console.log('App shell and fonts caching started');
        // استفاده از allSettled تا اگر یک فونت failed، بقیه مراحل متوقف نشوند
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
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // برای تصاویر قرآن: ابتدا کش، سپس نتورک (Cache First)
  if (url.includes('images/Quran')) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        return cachedResponse || fetch(event.request);
      })
    );
  } 
  // برای فونت‌ها و CSS مربوطه: استراتژی Cache First (ابتدا کش، سپس نتورک)
  else if (url.includes('Vazir') || url.includes('vazirmatn') || url.includes('fontcdn') || url.includes('fonts.googleapis')) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          // اگر در کش بود، همان را برگردان و در پس‌زمینه آپدیت کن
          fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(APP_CACHE_NAME).then(cache => {
                cache.put(event.request, networkResponse.clone());
              });
            }
          }).catch(() => {});
          return cachedResponse;
        }
        // اگر در کش نبود، از شبکه بگیر و کش کن
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
  }
  // سایر درخواست‌ها (مثل index.html, manifest.json): استراتژی Stale-While-Revalidate
  else {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          // اگر در کش بود، نسخه کش را برگردان و در پس‌زمینه به‌روزرسانی کن
          fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
               caches.open(APP_CACHE_NAME).then(cache => {
                 cache.put(event.request, networkResponse.clone());
               });
            }
          }).catch(() => {});
          return cachedResponse;
        }
        
        // اگر در کش نبود، از شبکه بگیر و کش کن
        return fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(APP_CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(async () => {
          // اگر شبکه قطع بود و درخواست ناوبری بود، index.html را برگردان
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          // در غیر این صورت، اجازه بده درخواست fail شود
        });
      })
    );
  }
});
