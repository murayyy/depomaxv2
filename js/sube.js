// ============================================================================
// ŞUBE SİPARİŞ EKRANI MANTIĞI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { katalogDinle, subeSimarisiOlustur } from "./veri.js";
import { arayuzHazirla, toast, onayIste, ondalikOku, sayiBicimle, kacisEt, excelDosyasiniOku } from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;
let katalogCache = [];

sayfaKorumasi(["sube"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("subeEtiketi").textContent = kullanici.subeAdi || "Şube";
  document.getElementById("altBaslik").textContent =
    `${kullanici.subeAdi || "Şubeniz"} için sipariş oluşturun. Boş bıraktıklarınız eklenmez.`;
  katalogDinle(katalogGuncellendi);
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

function katalogGuncellendi(liste) {
  katalogCache = liste.filter((u) => u.aktif !== false);
  document.getElementById("yukleniyorAlani").classList.add("u-hidden");

  if (katalogCache.length === 0) {
    document.getElementById("bosKatalog").classList.remove("u-hidden");
    document.getElementById("katalogAlani").classList.add("u-hidden");
    return;
  }
  document.getElementById("bosKatalog").classList.add("u-hidden");
  document.getElementById("katalogAlani").classList.remove("u-hidden");
  renderKatalog();
}

// ---- Buton durumunu güncelle ----
function butonGuncelle() {
  const herhangi = Array.from(document.querySelectorAll(".miktar-input"))
    .some((i) => ondalikOku(i.value) > 0);
  document.getElementById("siparisGonderBtn").disabled = !herhangi;
}

// Event delegation ile miktar değişimini yakala — yeniden render sonrası da çalışır
document.addEventListener("input", (e) => {
  if (e.target.classList.contains("miktar-input")) butonGuncelle();
});

function renderKatalog() {
  const tbody = document.getElementById("katalogGovde");
  const kartlar = document.getElementById("katalogKartlar");

  const gruplar = new Map();
  katalogCache.forEach((u) => {
    const kat = (u.kategori || "").trim() || "Diğer";
    if (!gruplar.has(kat)) gruplar.set(kat, []);
    gruplar.get(kat).push(u);
  });

  let tabloHtml = "";
  gruplar.forEach((urunler, kategori) => {
    tabloHtml += `<tr><td colspan="5" style="background:var(--color-surface-2);font-weight:700;font-size:12.5px;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-ink-soft);padding:8px 12px;">${kacisEt(kategori)}</td></tr>`;
    tabloHtml += urunler.map((u) => `
      <tr data-uid="${u.id}">
        <td>
          <div style="font-weight:600;">${kacisEt(u.ad)}</div>
          ${u.aciklama ? `<div class="u-text-soft" style="font-size:12px;">${kacisEt(u.aciklama)}</div>` : ""}
        </td>
        <td>${kacisEt(u.birim || "")}</td>
        <td>${u.minMiktar ? sayiBicimle(u.minMiktar) : "—"}</td>
        <td><input type="text" inputmode="decimal" class="cell-qty-input miktar-input" data-id="${u.id}" placeholder="0" style="width:80px;" /></td>
        <td><input type="text" class="input aciklama-input" data-id="${u.id}" placeholder="Not…" style="min-width:120px;font-size:12.5px;" /></td>
      </tr>`).join("");
  });
  tbody.innerHTML = tabloHtml;

  let kartHtml = "";
  gruplar.forEach((urunler, kategori) => {
    kartHtml += `<div style="background:var(--color-surface-2);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-ink-soft);padding:8px 12px;border-radius:var(--radius-sm);margin:14px 0 6px;">${kacisEt(kategori)}</div>`;
    kartHtml += urunler.map((u) => `
      <div class="row-card" data-uid="${u.id}">
        <div class="row-card__top">
          <div>
            <div class="row-card__name">${kacisEt(u.ad)}</div>
            ${u.aciklama ? `<div class="row-card__code">${kacisEt(u.aciklama)}</div>` : ""}
          </div>
          <span class="badge badge-gray">${kacisEt(u.birim || "")}</span>
        </div>
        <div class="row-card__grid" style="margin-top:8px;">
          ${u.minMiktar ? `<div><div class="row-card__label">Min. Miktar (ve katları)</div>${sayiBicimle(u.minMiktar)} ${kacisEt(u.birim || "")}</div>` : ""}
          <div>
            <div class="row-card__label">Sipariş Miktarı</div>
            <input type="text" inputmode="decimal" class="cell-qty-input miktar-input" data-id="${u.id}" placeholder="0" style="width:100px;" />
          </div>
          <div>
            <div class="row-card__label">Not / Açıklama</div>
            <input type="text" class="input aciklama-input" data-id="${u.id}" placeholder="İsteğe bağlı not…" style="font-size:12.5px;" />
          </div>
        </div>
      </div>`).join("");
  });
  kartlar.innerHTML = kartHtml;
  butonGuncelle();
}

function miktarlariTopla() {
  const map = new Map();
  document.querySelectorAll(".miktar-input[data-id]").forEach((input) => {
    const miktar = ondalikOku(input.value);
    if (miktar > 0) map.set(input.dataset.id, miktar);
  });
  return map;
}

function aciklamalariTopla() {
  const map = new Map();
  document.querySelectorAll(".aciklama-input[data-id]").forEach((input) => {
    if (input.value.trim()) map.set(input.dataset.id, input.value.trim());
  });
  return map;
}

// ---- Excel'den miktarları yükle ----
// Excel formatı: A sütunu=Stok Kodu veya Ürün Adı, B sütunu=Miktar
document.getElementById("excelYukleInput").addEventListener("change", async (e) => {
  const dosya = e.target.files[0];
  e.target.value = "";
  if (!dosya) return;
  try {
    const satirlar = await excelDosyasiniOku(dosya);
    let eslesen = 0;
    satirlar.forEach((satir) => {
      const kod = String(satir["Stok Kodu"] || satir["stok kodu"] || satir["Kod"] || satir["kod"] || "").trim();
      const ad = String(satir["Ürün Adı"] || satir["ürün adı"] || satir["Ad"] || satir["ad"] || "").trim().toLowerCase();
      const miktar = ondalikOku(satir["Miktar"] || satir["miktar"] || satir["Sipariş Miktarı"] || 0);
      if (!miktar) return;

      // Önce stok koduna göre eşleştir, sonra ada göre
      const urun = katalogCache.find((u) =>
        (kod && (u.stokKodu === kod || u.kod === kod)) ||
        (ad && (u.ad || "").toLowerCase() === ad)
      );
      if (!urun) return;

      const input = document.querySelector(`.miktar-input[data-id="${urun.id}"]`);
      if (input) { input.value = miktar; eslesen++; }
    });
    butonGuncelle();
    if (eslesen > 0) {
      toast(`✅ Excel'den ${eslesen} ürün miktarı yüklendi.`, "success");
    } else {
      toast("Excel okundu ama eşleşen ürün bulunamadı. Stok Kodu veya Ürün Adı sütununu kontrol edin.", "error");
    }
  } catch (err) {
    console.error(err);
    toast("Excel okunurken hata oluştu.", "error");
  }
});

// ---- Siparişi Gönder ----
document.getElementById("siparisGonderBtn").addEventListener("click", async () => {
  const miktarMap = miktarlariTopla();
  if (miktarMap.size === 0) { toast("En az bir üründe miktar girin.", "error"); return; }

  // Minimum miktar kontrolü — hem altında olanlar hem de katı olmayanlar
  const hatalar = [];
  katalogCache.forEach((u) => {
    const giris = miktarMap.get(u.id) || 0;
    if (!giris || !u.minMiktar) return;
    if (giris < u.minMiktar) {
      hatalar.push(`${u.ad}: min ${sayiBicimle(u.minMiktar)} ${u.birim || ""}`);
    } else {
      // Katı mı kontrol et (ondalık tolerans: 0.001)
      const kat = giris / u.minMiktar;
      if (Math.abs(kat - Math.round(kat)) > 0.001) {
        const oncekiKat = Math.floor(kat) * u.minMiktar;
        const sonrakiKat = Math.ceil(kat) * u.minMiktar;
        hatalar.push(`${u.ad}: ${sayiBicimle(giris)} yerine ${sayiBicimle(oncekiKat)} veya ${sayiBicimle(sonrakiKat)} olmalı (min ${sayiBicimle(u.minMiktar)} katları)`);
      }
    }
  });
  if (hatalar.length > 0) {
    const devam = await onayIste({
      baslik: "Miktar Uyarısı",
      metin: `Şu ürünlerde minimum miktar veya katı kuralı ihlali var:\n\n${hatalar.join("\n\n")}\n\nYine de göndermek istiyor musunuz?`,
      onayMetni: "Evet, gönder"
    });
    if (!devam) return;
  }

  const aciklamaMap = aciklamalariTopla();
  const satirlar = katalogCache
    .filter((u) => miktarMap.has(u.id))
    .map((u) => ({ ...u, miktar: miktarMap.get(u.id), subeNotu: aciklamaMap.get(u.id) || "" }));

  const btn = document.getElementById("siparisGonderBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Gönderiliyor…';

  try {
    await subeSimarisiOlustur({
      subeAdi: mevcutKullanici.subeAdi || mevcutKullanici.ad,
      subeId: mevcutKullanici.uid,
      olusturan: mevcutKullanici.uid,
      satirlar
    });
    document.querySelectorAll(".miktar-input, .aciklama-input").forEach((i) => { i.value = ""; });
    btn.disabled = true;
    btn.innerHTML = "Siparişi Gönder";
    toast("✅ Sipariş gönderildi! Depo tarafında hazırlanmaya başlandı.", "success", 5000);
  } catch (err) {
    console.error(err);
    toast("Sipariş gönderilemedi: " + (err.message || err), "error");
    btn.disabled = false;
    btn.innerHTML = "Siparişi Gönder";
  }
});

/* ============================================================================
   BARKOD TARAMA (kamera + tabanca) — katalog ürünlerini otomatik ekler
   ============================================================================ */
function barkodIsleme(kod) {
  const urun = katalogCache.find((u) => u.barkod && u.barkod.trim() === kod.trim());
  if (!urun) {
    toast(`Barkod katalogda bulunamadı: ${kod}`, "error", 3000);
    return;
  }
  // Mevcut input'u bul ve birimAgirlik kadar miktar ekle
  const input = document.querySelector(`.miktar-input[data-id="${urun.id}"]`);
  if (!input) { toast("Ürün listede görünmüyor.", "error"); return; }
  const eskiMiktar = ondalikOku(input.value) || 0;
  const eklenecek = urun.birimAgirlik || 1;
  input.value = eskiMiktar + eklenecek;
  input.dispatchEvent(new Event("input")); // buton aktifleştir
  toast(`✅ ${urun.ad} — ${sayiBicimle(eskiMiktar + eklenecek)} ${urun.birim || ""}`, "success", 2000);
  // Ürünün olduğu yere scroll
  input.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ---- Tabanca (USB/BT keyboard wedge) ----
document.getElementById("barkodTabancaInput").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const kod = e.target.value.trim();
  e.target.value = "";
  if (kod) barkodIsleme(kod);
});
