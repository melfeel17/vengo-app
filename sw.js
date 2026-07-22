const CACHE_NAME = 'vengo-app-v11';

// الملفات الثابتة
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icon-v2.svg',
  '/icon.jpg',
  'https://fonts.googleapis.com/css2?family=Alexandria:wght@300;400;500;600;700;800&family=Cairo:wght@400;600;700;800&family=Outfit:wght@400;500;600;700&display=swap'
];

// تثبيت: تحميل الملفات الثابتة في الكاش وحذف الانتظار
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// تفعيل: حذف جميع الكاشات القديمة فوراً والتأثير على كل السلسلة
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// استراتيجية ذكية: Network-First للكود (HTML, JS, CSS) لضمان التحديث الفوري، و Cache-First للصور والخطوط
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isCodeAsset = url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css');

  if (isCodeAsset) {
    // Network-First: تجربة السيرفر أولاً للحصول على أحدث تعديل، مع الرجوع للكاش عند عدم وجود إنترنت
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('/index.html')))
    );
  } else {
    // Cache-First للصور والخطوط والوسائط (للسرعة)
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});
