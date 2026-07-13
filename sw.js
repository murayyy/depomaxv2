// Depomax Service Worker
// Statik dosyaları önbelleğe alır — Firebase verileri zaten Firestore
// offline persistence ile kendi önbelleğini yönetiyor.

const CACHE_ADI = "depomax-v1";
const STATIK_DOSYALAR = [
  "/",
  "/index.html",
  "/toplama.html",
  "/kontrol.html",
  "/sube.html",
  "/sube-gecmis.html",
  "/eksikler.html",
  "/performans.html",
  "/admin.html",
  "/surucu.html",
  "/subeler.html",
  "/css/style.css",
  "/favicon.svg",
  "/manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_ADI).then((cache) => cache.addAll(STATIK_DOSYALAR))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_ADI).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Firebase, Google Fonts, CDN istekleri — ağdan al, önbelleğe alma
  if (
    e.request.url.includes("firestore") ||
    e.request.url.includes("firebase") ||
    e.request.url.includes("googleapis") ||
    e.request.url.includes("gstatic") ||
    e.request.url.includes("unpkg") ||
    e.request.url.includes("cdnjs") ||
    e.request.url.includes("leaflet")
  ) {
    return;
  }

  // Statik dosyalar: önce önbellekten, sonra ağdan
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        if (response.ok && e.request.method === "GET") {
          const klon = response.clone();
          caches.open(CACHE_ADI).then((cache) => cache.put(e.request, klon));
        }
        return response;
      });
    })
  );
});
