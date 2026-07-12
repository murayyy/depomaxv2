// ============================================================================
// SÜRÜCÜ TESLİMAT EKRANI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { surucuSiparisleriDinle, urunleriniGetir } from "./veri.js";
import { arayuzHazirla, toast, kacisEt, sayiBicimle, tarihBicimle } from "./utils.js";

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

/* ---- Haversine mesafesi (km) ---- */
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

/* ---- Google Maps URL (optimize edilmiş rota) ---- */
function googleMapsUrl(baslangicLat, baslangicLng, rotaDuraklar) {
  const origin = `${baslangicLat},${baslangicLng}`;
  const son = rotaDuraklar[rotaDuraklar.length - 1];
  const destination = son.lat ? `${son.lat},${son.lng}` : encodeURIComponent(son.adres || son.subeAdi);
  const waypoints = rotaDuraklar.slice(0, -1).map((d) =>
    d.lat ? `${d.lat},${d.lng}` : encodeURIComponent(d.adres || d.subeAdi)
  ).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ""}&travelmode=driving`;
}

/* ---- En İyi Rotayı Bul butonu ---- */
document.getElementById("rotaBulBtn").addEventListener("click", () => {
  const coordluSiparisler = siparisListesi.filter(
    (s) => s.durum === "sevk_edildi" && s.lat && s.lng
  );
  const koordinatsiz = siparisListesi.filter(
    (s) => s.durum === "sevk_edildi" && (!s.lat || !s.lng)
  );

  if (siparisListesi.filter(s => s.durum === "sevk_edildi").length === 0) {
    toast("Bekleyen teslimat yok.", "error"); return;
  }
  if (coordluSiparisler.length === 0) {
    toast("Şubelere koordinat girilmemiş. Admin panelinden şube profillerine enlem/boylam ekleyin.", "error");
    return;
  }
  if (coordluSiparisler.length < siparisListesi.filter(s => s.durum === "sevk_edildi").length) {
    toast(`Uyarı: ${koordinatsiz.length} şubenin koordinatı yok, rota sadece koordinatlı şubeler için hesaplanacak.`, "info", 4000);
  }

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const rota = optimizeRoute(lat, lng, coordluSiparisler);
      const url = googleMapsUrl(lat, lng, rota);

      // Sıralamalı listeyi göster
      const ozet = rota.map((s, i) =>
        `${i+1}. ${kacisEt(s.subeAdi || s.ad)}${s.adres ? " — " + kacisEt(s.adres) : ""}`
      ).join("\n");
      toast(`✅ Rota hazır! ${rota.length} durak.\n${ozet}`, "success", 8000);
      window.open(url, "_blank");
    }, () => {
      toast("Konum alınamadı. Tarayıcıda konum iznini açın.", "error");
    });
  } else {
    toast("Bu tarayıcı konum desteklemiyor.", "error");
  }
});

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

  const bekleyen = liste.filter((s) => s.durum === "sevk_edildi").length;
  const teslim = liste.filter((s) => s.durum === "teslim_edildi").length;
  const toplamPalet = liste.reduce((t, s) => t + (Number(s.paletSayisi) || 0), 0);
  document.getElementById("ozetYazi").textContent =
    `${liste.length} teslimat — ${bekleyen} bekliyor, ${teslim} teslim edildi · ${toplamPalet} palet`;

  // Önce bekleyenler, sonra teslim edilenler
  const sirali = [
    ...liste.filter(s => s.durum === "sevk_edildi"),
    ...liste.filter(s => s.durum === "teslim_edildi")
  ];

  kapsayici.innerHTML = sirali.map((s, idx) => {
    const teslimEdildi = s.durum === "teslim_edildi";
    const rozet = teslimEdildi
      ? '<span class="badge badge-green">✅ Teslim Edildi</span>'
      : `<span class="badge badge-amber">⏳ ${idx + 1}. Sıra</span>`;
    const navUrl = s.lat && s.lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=driving`
      : s.adres
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.adres)}&travelmode=driving`
      : null;

    return `
      <div class="card order-card" data-id="${s.id}">
        <div class="order-card__main">
          <div class="order-card__name">${kacisEt(s.subeAdi || s.ad)}</div>
          <div class="order-card__meta">
            ${rozet}
            ${s.paletSayisi ? `<span>📦 ${s.paletSayisi} palet</span>` : ""}
            ${s.toplamKg ? `<span>⚖ ${sayiBicimle(s.toplamKg)} KG</span>` : ""}
          </div>
          ${s.adres ? `<div style="font-size:12.5px;color:var(--color-ink-soft);margin-top:4px;">📍 ${kacisEt(s.adres)}</div>` : ""}
          ${s.telefon ? `<div style="font-size:12.5px;color:var(--color-ink-soft);">📞 <a href="tel:${kacisEt(s.telefon)}" style="color:inherit;">${kacisEt(s.telefon)}</a></div>` : ""}
        </div>
        <div class="order-card__actions" style="flex-wrap:wrap;gap:6px;">
          ${navUrl ? `<a href="${navUrl}" target="_blank" class="btn btn-blue btn-sm">🗺 Navigasyon</a>` : ""}
          <button class="btn btn-ghost btn-sm" data-detay="${s.id}">Ürünleri Gör</button>
        </div>
      </div>`;
  }).join("");

  kapsayici.querySelectorAll("[data-detay]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await detayGoster(sirali.find((x) => x.id === btn.dataset.detay));
    });
  });
}

async function detayGoster(siparis) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="empty-state__icon">⏳</div><p>Yükleniyor…</p></div></div>`;
  try {
    let satirlar;
    if (siparis.durum === "teslim_edildi" && siparis.teslimatKalemleri?.length) {
      satirlar = siparis.teslimatKalemleri.map((k) => ({
        ad: k.ad, kod: k.kod, birim: k.birim,
        siparisMiktari: k.siparisMiktari, gelenMiktar: k.gelenMiktar, durum: k.durum
      }));
    } else {
      const urunler = await urunleriniGetir(siparis.id);
      satirlar = urunler.map((u) => ({
        ad: u.ad, kod: u.kod, birim: u.birim,
        siparisMiktari: u.miktar, gelenMiktar: null, durum: null
      }));
    }

    const teslimEdildi = siparis.durum === "teslim_edildi";
    const mobil = window.innerWidth <= 720;

    const satirHtml = satirlar.map((s) => {
      const durumRozet = !s.durum ? "" :
        s.durum === "tamam" ? '<span class="badge badge-green">✅</span>' :
        s.durum === "eksik" ? '<span class="badge badge-red">⚠ Eksik</span>' :
        '<span class="badge badge-blue">➕ Fazla</span>';
      return mobil ? `
        <div class="row-card" style="margin-bottom:8px;">
          <div class="row-card__top">
            <div>
              <div class="row-card__name">${kacisEt(s.ad)}</div>
              <div class="row-card__code">${kacisEt(s.kod || "—")} · ${sayiBicimle(s.siparisMiktari || 0)} ${kacisEt(s.birim || "")}</div>
            </div>
            ${durumRozet}
          </div>
          ${teslimEdildi && s.gelenMiktar !== null ? `<div class="u-text-soft" style="font-size:12px;">Gelen: ${sayiBicimle(s.gelenMiktar)} ${kacisEt(s.birim || "")}</div>` : ""}
        </div>` :
        `<tr>
          <td class="cell-code">${kacisEt(s.kod || "—")}</td>
          <td>${kacisEt(s.ad)}</td>
          <td>${sayiBicimle(s.siparisMiktari || 0)}</td>
          ${teslimEdildi ? `<td>${sayiBicimle(s.gelenMiktar || 0)}</td>` : ""}
          <td>${kacisEt(s.birim || "")}</td>
          ${durumRozet ? `<td>${durumRozet}</td>` : ""}
        </tr>`;
    }).join("");

    root.innerHTML = `
      <div class="modal-backdrop" data-role="backdrop">
        <div class="modal" style="max-width:520px;">
          <h3>${kacisEt(siparis.subeAdi || siparis.ad)}</h3>
          <p>
            ${siparis.paletSayisi ? `<span class="badge badge-blue">${siparis.paletSayisi} palet</span>` : ""}
            ${siparis.toplamKg ? `<span class="badge badge-gray">${sayiBicimle(siparis.toplamKg)} KG</span>` : ""}
            ${teslimEdildi ? '<span class="badge badge-green">✅ Teslim Edildi</span>' : '<span class="badge badge-amber">⏳ Bekliyor</span>'}
          </p>
          ${siparis.adres ? `<p style="font-size:13px;">📍 ${kacisEt(siparis.adres)}</p>` : ""}
          ${siparis.telefon ? `<p style="font-size:13px;">📞 <a href="tel:${kacisEt(siparis.telefon)}">${kacisEt(siparis.telefon)}</a></p>` : ""}
          ${mobil
            ? `<div style="max-height:60vh;overflow-y:auto;margin-top:12px;">${satirHtml}</div>`
            : `<div style="overflow-x:auto;margin-top:12px;">
                <table class="data-table">
                  <thead><tr>
                    <th>Kod</th><th>Ürün</th><th>Sipariş</th>
                    ${teslimEdildi ? "<th>Gelen</th>" : ""}
                    <th>Birim</th>
                    ${teslimEdildi ? "<th>Durum</th>" : ""}
                  </tr></thead>
                  <tbody>${satirHtml}</tbody>
                </table>
              </div>`}
          <div class="modal__actions">
            <button class="btn btn-primary" data-role="kapat">Kapat</button>
          </div>
        </div>
      </div>`;

    root.querySelector('[data-role="kapat"]').onclick = () => { root.innerHTML = ""; };
    root.querySelector('[data-role="backdrop"]').onclick = (e) => {
      if (e.target === root.querySelector('[data-role="backdrop"]')) root.innerHTML = "";
    };
  } catch (err) {
    console.error(err);
    toast("Detaylar yüklenemedi.", "error");
    root.innerHTML = "";
  }
}
