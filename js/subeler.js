// ============================================================================
// ŞUBE HARİTASI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { tumSiparisleriGetir } from "./veri.js";
import { arayuzHazirla, toast, kacisEt, sayiBicimle, tarihBicimle } from "./utils.js";

// Firestore'dan doğrudan kullanıcı listesi için
import { db } from "./firebase.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

arayuzHazirla();

let harita = null;
let markerlar = [];

sayfaKorumasi(["admin"], (kullanici) => {
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  haritaBaslat();
  yukle();
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

document.getElementById("yenileBtn").addEventListener("click", yukle);

function haritaBaslat() {
  harita = L.map("harita").setView([39.5, 35.0], 6); // Türkiye merkezi
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
  }).addTo(harita);

  // Lejant
  const lejant = L.control({ position: "bottomright" });
  lejant.onAdd = () => {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = `
      <b style="font-size:12px;">Sipariş Durumu</b><br>
      <span class="legend-dot" style="background:#9CA3AF;"></span> Aktif sipariş yok<br>
      <span class="legend-dot" style="background:#F59E0B;"></span> Hazırlanıyor / Kontrolde<br>
      <span class="legend-dot" style="background:#3B82F6;"></span> Yolda<br>
      <span class="legend-dot" style="background:#10B981;"></span> Teslim Alındı<br>
      <span class="legend-dot" style="background:#EF4444;"></span> Uyuşmazlık`;
    return div;
  };
  lejant.addTo(harita);
}

// Duruma göre renk ve etiket
function durumBilgisi(sonSiparis) {
  if (!sonSiparis) return { renk: "#9CA3AF", etiket: "Sipariş yok", bg: "#F3F4F6", fg: "#6B7280" };
  const d = sonSiparis.durum;
  if (sonSiparis.merkezdegerlendirmesi === "tekrar_kontrol")
    return { renk: "#EF4444", etiket: "⚠ Uyuşmazlık", bg: "#FEE2E2", fg: "#B91C1C" };
  if (d === "teslim_edildi")
    return { renk: "#10B981", etiket: "✅ Teslim Alındı", bg: "#D1FAE5", fg: "#065F46" };
  if (d === "sevk_edildi")
    return { renk: "#3B82F6", etiket: "🚚 Yolda", bg: "#DBEAFE", fg: "#1D4ED8" };
  if (["tamamlandi", "kontrol_ediliyor", "toplandi"].includes(d))
    return { renk: "#F59E0B", etiket: "🔍 Kontrolde", bg: "#FEF3C7", fg: "#B45309" };
  if (d === "toplaniyor")
    return { renk: "#F59E0B", etiket: "⏳ Hazırlanıyor", bg: "#FEF3C7", fg: "#B45309" };
  return { renk: "#9CA3AF", etiket: d, bg: "#F3F4F6", fg: "#6B7280" };
}

function markerIkonu(renk) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:28px;height:28px;border-radius:50% 50% 50% 0;
      background:${renk};border:2px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,.35);
      transform:rotate(-45deg);
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  });
}

async function yukle() {
  document.getElementById("ozetYazi").textContent = "Yükleniyor…";

  // Şubeleri getir
  let subeler = [];
  try {
    const snap = await getDocs(query(collection(db, "kullanicilar"), where("rol", "==", "sube")));
    subeler = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  } catch (e) { toast("Şubeler yüklenemedi.", "error"); return; }

  // Siparişleri getir
  let siparisler = [];
  try { siparisler = await tumSiparisleriGetir(); } catch (e) {}

  // Son 7 gün sınırı
  const yediGunOnce = Date.now() - 7 * 24 * 3600 * 1000;

  // Eski markerları temizle
  markerlar.forEach(m => m.remove());
  markerlar = [];

  let koordinatliSube = 0;
  const bounds = [];

  subeler.forEach(sube => {
    // Bu şubenin son aktif siparişi
    const subeSimp = siparisler
      .filter(s => s.subeId === sube.uid)
      .sort((a, b) => (b.olusturulmaTarihi?.toMillis?.() || 0) - (a.olusturulmaTarihi?.toMillis?.() || 0));

    const aktifSiparis = subeSimp.find(s => !["arsivlendi"].includes(s.durum));
    const sonSiparis = subeSimp.find(s =>
      s.durum === "teslim_edildi" &&
      s.teslimatTarihi?.toMillis?.() > yediGunOnce
    ) || aktifSiparis;

    const { renk, etiket, bg, fg } = durumBilgisi(sonSiparis);

    // Koordinat yoksa listede göster, haritada değil
    if (!sube.lat || !sube.lng) return;
    koordinatliSube++;
    bounds.push([sube.lat, sube.lng]);

    const toplam = subeSimp.length;
    const popup = `
      <div class="popup-baslik">${kacisEt(sube.subeAdi || sube.ad)}</div>
      <span class="popup-rozet" style="background:${bg};color:${fg};">${etiket}</span>
      ${sube.adres ? `<div class="popup-meta">📍 ${kacisEt(sube.adres)}</div>` : ""}
      ${sube.telefon ? `<div class="popup-meta">📞 ${kacisEt(sube.telefon)}</div>` : ""}
      ${sonSiparis ? `
        <div class="popup-meta" style="margin-top:6px;border-top:1px solid #eee;padding-top:6px;">
          <b>Son Sipariş:</b> ${kacisEt(sonSiparis.ad || "")}<br>
          ${sonSiparis.paletSayisi ? `📦 ${sonSiparis.paletSayisi} palet &nbsp;` : ""}
          ${sonSiparis.toplamKg ? `⚖ ${sayiBicimle(sonSiparis.toplamKg)} KG` : ""}
          ${sonSiparis.olusturulmaTarihi ? `<br>${tarihBicimle(sonSiparis.olusturulmaTarihi)}` : ""}
        </div>` : ""}
      <div class="popup-meta" style="margin-top:4px;">Toplam ${toplam} sipariş geçmişi</div>`;

    const marker = L.marker([sube.lat, sube.lng], { icon: markerIkonu(renk) })
      .bindPopup(popup)
      .addTo(harita);
    markerlar.push(marker);
  });

  // Haritayı tüm markerlara sığdır
  if (bounds.length > 0) {
    harita.fitBounds(bounds, { padding: [40, 40] });
  }

  const koordinatsiz = subeler.length - koordinatliSube;
  document.getElementById("ozetYazi").textContent =
    `${subeler.length} şube — ${koordinatliSube} haritada gösteriliyor${koordinatsiz ? `, ${koordinatsiz} koordinatsız` : ""}`;
}
