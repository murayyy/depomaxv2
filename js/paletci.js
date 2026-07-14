// ============================================================================
// PALETÇİ EKRANI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { siparisleriDinle, urunleriniGetir, paletlemeyiDinle, paletlemeKaydet2, paletlemeYardimciEkle } from "./veri.js";
import { arayuzHazirla, toast, kacisEt, sayiBicimle, onayIste } from "./utils.js";

// Firestore'dan kullanıcı listesi için
import { db } from "./firebase.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

arayuzHazirla();

let mevcutKullanici = null;
let siparisListesi = [];
let aktifSiparis = null;
let aktifUrunler = [];
let aktifPalet = 1;     // şu an seçili palet numarası
let toplamPalet = 1;    // toplam palet sayısı
let paletAtamalari = {};  // { urunId: paletNo }
let paletlemeVerisi = null;  // Firestore'dan gelen mevcut veri
let paletlemeDinleSon = null;

sayfaKorumasi(["paletci", "admin"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  siparisleriDinle(["toplandi", "kontrol_ediliyor"], renderSiparisler);
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth); window.location.href = "index.html";
});

/* ---- Sipariş listesi ---- */
function renderSiparisler(liste) {
  siparisListesi = liste;
  const kap = document.getElementById("siparisList");
  const bos = document.getElementById("bosDurum");
  if (!liste.length) { kap.innerHTML = ""; bos.classList.remove("u-hidden"); return; }
  bos.classList.add("u-hidden");
  kap.innerHTML = liste.map((s) => `
    <div class="card order-card" data-id="${s.id}" style="cursor:pointer;">
      <div class="order-card__main">
        <div class="order-card__name">${kacisEt(s.ad)}</div>
        <div class="order-card__meta">
          <span class="badge badge-blue">${s.durum === "kontrol_ediliyor" ? "🔍 Kontrolde" : "Toplandı"}</span>
          <span>${s.toplamUrun || 0} ürün</span>
          ${s.toplamKg ? `<span>${sayiBicimle(s.toplamKg)} KG</span>` : ""}
        </div>
      </div>
      <div class="order-card__actions">
        <button class="btn btn-primary btn-sm" data-ac="${s.id}">📦 Paletlemeye Başla</button>
      </div>
    </div>`).join("");
  kap.querySelectorAll("[data-ac]").forEach(btn => {
    btn.addEventListener("click", () => siparisAc(siparisListesi.find(x => x.id === btn.dataset.ac)));
  });
}

/* ---- Sipariş açma ---- */
async function siparisAc(siparis) {
  aktifSiparis = siparis;
  aktifUrunler = await urunleriniGetir(siparis.id);
  paletAtamalari = {};
  aktifPalet = 1;
  toplamPalet = 1;

  document.getElementById("listeGorunumu").classList.add("u-hidden");
  document.getElementById("detayGorunumu").classList.remove("u-hidden");
  document.getElementById("detayBaslik").textContent = siparis.ad;
  document.getElementById("aiSonuc").classList.add("u-hidden");

  // Mevcut paletleme verisini dinle
  if (paletlemeDinleSon) paletlemeDinleSon();
  paletlemeDinleSon = paletlemeyiDinle(siparis.id, (veri) => {
    paletlemeVerisi = veri;
    if (veri) {
      paletAtamalari = veri.paletAtamalari || {};
      toplamPalet = veri.toplamPalet || 1;
      aktifPalet = Math.min(aktifPalet, toplamPalet);
      renderYardimcilar(veri.yardimcilar || []);
    }
    renderDetay();
  });
}

/* ---- Geri ---- */
document.getElementById("geriBtn").addEventListener("click", () => {
  if (paletlemeDinleSon) { paletlemeDinleSon(); paletlemeDinleSon = null; }
  aktifSiparis = null;
  document.getElementById("listeGorunumu").classList.remove("u-hidden");
  document.getElementById("detayGorunumu").classList.add("u-hidden");
});

/* ---- Ana render ---- */
function renderDetay() {
  // Palet chip'leri
  const row = document.getElementById("paletSecRow");
  let chips = "";
  for (let i = 1; i <= toplamPalet; i++) {
    const atanan = Object.values(paletAtamalari).filter(p => p === i).length;
    chips += `<span class="palet-chip ${aktifPalet === i ? "aktif" : "bos"}" data-palet="${i}">
      Palet ${i} ${atanan > 0 ? `<span style="font-size:10px;">(${atanan} ürün)</span>` : ""}
    </span>`;
  }
  chips += `<button class="btn btn-ghost btn-sm" id="paletEkleBtn" style="font-size:12px;">+ Palet Ekle</button>`;
  row.innerHTML = chips;

  row.querySelectorAll("[data-palet]").forEach(chip => {
    chip.addEventListener("click", () => { aktifPalet = Number(chip.dataset.palet); renderDetay(); });
  });
  row.querySelector("#paletEkleBtn").addEventListener("click", () => {
    toplamPalet++;
    aktifPalet = toplamPalet;
    kaydetOtomatik();
    renderDetay();
  });

  // Alt bilgi
  const atananSayisi = Object.keys(paletAtamalari).length;
  document.getElementById("detayAlt").textContent =
    `${atananSayisi}/${aktifUrunler.length} ürün atandı · ${toplamPalet} palet`;

  // Ürün listesi
  const listDiv = document.getElementById("urunListesi");
  listDiv.innerHTML = aktifUrunler.map((u) => {
    const paletNo = paletAtamalari[u.id];
    const rozetRenk = paletNo ? "#3B82F6" : "var(--color-border)";
    const rozetBg = paletNo ? "#DBEAFE" : "var(--color-surface-2)";
    return `
      <div class="urun-palet-satir">
        <div style="flex:1;">
          <div style="font-weight:600;font-size:13px;">${kacisEt(u.ad)}</div>
          <div style="font-size:11.5px;color:var(--color-ink-soft);">
            ${kacisEt(u.kod || "")} · ${sayiBicimle(u.miktar)} ${kacisEt(u.birim || "")}
            ${u.eksik ? '<span class="badge badge-red" style="font-size:10px;">Eksik</span>' : ""}
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          ${paletNo
            ? `<span style="background:${rozetBg};color:${rozetRenk};border:1.5px solid ${rozetRenk};padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;">P${paletNo}</span>`
            : `<span style="background:${rozetBg};color:var(--color-ink-soft);border:1.5px solid var(--color-border);padding:3px 10px;border-radius:99px;font-size:12px;">Atanmadı</span>`}
          <button class="btn btn-primary btn-sm" data-urun="${u.id}" style="font-size:11px;">→ P${aktifPalet}</button>
          ${paletNo ? `<button class="btn btn-ghost btn-sm" data-kaldir="${u.id}" style="font-size:11px;">✕</button>` : ""}
        </div>
      </div>`;
  }).join("");

  listDiv.querySelectorAll("[data-urun]").forEach(btn => {
    btn.addEventListener("click", () => {
      paletAtamalari[btn.dataset.urun] = aktifPalet;
      kaydetOtomatik();
      renderDetay();
    });
  });
  listDiv.querySelectorAll("[data-kaldir]").forEach(btn => {
    btn.addEventListener("click", () => {
      delete paletAtamalari[btn.dataset.kaldir];
      kaydetOtomatik();
      renderDetay();
    });
  });
}

function renderYardimcilar(yardimcilar) {
  const div = document.getElementById("yardimcilar");
  if (!yardimcilar.length) { div.textContent = ""; return; }
  div.innerHTML = "👥 Ekip: " + yardimcilar.map(y => `<strong>${kacisEt(y)}</strong>`).join(", ");
}

/* ---- Otomatik kaydet ---- */
function kaydetOtomatik() {
  if (!aktifSiparis) return;
  paletlemeKaydet2(aktifSiparis.id, {
    siparisId: aktifSiparis.id,
    siparisAd: aktifSiparis.ad,
    paletAtamalari,
    toplamPalet,
    yapan: mevcutKullanici.ad || mevcutKullanici.uid
  }).catch(console.error);
}

/* ---- Barkod tabancası ---- */
document.getElementById("barkodInput").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const kod = e.target.value.trim();
  e.target.value = "";
  if (!kod) return;
  const urun = aktifUrunler.find(u => u.barkod && u.barkod.trim() === kod);
  if (!urun) { toast(`Barkod bulunamadı: ${kod}`, "error", 2000); return; }
  paletAtamalari[urun.id] = aktifPalet;
  kaydetOtomatik();
  renderDetay();
  toast(`✅ ${urun.ad} → Palet ${aktifPalet}`, "success", 1500);
});

/* ---- Tamamla ---- */
document.getElementById("tamamlaBtn").addEventListener("click", async () => {
  const atanan = Object.keys(paletAtamalari).length;
  const toplam = aktifUrunler.length;
  const onay = await onayIste({
    baslik: "Paletleme Tamamlandı mı?",
    metin: `${atanan}/${toplam} ürün atandı, ${toplamPalet} palet. Onaylıyor musunuz?`,
    onayMetni: "Evet, Tamamlandı"
  });
  if (!onay) return;
  await paletlemeKaydet2(aktifSiparis.id, {
    siparisId: aktifSiparis.id,
    siparisAd: aktifSiparis.ad,
    paletAtamalari, toplamPalet,
    yapan: mevcutKullanici.ad || mevcutKullanici.uid,
    tamamlandi: true,
    tamamlanmaTarihi: new Date().toISOString()
  });
  toast(`✅ Paletleme kaydedildi. ${toplamPalet} palet.`, "success");
  document.getElementById("geriBtn").click();
});

/* ---- Yardımcı ekle ---- */
document.getElementById("yardimciEkleBtn").addEventListener("click", async () => {
  const root = document.getElementById("modalRoot");
  // Toplayıcı ve kontrolör listesini getir
  let kisiler = [];
  try {
    const snap = await getDocs(query(collection(db, "kullanicilar"), where("rol", "in", ["toplayici", "kontrolor", "paletci"])));
    kisiler = snap.docs.map(d => d.data().ad || d.id).filter(Boolean);
  } catch (e) {}

  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal">
        <h3>👤 Yardımcı Ekle</h3>
        <div class="field">
          <label>Kişi Seç</label>
          <select class="select" id="yardimciSec">
            <option value="">— Seç —</option>
            ${kisiler.map(k => `<option value="${kacisEt(k)}">${kacisEt(k)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Veya manuel gir</label>
          <input class="input" id="yardimciManuel" placeholder="Ad Soyad" />
        </div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="ekle">Ekle</button>
        </div>
      </div>
    </div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
  root.querySelector('[data-role="ekle"]').onclick = async () => {
    const secilen = document.getElementById("yardimciSec").value;
    const manuel = document.getElementById("yardimciManuel").value.trim();
    const yardimci = secilen || manuel;
    if (!yardimci) { toast("Kişi seçin veya yazın.", "error"); return; }
    await paletlemeYardimciEkle(aktifSiparis.id, yardimci);
    toast(`${yardimci} eklendi.`, "success");
    kapat();
  };
});

/* ---- AI Palet Tahmini ---- */
document.getElementById("aiTahminBtn").addEventListener("click", () => {
  document.getElementById("kameraInput").click();
});

document.getElementById("kameraInput").addEventListener("change", async (e) => {
  const dosya = e.target.files[0];
  if (!dosya) return;
  const sonucDiv = document.getElementById("aiSonuc");
  sonucDiv.classList.remove("u-hidden");
  sonucDiv.innerHTML = "🤖 <b>Claude analiz ediyor…</b>";
  e.target.value = "";

  try {
    // Görseli base64'e çevir
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(dosya);
    });

    // Siparişteki ürün özetini hazırla
    const urunOzeti = aktifUrunler.map(u => `${u.ad}: ${sayiBicimle(u.miktar)} ${u.birim || "KG"}`).join(", ");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: dosya.type || "image/jpeg", data: base64 }
            },
            {
              type: "text",
              text: `Bu görseldeki ürün yığınını analiz et. Sipariş içeriği: ${urunOzeti}. 

Şunları söyle:
1. Tahmini kaç palet gerekli (standart Avrupa paleti 80x120 cm, maksimum 2m yükseklik)
2. Paletleri nasıl düzenlemeli (örn. ağır ürünler alta)
3. Kısa ve pratik bir öneri

Türkçe yanıt ver. Kısa tut, maksimum 5 cümle.`
            }
          ]
        }]
      })
    });

    const data = await response.json();
    const metin = data.content?.[0]?.text || "Analiz yapılamadı.";
    sonucDiv.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">🤖 AI Palet Tahmini</div>
      <div>${metin.replace(/\n/g, "<br>")}</div>
      <button class="btn btn-ghost btn-sm" style="margin-top:10px;" onclick="document.getElementById('aiSonuc').classList.add('u-hidden')">Kapat</button>`;
  } catch (err) {
    console.error(err);
    sonucDiv.innerHTML = `<div>⚠ Analiz yapılamadı: ${err.message}</div>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('aiSonuc').classList.add('u-hidden')">Kapat</button>`;
  }
});
