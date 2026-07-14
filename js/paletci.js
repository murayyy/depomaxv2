// ============================================================================
// PALETÇİ EKRANI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { siparisleriDinle, urunleriniGetir, siparisGuncelle } from "./veri.js";
import { arayuzHazirla, toast, onayIste, kacisEt, sayiBicimle, ondalikOku } from "./utils.js";
import { db } from "./firebase.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

arayuzHazirla();

let mevcutKullanici = null;
let aktifSiparis = null;
let aktifUrunler = [];
let paletler = []; // [{ no, urunler: [{ad, miktar, birim, barkod}] }]
let yardimcilar = []; // [{uid, ad}]
let tumKullanicilar = [];

sayfaKorumasi(["paletci", "admin"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  // Kontrol aşamasındaki siparişleri dinle
  siparisleriDinle(["toplandi", "kontrol_ediliyor"], renderListe);
  // Tüm kullanıcıları yükle (yardımcı seçimi için)
  getDocs(collection(db, "kullanicilar")).then((snap) => {
    tumKullanicilar = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  });
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth); window.location.href = "index.html";
});
document.getElementById("geriBtn").addEventListener("click", geriDon);
document.getElementById("yeniPaletBtn").addEventListener("click", yeniPaletEkle);
document.getElementById("tamamlaBtn").addEventListener("click", tamamla);

/* ---- Liste ---- */
function renderListe(liste) {
  const kapsayici = document.getElementById("siparisList");
  const bos = document.getElementById("bosDurum");
  if (liste.length === 0) { kapsayici.innerHTML = ""; bos.classList.remove("u-hidden"); return; }
  bos.classList.add("u-hidden");
  kapsayici.innerHTML = liste.map((s) => `
    <div class="card order-card">
      <div class="order-card__main">
        <div class="order-card__name">${kacisEt(s.ad)}</div>
        <div class="order-card__meta">
          <span class="badge badge-amber">⏳ Kontrolde</span>
          <span>${s.toplamUrun || 0} ürün</span>
          ${s.paletSayisi ? `<span>${s.paletSayisi} palet</span>` : ""}
        </div>
      </div>
      <div class="order-card__actions">
        <button class="btn btn-primary btn-sm" data-ac="${s.id}">Paleti Başlat →</button>
      </div>
    </div>`).join("");
  kapsayici.querySelectorAll("[data-ac]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const siparis = liste.find((s) => s.id === btn.dataset.ac);
      siparisAc(siparis);
    });
  });
}

/* ---- Sipariş aç ---- */
async function siparisAc(siparis) {
  aktifSiparis = siparis;
  paletler = siparis.paletVerisi || [{ no: 1, urunler: [] }];
  yardimcilar = siparis.paletYardimcilar || [];
  aktifUrunler = await urunleriniGetir(siparis.id);
  document.getElementById("detayBaslik").textContent = siparis.ad;
  document.getElementById("detayMeta").textContent = `${aktifUrunler.length} ürün · ${aktifUrunler.reduce((t, u) => t + (Number(u.miktar) || 0), 0).toFixed(1)} birim`;
  document.getElementById("listeGorunumu").classList.add("u-hidden");
  document.getElementById("detayGorunumu").classList.remove("u-hidden");
  renderYardimcilar();
  renderPaletler();
}

function geriDon() {
  aktifSiparis = null; paletler = []; yardimcilar = [];
  document.getElementById("detayGorunumu").classList.add("u-hidden");
  document.getElementById("listeGorunumu").classList.remove("u-hidden");
  document.getElementById("aiSonuc").classList.add("u-hidden");
  document.getElementById("fotografImg").style.display = "none";
}

/* ---- Yardımcılar ---- */
function renderYardimcilar() {
  const liste = document.getElementById("yardimciListesi");
  liste.innerHTML = yardimcilar.length === 0
    ? '<span style="font-size:12px;color:var(--color-ink-soft);">Yardımcı eklenmedi</span>'
    : yardimcilar.map((y) => `
        <span style="display:inline-flex;align-items:center;gap:6px;background:var(--color-surface-2);border-radius:99px;padding:4px 12px;font-size:12.5px;">
          👤 ${kacisEt(y.ad)}
          <button onclick="this.parentElement.remove()" data-uid="${y.uid}" data-cikaryardimci style="background:none;border:none;cursor:pointer;font-size:14px;color:#999;">✕</button>
        </span>`).join("");
  liste.querySelectorAll("[data-cikaryardimci]").forEach((btn) => {
    btn.addEventListener("click", () => {
      yardimcilar = yardimcilar.filter((y) => y.uid !== btn.dataset.uid);
      renderYardimcilar();
    });
  });
}

document.getElementById("yardimciEkleBtn").addEventListener("click", () => {
  const root = document.getElementById("modalRoot");
  const secenekler = tumKullanicilar
    .filter((u) => u.uid !== mevcutKullanici.uid && !yardimcilar.find((y) => y.uid === u.uid))
    .map((u) => `<option value="${u.uid}">${kacisEt(u.ad || u.eposta)} (${u.rol})</option>`).join("");
  if (!secenekler) { toast("Eklenecek başka kullanıcı yok.", "info"); return; }
  root.innerHTML = `
    <div class="modal-backdrop" data-role="arka">
      <div class="modal">
        <h3>Yardımcı Ekle</h3>
        <select class="select" id="yardimciSec">${secenekler}</select>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="ekle">Ekle</button>
        </div>
      </div>
    </div>`;
  root.querySelector('[data-role="iptal"]').onclick = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="arka"]').onclick = (e) => { if (e.target.dataset.role === "arka") root.innerHTML = ""; };
  root.querySelector('[data-role="ekle"]').onclick = () => {
    const uid = document.getElementById("yardimciSec").value;
    const kullanici = tumKullanicilar.find((u) => u.uid === uid);
    if (kullanici) { yardimcilar.push({ uid, ad: kullanici.ad || kullanici.eposta }); renderYardimcilar(); }
    root.innerHTML = "";
  };
});

/* ---- Paletler ---- */
function renderPaletler() {
  const liste = document.getElementById("paletListesi");
  const hedefSec = document.getElementById("hedefPaletSec");
  hedefSec.innerHTML = '<option value="">Palet seç…</option>' +
    paletler.map((p) => `<option value="${p.no}">Palet ${p.no}</option>`).join("");
  liste.innerHTML = paletler.map((p) => `
    <div class="palet-kart" id="palet-${p.no}">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div class="palet-no">Palet ${p.no}</div>
        <div style="font-size:12px;color:var(--color-ink-soft);">
          ${p.urunler.length} ürün çeşidi ·
          ${p.urunler.reduce((t, u) => t + (Number(u.miktar) || 0), 0).toFixed(1)} birim
        </div>
      </div>
      ${p.urunler.length > 0 ? `
        <div class="palet-urun-liste">
          ${p.urunler.map((u, ui) => `
            <div class="palet-urun-satir">
              <span>${kacisEt(u.ad)}</span>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-weight:600;">${sayiBicimle(u.miktar)} ${kacisEt(u.birim || "")}</span>
                <button class="btn btn-danger btn-sm" data-palet="${p.no}" data-ui="${ui}">✕</button>
              </div>
            </div>`).join("")}
        </div>` : `<div style="font-size:12px;color:var(--color-ink-soft);margin-top:6px;">Henüz ürün yok</div>`}
    </div>`).join("");

  // Silme butonları
  liste.querySelectorAll("[data-palet][data-ui]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const palet = paletler.find((p) => p.no == btn.dataset.palet);
      if (palet) { palet.urunler.splice(Number(btn.dataset.ui), 1); renderPaletler(); }
    });
  });
}

function yeniPaletEkle() {
  const no = paletler.length > 0 ? Math.max(...paletler.map((p) => p.no)) + 1 : 1;
  paletler.push({ no, urunler: [] });
  renderPaletler();
  toast(`Palet ${no} eklendi.`, "success", 1500);
}

/* ---- Barkod ile ürün ekleme ---- */
document.getElementById("barkodInput").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const kod = e.target.value.trim();
  e.target.value = "";
  if (!kod) return;
  const paletNo = parseInt(document.getElementById("hedefPaletSec").value);
  if (!paletNo) { toast("Önce bir palet seçin.", "error"); return; }
  const urun = aktifUrunler.find((u) => u.barkod && u.barkod.trim() === kod);
  if (!urun) { toast(`Barkod bulunamadı: ${kod}`, "error"); return; }
  const palet = paletler.find((p) => p.no === paletNo);
  const mevcut = palet.urunler.find((u) => u.barkod === kod);
  if (mevcut) {
    mevcut.miktar = (parseFloat(mevcut.miktar) || 0) + 1;
  } else {
    palet.urunler.push({ ad: urun.ad, barkod: kod, miktar: 1, birim: urun.birim || "" });
  }
  renderPaletler();
  document.getElementById("barkodSonuc").textContent = `✅ ${urun.ad} → Palet ${paletNo}`;
  setTimeout(() => { document.getElementById("barkodSonuc").textContent = ""; }, 2000);
});

/* ---- AI Fotoğraf analizi ---- */
document.getElementById("fotografInput").addEventListener("change", async (e) => {
  const dosya = e.target.files[0];
  if (!dosya) return;
  const img = document.getElementById("fotografImg");
  const reader = new FileReader();
  reader.onload = async (ev) => {
    img.src = ev.target.result;
    img.style.display = "block";
    const base64 = ev.target.result.split(",")[1];
    const mediaType = dosya.type || "image/jpeg";
    document.getElementById("aiYukleniyor").classList.remove("u-hidden");
    document.getElementById("aiSonuc").classList.add("u-hidden");
    try {
      const yanit = await fetch("/.netlify/functions/claude-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType })
      });
      const veri = await yanit.json();
      document.getElementById("aiYukleniyor").classList.add("u-hidden");
      if (veri.sonuc) {
        document.getElementById("aiSonuc").textContent = veri.sonuc;
        document.getElementById("aiSonuc").classList.remove("u-hidden");
      } else {
        toast("AI yanıt vermedi: " + (veri.error || "Bilinmeyen hata"), "error");
      }
    } catch (err) {
      document.getElementById("aiYukleniyor").classList.add("u-hidden");
      toast("AI bağlantı hatası: " + err.message, "error");
    }
  };
  reader.readAsDataURL(dosya);
});

/* ---- Tamamla ---- */
async function tamamla() {
  if (paletler.every((p) => p.urunler.length === 0)) {
    const devam = await onayIste({ baslik: "Ürün girilmedi", metin: "Hiçbir palete ürün eklenmedi. Yine de tamamlamak istiyor musunuz?", onayMetni: "Evet" });
    if (!devam) return;
  }
  try {
    await siparisGuncelle(aktifSiparis.id, {
      paletVerisi: paletler,
      paletSayisi: paletler.length,
      paletYardimcilar: yardimcilar,
      paletciAd: mevcutKullanici.ad || mevcutKullanici.uid,
      paletlemeTarihi: new Date().toISOString()
    });
    toast(`✅ Paletleme kaydedildi. ${paletler.length} palet.`, "success", 4000);
    geriDon();
  } catch (err) {
    toast("Kayıt hatası: " + (err.message || err), "error");
  }
}
