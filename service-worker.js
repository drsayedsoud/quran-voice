/**
 * Service Worker لتطبيق المصحف الصوتي الميسر
 * يتيح العمل أوفلاين وتشغيل الـ PWA بسرعة فائقة
 */

const CACHE_NAME = 'quran-voice-v13';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './admin.html',
  './style.css',
  './app.js',
  './dual-player.js',
  './quran-stories.js',
  './admin.js',
  './gemini-service.js',
  './quran-data.js',
  './voice-engine.js',
  './sound-effects.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // تخزين آمن لجميع الملفات دون تعليق التثبيت إذا فشل ملف فردي
      await Promise.allSettled(
        ASSETS_TO_CACHE.map(async (url) => {
          try {
            const response = await fetch(url, { redirect: 'follow' });
            if (response.ok) {
              await cache.put(url, response);
            }
          } catch (err) {
            console.warn('Service worker precache skipped:', url, err);
          }
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // استثناء طلبات Firebase والمقاطع الصوتية الكبيرة من الكاش الثابت
  if (url.origin.includes('firestore.googleapis.com') || 
      url.origin.includes('firebase') || 
      url.pathname.endsWith('.mp3')) {
    return;
  }

  // معالجة طلبات التنقل بين الصفحات (HTML Navigation)
  // يحل مشكلة Chrome الأمنية: "redirected response was used for a request whose redirect mode is not follow"
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // محاولة جلب أحدث نسخة من الشبكة مع السماح بالتوجيه
          const fetchReq = new Request(event.request.url, {
            method: 'GET',
            headers: event.request.headers,
            credentials: event.request.credentials,
            redirect: 'follow'
          });
          const networkResponse = await fetch(fetchReq);
          if (networkResponse && networkResponse.ok) {
            // تحديث الكاش في الخلفية
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, networkResponse.clone()).catch(() => {});
            return networkResponse;
          }
        } catch (netErr) {
          console.warn('Network navigate failed, serving from cache:', event.request.url);
        }

        // في حال انقطاع الشبكة أو حدوث خطأ، نلجأ للكاش
        const cache = await caches.open(CACHE_NAME);
        const isTargetAdmin = url.pathname.includes('admin');

        if (isTargetAdmin) {
          const cachedAdmin = await cache.match('./admin.html') || 
                              await cache.match('admin.html') || 
                              await cache.match('/admin.html');
          if (cachedAdmin) return cachedAdmin;
        }

        const cachedIndex = await cache.match('./index.html') || 
                            await cache.match('index.html') || 
                            await cache.match('./') || 
                            await cache.match('/');
        if (cachedIndex) return cachedIndex;

        return fetch(event.request);
      })()
    );
    return;
  }

  // لبقية الموارد الثابتة (JS, CSS, SVGs, Fonts)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache).catch(() => {});
        });
        return networkResponse;
      }).catch((err) => {
        console.warn('Fetch fallback failed for:', event.request.url);
      });
    })
  );
});
