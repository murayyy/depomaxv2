// ============================================================================
// SÜRÜCÜ TESLİMAT EKRANI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { surucuSiparisleriDinle, siparisGuncelle } from "./veri.js";
import { arayuzHazirla, toast, kacisEt, sayiBicimle } from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;
let siparisListesi = [];

sayfaKorumasi(["surucu"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("plakaEtiketi").textContent = kullanici.plaka || "Sürücü";
  surucuSiparisleriDinle(kullanici.uid, (liste) => {
    siparisListesi = liste;
    renderSiparisler(liste);
  });
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

/* ---- Haversine ---- */
function mesafe(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/* ---- Nearest-Neighbor TSP ---- */
function optimizeRoute(baslangicLat, baslangicLng, duraklar) {
  const kalan = [...duraklar];
  const rota = [];
  let curLat = baslangicLat, curLng = baslangicLng;
  while (kalan.length) {
    let minDist = Infinity, minIdx = 0;
    kalan.forEach((d, i) => {
      const dist = mesafe(curLat, curLng, d.lat, d.lng);
      if (dist < minDist) { minDist = dist; minIdx = i; }
    });
    rota.push(kalan[minIdx]);
    curLat = kalan[minIdx].lat; curLng = kalan[minIdx].lng;
    kalan.splice(minIdx, 1);
  }
  return rota;
}

/* ---- Google Maps URL ---- */
function googleMapsUrl(baslangicLat, baslangicLng, rotaDuraklar) {
  const origin = `${baslangicLat},${baslangicLng}`;
  const son = rotaDuraklar[rotaDuraklar.length - 1];
  const destination = son.lat ? `${son.lat},${son.lng}` : encodeURIComponent(son.adres || son.subeAdi);
  const waypoints = rotaDuraklar.slice(0, -1).map((d) =>
    d.lat ? `${d.lat},${d.lng}` : encodeURIComponent(d.adres || d.subeAdi)
  ).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ""}&travelmode=driving`;
}

/* ---- Sıralamayı Firestore'a kaydet ---- */
async function siralamayiKaydet(siraliListe) {
  await Promise.all(siraliListe.map((s, idx) =>
    siparisGuncelle(s.id, { teslimatSirasi: idx + 1 })
  ));
}

/* ---- Sırayı değiştir (yukarı/aşağı) ---- */
async function siraDegistir(siparisId, yon) {
  const bekleyenler = siparisListesi
    .filter(s => s.durum === "sevk_edildi")
    .sort((a, b) => (a.teslimatSirasi || 999) - (b.teslimatSirasi || 999));
  const idx = bekleyenler.findIndex(s => s.id === siparisId);
  if (idx === -1) return;
  const hedefIdx = yon === "yukari" ? idx - 1 : idx + 1;
  if (hedefIdx < 0 || hedefIdx >= bekleyenler.length) return;

  // Swap
  [bekleyenler[idx], bekleyenler[hedefIdx]] = [bekleyenler[hedefIdx], bekleyenler[idx]];
  await siralamayiKaydet(bekleyenler);
  toast("Sıra güncellendi.", "success", 1500);
}

/* ---- En İyi Rotayı Bul ---- */
document.getElementById("rotaBulBtn").addEventListener("click", () => {
  const bekleyenler = siparisListesi.filter(s => s.durum === "sevk_edildi");
  if (bekleyenler.length === 0) { toast("Bekleyen teslimat yok.", "error"); return; }

  const coordlu = bekleyenler.filter(s => s.lat && s.lng);
  if (coordlu.length === 0) {
    toast("Şubelere koordinat girilmemiş. Admin panelinden ekleyin.", "error"); return;
  }
  if (coordlu.length < bekleyenler.length) {
    toast(`Uyarı: ${bekleyenler.length - coordlu.length} şubenin koordinatı yok.`, "info", 4000);
  }

  navigator.geolocation?.getCurrentPosition(async (pos) => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    const rota = optimizeRoute(lat, lng, coordlu);

    // Firestore'daki sıralamayı güncelle
    await siralamayiKaydet(rota);

    // Google Maps'i aç
    const url = googleMapsUrl(lat, lng, rota);
    window.open(url, "_blank");
    toast(`✅ Rota optimize edildi ve kaydedildi. ${rota.length} durak.`, "success", 5000);
  }, () => { toast("Konum alınamadı. Tarayıcıda konum iznini açın.", "error"); });
});

/* ---- Render ---- */
function renderSiparisler(liste) {
  const kapsayici = document.getElementById("siparisList");
  const bos = document.getElementById("bosDurum");

  if (liste.length === 0) {
    kapsayici.innerHTML = "";
    bos.classList.remove("u-hidden");
    document.getElementById("ozetYazi").textContent = "Atanmış teslimat yok.";
    return;
  }
  bos.classList.add("u-hidden");

  const bekleyen = liste.filter(s => s.durum === "sevk_edildi").length;
  const teslim = liste.filter(s => s.durum === "teslim_edildi").length;
  const toplamPalet = liste.reduce((t, s) => t + (Number(s.paletSayisi) || 0), 0);
  document.getElementById("ozetYazi").textContent =
    `${liste.length} teslimat — ${bekleyen} bekliyor, ${teslim} teslim edildi · ${toplamPalet} palet`;

  const sirali = [
    ...liste.filter(s => s.durum === "sevk_edildi")
      .sort((a, b) => (a.teslimatSirasi || 999) - (b.teslimatSirasi || 999)),
    ...liste.filter(s => s.durum === "teslim_edildi")
  ];
  const bekleyenSirali = sirali.filter(s => s.durum === "sevk_edildi");

  kapsayici.innerHTML = sirali.map((s, idx) => {
    const teslimEdildi = s.durum === "teslim_edildi";
    const siraNo = teslimEdildi ? null : (s.teslimatSirasi || idx + 1);
    const rozet = teslimEdildi
      ? '<span class="badge badge-green">✅ Teslim Edildi</span>'
      : `<span class="badge badge-amber">⏳ ${siraNo}. Durak</span>`;
    const navUrl = s.lat && s.lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=driving`
      : s.adres
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.adres)}&travelmode=driving`
      : null;

    const siraPos = bekleyenSirali.findIndex(x => x.id === s.id);
    const yukariVar = !teslimEdildi && siraPos > 0;
    const asagiVar = !teslimEdildi && siraPos < bekleyenSirali.length - 1;

    return `
      <div class="card order-card" data-id="${s.id}">
        <div style="display:flex;align-items:center;gap:10px;">
          ${!teslimEdildi ? `
            <div style="display:flex;flex-direction:column;gap:4px;">
              <button class="btn btn-ghost btn-sm" data-yukari="${s.id}" ${yukariVar ? "" : "disabled"} style="padding:2px 8px;font-size:16px;">▲</button>
              <button class="btn btn-ghost btn-sm" data-asagi="${s.id}" ${asagiVar ? "" : "disabled"} style="padding:2px 8px;font-size:16px;">▼</button>
            </div>` : ""}
          <div class="order-card__main" style="flex:1;">
            <div class="order-card__name">${kacisEt(s.subeAdi || s.ad)}</div>
            <div class="order-card__meta">
              ${rozet}
              ${s.paletSayisi ? `<span>📦 ${s.paletSayisi} palet</span>` : ""}
              ${s.toplamKg ? `<span>⚖ ${sayiBicimle(s.toplamKg)} KG</span>` : ""}
            </div>
            ${s.adres ? `<div style="font-size:12.5px;color:var(--color-ink-soft);margin-top:4px;">📍 ${kacisEt(s.adres)}</div>` : ""}
            ${s.telefon ? `<div style="font-size:12.5px;color:var(--color-ink-soft);">📞 <a href="tel:${kacisEt(s.telefon)}" style="color:inherit;">${kacisEt(s.telefon)}</a></div>` : ""}
          </div>
        </div>
        <div class="order-card__actions" style="flex-wrap:wrap;gap:6px;margin-top:8px;">
          ${navUrl ? `<a href="${navUrl}" target="_blank" class="btn btn-blue btn-sm">🗺 Navigasyon</a>` : ""}
        </div>
      </div>`;
  }).join("");

  // ▲▼ buton event'leri
  kapsayici.querySelectorAll("[data-yukari]").forEach(btn => {
    btn.addEventListener("click", () => siraDegistir(btn.dataset.yukari, "yukari"));
  });
  kapsayici.querySelectorAll("[data-asagi]").forEach(btn => {
    btn.addEventListener("click", () => siraDegistir(btn.dataset.asagi, "asagi"));
  });
}
