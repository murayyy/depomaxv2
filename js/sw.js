const CACHE_ADI = "depomax-v2";

const STATIK_DOSYALAR = [
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
  "/raf.html",
  "/css/style.css",
  "/favicon.svg",
  "/manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_ADI).then((cache) =>
      // addAll yerine tek tek — biri başarısız olursa diğerleri etkilenmez
      Promise.allSettled(
        STATIK_DOSYALAR.map((url) =>
          fetch(url).then((res) => {
            if (res.ok) cache.put(url, res);
          }).catch(() => {}) // sessizce atla
        )
      )
    )
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
  // Firebase, CDN, harici kaynaklar — ağdan al
  if (
    e.request.url.includes("firestore") ||
    e.request.url.includes("firebase") ||
    e.request.url.includes("googleapis") ||
    e.request.url.includes("gstatic") ||
    e.request.url.includes("unpkg") ||
    e.request.url.includes("cdnjs") ||
    e.request.url.includes("leaflet") ||
    e.request.url.includes("identitytoolkit")
  ) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok && e.request.method === "GET") {
          const klon = res.clone();
          caches.open(CACHE_ADI).then((c) => c.put(e.request, klon));
        }
        return res;
      }).catch(() => caches.match("/index.html")); // fallback
    })
  );
});
