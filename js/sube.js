// ============================================================================
// ŞUBE SİPARİŞ EKRANI MANTIĞI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { katalogDinle, subeSimarisiOlustur } from "./veri.js";
import { arayuzHazirla, toast, onayIste, ondalikOku, sayiBicimle, kacisEt, excelDosyasiniOku } from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;
let katalogCache = [];
let ozelKalemler = []; // Katalog dışı talepler
const miktarSakla = new Map(); // Girilen miktarları kategori değişiminde korur
const notSakla = new Map(); // Girilen notları kategori değişiminde korur

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

  // Kategori dropdown'ını doldur
  const kategoriler = [...new Set(katalogCache.map((u) => (u.kategori || "").trim() || "Diğer"))].sort();
  const sel = document.getElementById("kategoriFiltre");
  const mevcutSec = sel.value;
  sel.innerHTML = '<option value="">Tüm Kategoriler</option>' +
    kategoriler.map((k) => `<option value="${kacisEt(k)}">${kacisEt(k)}</option>`).join("");
  if (mevcutSec) sel.value = mevcutSec;

  renderKatalog();
}

// ---- Buton durumunu güncelle ----
function butonGuncelle() {
  const herhangi = Array.from(document.querySelectorAll(".miktar-input"))
    .some((i) => ondalikOku(i.value) > 0) || ozelKalemler.length > 0;
  document.getElementById("siparisGonderBtn").disabled = !herhangi;
}

// Event delegation ile miktar değişimini yakala — yeniden render sonrası da çalışır
document.addEventListener("input", (e) => {
  if (e.target.classList.contains("miktar-input")) {
    const id = e.target.dataset.id;
    const val = ondalikOku(e.target.value);
    if (id) {
      if (val > 0) miktarSakla.set(id, e.target.value);
      else miktarSakla.delete(id);
    }
    butonGuncelle();
  }
  if (e.target.classList.contains("aciklama-input")) {
    const id = e.target.dataset.id;
    if (id) {
      if (e.target.value.trim()) notSakla.set(id, e.target.value);
      else notSakla.delete(id);
    }
  }
  if (e.target.id === "urunAraInput") renderKatalog();
});
document.getElementById("kategoriFiltre")?.addEventListener("change", () => renderKatalog());

function renderKatalog() {
  const tbody = document.getElementById("katalogGovde");
  const kartlar = document.getElementById("katalogKartlar");

  // Filtrele
  const ara = (document.getElementById("urunAraInput")?.value || "").toLowerCase().trim();
  const seciliKat = (document.getElementById("kategoriFiltre")?.value || "").trim();

  const filtrelenmis = katalogCache.filter((u) => {
    const katEsles = !seciliKat || ((u.kategori || "").trim() || "Diğer") === seciliKat;
    const araEsles = !ara || (u.ad || "").toLowerCase().includes(ara) ||
      (u.stokKodu || "").toLowerCase().includes(ara) ||
      (u.barkod || "").toLowerCase().includes(ara);
    return katEsles && araEsles;
  });

  const gruplar = new Map();
  filtrelenmis.forEach((u) => {
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

  // Kaydedilen miktarları ve notları geri yükle
  document.querySelectorAll(".miktar-input[data-id]").forEach((input) => {
    const kayitli = miktarSakla.get(input.dataset.id);
    if (kayitli) input.value = kayitli;
  });
  document.querySelectorAll(".aciklama-input[data-id]").forEach((input) => {
    const kayitli = notSakla.get(input.dataset.id);
    if (kayitli) input.value = kayitli;
  });

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
document.getElementById("katalogDisiEkleBtn").addEventListener("click", () => {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal" style="max-width:400px;">
        <h3>🟠 Katalog Dışı Talep</h3>
        <div class="field"><label>Ürün / Malzeme Adı</label><input class="input" id="odAd" placeholder="Ürün adını yazın" /></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div class="field"><label>Miktar</label><input class="input" type="text" inputmode="decimal" id="odMiktar" placeholder="0" /></div>
          <div class="field"><label>Birim</label><input class="input" id="odBirim" value="KG" placeholder="KG, Adet…" /></div>
        </div>
        <div class="field"><label>Not / Açıklama</label><input class="input" id="odNot" placeholder="Neden gerekli, özellik vs." /></div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="ekle">Ekle</button>
        </div>
      </div>
    </div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
  root.querySelector('[data-role="ekle"]').onclick = () => {
    const ad = document.getElementById("odAd").value.trim();
    if (!ad) { toast("Ürün adı zorunlu.", "error"); return; }
    const miktar = ondalikOku(document.getElementById("odMiktar").value) || 1;
    const birim = document.getElementById("odBirim").value.trim() || "KG";
    const not = document.getElementById("odNot").value.trim();
    ozelKalemler.push({ ad, miktar, birim, not, katalogDisi: true });
    renderOzelKalemler();
    butonGuncelle();
    kapat();
    toast(`"${ad}" eklendi.`, "success", 2000);
  };
  document.getElementById("odAd").focus();
});

function renderOzelKalemler() {
  const alan = document.getElementById("ozelKalemlerAlani");
  const liste = document.getElementById("ozelKalemlerListe");
  if (!ozelKalemler.length) { alan.classList.add("u-hidden"); return; }
  alan.classList.remove("u-hidden");
  liste.innerHTML = ozelKalemler.map((k, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border);">
      <span class="badge badge-amber">Özel</span>
      <div style="flex:1;">
        <div style="font-weight:600;font-size:13px;">${kacisEt(k.ad)}</div>
        ${k.not ? `<div style="font-size:11.5px;color:var(--color-ink-soft);">${kacisEt(k.not)}</div>` : ""}
      </div>
      <div style="font-size:13px;font-weight:600;">${sayiBicimle(k.miktar)} ${kacisEt(k.birim)}</div>
      <button class="btn btn-danger btn-sm" data-ozel-sil="${i}">✕</button>
    </div>`).join("");
  liste.querySelectorAll("[data-ozel-sil]").forEach(btn => {
    btn.addEventListener("click", () => {
      ozelKalemler.splice(Number(btn.dataset.ozelSil), 1);
      renderOzelKalemler();
      butonGuncelle();
    });
  });
}

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

  // Katalog dışı özel kalemleri ekle
  const tumSatirlar = [...satirlar, ...ozelKalemler.map(k => ({
    id: `ozel_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    ad: k.ad, stokKodu: "", barkod: "", birim: k.birim,
    miktar: k.miktar, kategori: "Özel Talep",
    katalogDisi: true, subeNotu: k.not || ""
  }))];

  const btn = document.getElementById("siparisGonderBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Gönderiliyor…';

  try {
    await subeSimarisiOlustur({
      subeAdi: mevcutKullanici.subeAdi || mevcutKullanici.ad,
      subeId: mevcutKullanici.uid,
      olusturan: mevcutKullanici.uid,
      satirlar: tumSatirlar
    });
    document.querySelectorAll(".miktar-input, .aciklama-input").forEach((i) => { i.value = ""; });
    miktarSakla.clear();
    notSakla.clear();
    ozelKalemler.length = 0;
    renderOzelKalemler();
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
