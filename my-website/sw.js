self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('streaming-v1').then((cache) => {
      return cache.addAll(['/', 'index.html', 'css/home.css', 'js/home.js']);
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
