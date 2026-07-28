// ============================================================================
// ŞUBE — BİRLEŞİK SAYFA (Sipariş Ver + Siparişlerim)
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import {
  katalogDinle, subeSimarisiOlustur,
  subeSiparisleriDinle, urunleriniGetir, urunEkle,
  teslimatKaydet, teslimatYenidenOnayla
} from "./veri.js";
import {
  arayuzHazirla, toast, onayIste, ondalikOku,
  sayiBicimle, kacisEt, excelDosyasiniOku, tarihBicimle
} from "./utils.js";

arayuzHazirla();

/* ============================================================
   ORTAK DURUM
   ============================================================ */
let mevcutKullanici = null;
let katalogCache = [];
let ozelKalemler = [];
const miktarSakla = new Map();
const notSakla = new Map();

/* ============================================================
   SEKME YÖNETİMİ
   ============================================================ */
let aktifSekme = "siparis";

function sekmeGoster(sekme) {
  aktifSekme = sekme;
  document.querySelectorAll("[data-sekme]").forEach(b =>
    b.classList.toggle("is-active", b.dataset.sekme === sekme)
  );
  document.getElementById("siparisBloku").classList.toggle("u-hidden", sekme !== "siparis");
  document.getElementById("gecmisBloku").classList.toggle("u-hidden", sekme !== "gecmis");
}

document.querySelectorAll("[data-sekme]").forEach(btn =>
  btn.addEventListener("click", () => sekmeGoster(btn.dataset.sekme))
);

/* ============================================================
   SAYFA KORUMASI — tek seferlik
   ============================================================ */
sayfaKorumasi(["sube", "fabrika"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;

  katalogDinle((liste) => {
    katalogCache = liste.filter(u => u.aktif !== false);
    katalogGuncellendi();
  });

  siparisleriBaslat();
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

/* ============================================================
   SİPARİŞ VER — katalog
   ============================================================ */
function katalogGuncellendi() {
  document.getElementById("yukleniyorAlani").classList.add("u-hidden");
  if (!katalogCache.length) {
    document.getElementById("bosKatalog").classList.remove("u-hidden");
    document.getElementById("katalogAlani").classList.add("u-hidden");
    return;
  }
  document.getElementById("bosKatalog").classList.add("u-hidden");
  document.getElementById("katalogAlani").classList.remove("u-hidden");

  const kategoriler = [...new Set(katalogCache.map(u => (u.kategori || "").trim()).filter(Boolean))].sort();
  const sel = document.getElementById("kategoriFiltre");
  const mevcut = sel.value;
  sel.innerHTML = '<option value="">Tüm Kategoriler</option>' +
    kategoriler.map(k => `<option value="${kacisEt(k)}">${kacisEt(k)}</option>`).join("");
  if (mevcut) sel.value = mevcut;

  renderKatalog();
}

document.addEventListener("input", (e) => {
  if (e.target.classList.contains("miktar-input")) {
    const id = e.target.dataset.id;
    const val = ondalikOku(e.target.value);
    if (id) { if (val > 0) miktarSakla.set(id, e.target.value); else miktarSakla.delete(id); }
    butonGuncelle();
  }
  if (e.target.classList.contains("aciklama-input")) {
    const id = e.target.dataset.id;
    if (id) { if (e.target.value.trim()) notSakla.set(id, e.target.value); else notSakla.delete(id); }
  }
  if (e.target.id === "urunAraInput") renderKatalog();
});

document.getElementById("kategoriFiltre")?.addEventListener("change", () => renderKatalog());
document.getElementById("siralamaFiltre")?.addEventListener("change", () => renderKatalog());

function butonGuncelle() {
  const herhangi = miktarSakla.size > 0 || ozelKalemler.length > 0;
  document.getElementById("siparisGonderBtn").disabled = !herhangi;
}

function renderKatalog() {
  const tbody = document.getElementById("katalogGovde");
  const kartlar = document.getElementById("katalogKartlar");
  const ara = (document.getElementById("urunAraInput")?.value || "").toLowerCase().trim();
  const seciliKat = (document.getElementById("kategoriFiltre")?.value || "").trim();
  const siralama = document.getElementById("siralamaFiltre")?.value || "sira";

  const filtrelenmis = katalogCache.filter(u => {
    const katOk = !seciliKat || (u.kategori || "").trim() === seciliKat;
    const araOk = !ara || (u.ad || "").toLowerCase().includes(ara) ||
      (u.stokKodu || "").toLowerCase().includes(ara) ||
      (u.barkod || "").toLowerCase().includes(ara);
    return katOk && araOk;
  });

  const sirali = [...filtrelenmis].sort((a, b) => {
    if (siralama === "kod") return (a.stokKodu || "").localeCompare(b.stokKodu || "", "tr");
    if (siralama === "ad") return (a.ad || "").localeCompare(b.ad || "", "tr");
    return (Number(a.sira) || 999) - (Number(b.sira) || 999);
  });

  const gruplama = siralama === "sira";
  const gruplar = new Map();
  sirali.forEach(u => {
    const k = gruplama ? ((u.kategori || "").trim() || "Diğer") : "Tüm Ürünler";
    if (!gruplar.has(k)) gruplar.set(k, []);
    gruplar.get(k).push(u);
  });

  let tabloHtml = "", kartHtml = "";
  gruplar.forEach((urunler, kategori) => {
    tabloHtml += `<tr><td colspan="6" style="background:var(--color-surface-2);font-weight:700;font-size:12.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-ink-soft);padding:8px 12px;">${kacisEt(kategori)}</td></tr>`;
    kartHtml += `<div style="background:var(--color-surface-2);font-weight:700;font-size:12px;text-transform:uppercase;color:var(--color-ink-soft);padding:8px 12px;border-radius:var(--radius-sm);margin:14px 0 6px;">${kacisEt(kategori)}</div>`;
    urunler.forEach(u => {
      tabloHtml += `<tr>
        <td class="cell-code" style="font-size:12px;">${kacisEt(u.stokKodu || "—")}</td>
        <td><div style="font-weight:600;">${kacisEt(u.ad)}</div></td>
        <td>${kacisEt(u.birim || "")}</td>
        <td>${u.minMiktar ? sayiBicimle(u.minMiktar) : "—"}</td>
        <td><input type="text" inputmode="decimal" class="cell-qty-input miktar-input" data-id="${u.id}" value="${miktarSakla.get(u.id) || ""}" placeholder="0" style="width:80px;" /></td>
        <td><input type="text" class="input aciklama-input" data-id="${u.id}" value="${kacisEt(notSakla.get(u.id) || "")}" placeholder="Not…" style="min-width:120px;font-size:12.5px;" /></td>
      </tr>`;
      kartHtml += `<div class="row-card">
        <div class="row-card__top">
          <div>
            <div class="row-card__name">${kacisEt(u.ad)}</div>
            <div class="row-card__code">${kacisEt(u.stokKodu || "")} · ${kacisEt(u.birim || "")}</div>
          </div>
        </div>
        <input type="text" inputmode="decimal" class="cell-qty-input miktar-input" data-id="${u.id}" value="${miktarSakla.get(u.id) || ""}" placeholder="Miktar…" style="margin-top:8px;" />
        <input type="text" class="input aciklama-input" data-id="${u.id}" value="${kacisEt(notSakla.get(u.id) || "")}" placeholder="Not…" style="margin-top:6px;font-size:12.5px;" />
      </div>`;
    });
  });

  tbody.innerHTML = tabloHtml;
  kartlar.innerHTML = kartHtml;
  butonGuncelle();
}

// Katalog dışı
document.getElementById("katalogDisiEkleBtn")?.addEventListener("click", () => {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal" style="max-width:400px;">
        <h3>🟠 Katalog Dışı Talep</h3>
        <div class="field"><label>Ürün / Malzeme Adı</label><input class="input" id="odAd" placeholder="Ürün adını yazın" /></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div class="field"><label>Miktar</label><input class="input" type="text" inputmode="decimal" id="odMiktar" placeholder="0" /></div>
          <div class="field"><label>Birim</label><input class="input" id="odBirim" value="KG" /></div>
        </div>
        <div class="field"><label>Not</label><input class="input" id="odNot" placeholder="Açıklama…" /></div>
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
    ozelKalemler.push({ ad, miktar: ondalikOku(document.getElementById("odMiktar").value) || 1, birim: document.getElementById("odBirim").value.trim() || "KG", not: document.getElementById("odNot").value.trim(), katalogDisi: true });
    renderOzelKalemler();
    butonGuncelle();
    kapat();
  };
  document.getElementById("odAd").focus();
});

function renderOzelKalemler() {
  const alan = document.getElementById("ozelKalemlerAlani");
  const liste = document.getElementById("ozelKalemlerListe");
  if (!alan) return;
  if (!ozelKalemler.length) { alan.classList.add("u-hidden"); return; }
  alan.classList.remove("u-hidden");
  liste.innerHTML = ozelKalemler.map((k, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border);">
      <span class="badge badge-amber">Özel</span>
      <div style="flex:1;"><div style="font-weight:600;font-size:13px;">${kacisEt(k.ad)}</div>
        ${k.not ? `<div style="font-size:11.5px;color:var(--color-ink-soft);">${kacisEt(k.not)}</div>` : ""}
      </div>
      <div style="font-weight:600;">${sayiBicimle(k.miktar)} ${kacisEt(k.birim)}</div>
      <button class="btn btn-danger btn-sm" data-ozel-sil="${i}">✕</button>
    </div>`).join("");
  liste.querySelectorAll("[data-ozel-sil]").forEach(btn =>
    btn.addEventListener("click", () => { ozelKalemler.splice(Number(btn.dataset.ozelSil), 1); renderOzelKalemler(); butonGuncelle(); })
  );
}

// Sipariş gönder
document.getElementById("siparisGonderBtn")?.addEventListener("click", async () => {
  if (miktarSakla.size === 0 && ozelKalemler.length === 0) { toast("En az bir üründe miktar girin.", "error"); return; }
  const onay = await onayIste({ baslik: "Siparişi Gönder", metin: `${miktarSakla.size + ozelKalemler.length} çeşit ürün için sipariş gönderilecek.`, onayMetni: "Gönder" });
  if (!onay) return;
  const btn = document.getElementById("siparisGonderBtn");
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const satirlar = katalogCache.filter(u => miktarSakla.has(u.id)).map(u => ({
      ...u, miktar: ondalikOku(miktarSakla.get(u.id)), subeNotu: notSakla.get(u.id) || ""
    }));
    const tumSatirlar = [...satirlar, ...ozelKalemler.map(k => ({
      id: `ozel_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      ad: k.ad, stokKodu: "", barkod: "", birim: k.birim,
      miktar: k.miktar, kategori: "Özel Talep", katalogDisi: true, subeNotu: k.not || ""
    }))];
    await subeSimarisiOlustur({ subeAdi: mevcutKullanici.subeAdi || mevcutKullanici.ad, subeId: mevcutKullanici.uid, olusturan: mevcutKullanici.uid, satirlar: tumSatirlar });
    miktarSakla.clear(); notSakla.clear(); ozelKalemler.length = 0;
    document.querySelectorAll(".miktar-input, .aciklama-input").forEach(i => { i.value = ""; });
    renderOzelKalemler(); butonGuncelle();
    toast("✅ Sipariş gönderildi!", "success", 5000);
    sekmeGoster("gecmis"); // Siparişlerim'e geç
  } catch (err) {
    console.error(err); toast("Sipariş gönderilemedi: " + (err.message || err), "error");
  } finally {
    btn.innerHTML = "Siparişi Gönder";
  }
});

// Excel yükle
document.getElementById("excelYukleInput")?.addEventListener("change", async (e) => {
  const dosya = e.target.files[0]; if (!dosya) return;
  try {
    const { excelDosyasiniOku } = await import("./utils.js");
    const satirlar = await excelDosyasiniOku(dosya);
    let eslesen = 0;
    satirlar.forEach(satir => {
      const kod = String(satir["Stok Kodu"] || satir["stok kodu"] || satir["Kod"] || satir["kod"] || "").trim();
      const ad = String(satir["Ürün Adı"] || satir["urun adi"] || satir["Ad"] || satir["ad"] || "").trim();
      const miktar = ondalikOku(String(satir["Miktar"] || satir["miktar"] || "0"));
      if (!miktar) return;
      const urun = katalogCache.find(u => (kod && (u.stokKodu === kod)) || (ad && u.ad === ad));
      if (urun) { miktarSakla.set(urun.id, String(miktar)); eslesen++; }
    });
    e.target.value = "";
    renderKatalog();
    toast(eslesen > 0 ? `✅ ${eslesen} ürün yüklendi.` : "Eşleşen ürün bulunamadı.", eslesen > 0 ? "success" : "error");
  } catch (err) { toast("Excel okunamadı: " + err.message, "error"); }
});

/* ============================================================
   SİPARİŞLERİM — geçmiş
   ============================================================ */
const DURUM_BİLGİ = {
  toplaniyor: { etiket: "⏳ Hazırlanıyor", sinif: "badge-amber" },
  toplandi: { etiket: "✅ Toplandı", sinif: "badge-green" },
  kontrol_ediliyor: { etiket: "🔍 Kontrol", sinif: "badge-blue" },
  tamamlandi: { etiket: "📦 Hazır", sinif: "badge-green" },
  sevk_edildi: { etiket: "🚚 Yolda", sinif: "badge-blue" },
  teslim_edildi: { etiket: "🎉 Teslim Edildi", sinif: "badge-green" },
  arsivlendi: { etiket: "🗂 Arşiv", sinif: "badge-gray" }
};

const DUZENLENEBILIR = ["toplaniyor", "toplandi", "kontrol_ediliyor", "tamamlandi"];
let siparislerCache = [];

function siparisleriBaslat() {
  subeSiparisleriDinle(mevcutKullanici.uid, renderSiparisler);
}

function durumEtiketiGetir(s) {
  if (s.durum === "sevk_edildi") {
    if (!s.sistemeAktarildi) return { etiket: "🚚 Yolda (Aktarım bekleniyor)", sinif: "badge-amber" };
    return { etiket: "🚚 Yolda", sinif: "badge-blue" };
  }
  return DURUM_BİLGİ[s.durum] || { etiket: s.durum, sinif: "badge-gray" };
}

const teslimAlinabilir = s => s.durum === "sevk_edildi";

function renderSiparisler(liste) {
  siparislerCache = liste;
  const kapsayici = document.getElementById("gecmisListesi");
  const sayacEl = document.getElementById("gecmisSayac");
  if (sayacEl) sayacEl.textContent = `${liste.length} sipariş`;

  if (!liste.length) {
    kapsayici.innerHTML = `<div class="empty-state"><div class="empty-state__icon">📋</div><div class="empty-state__title">Henüz sipariş yok</div></div>`;
    return;
  }

  kapsayici.innerHTML = liste.map(s => {
    const d = durumEtiketiGetir(s);
    return `<div class="card order-card" data-id="${s.id}">
      <div class="order-card__main">
        <div class="order-card__name">${kacisEt(s.ad || s.subeAdi || "—")}</div>
        <div class="order-card__meta">
          <span class="badge ${d.sinif}">${d.etiket}</span>
          <span>${s.toplamUrun || 0} ürün</span>
          ${s.toplamKg ? `<span>${sayiBicimle(s.toplamKg)} KG</span>` : ""}
          <span>${tarihBicimle(s.olusturulmaTarihi)}</span>
        </div>
      </div>
      <div class="order-card__actions">
        ${DUZENLENEBILIR.includes(s.durum) ? `<button class="btn btn-ghost btn-sm" data-urun-ekle="${s.id}">+ Ürün Ekle</button>` : ""}
        ${teslimAlinabilir(s) ? `<button class="btn btn-green btn-sm" data-teslim="${s.id}">✅ Teslim Aldım</button>` : s.durum === "sevk_edildi" ? `<span class="u-text-soft" style="font-size:12px;">Aktarım bekleniyor…</span>` : ""}
        <button class="btn btn-ghost btn-sm" data-detay="${s.id}">Detay</button>
      </div>
    </div>`;
  }).join("");

  kapsayici.querySelectorAll("[data-detay]").forEach(btn =>
    btn.addEventListener("click", () => detayModalAc(siparislerCache.find(s => s.id === btn.dataset.detay)))
  );
  kapsayici.querySelectorAll("[data-teslim]").forEach(btn =>
    btn.addEventListener("click", () => teslimAlModalAc(btn.dataset.teslim))
  );
  kapsayici.querySelectorAll("[data-urun-ekle]").forEach(btn =>
    btn.addEventListener("click", () => urunEkleModalAc(btn.dataset.urunEkle))
  );
}

async function detayModalAc(siparis) {
  if (!siparis) return;
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-backdrop" data-role="backdrop"><div class="modal" style="max-width:600px;"><h3>${kacisEt(siparis.ad || "Sipariş")}</h3><div id="detayIcerik">⏳ Yükleniyor…</div><div class="modal__actions"><button class="btn btn-ghost" data-role="kapat">Kapat</button></div></div></div>`;
  root.querySelector('[data-role="kapat"]').onclick = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") root.innerHTML = ""; };
  try {
    const urunler = await urunleriniGetir(siparis.id);
    const d = durumEtiketiGetir(siparis);
    document.getElementById("detayIcerik").innerHTML = `
      <div style="margin-bottom:12px;"><span class="badge ${d.sinif}">${d.etiket}</span> · ${urunler.length} ürün${siparis.toplamKg ? " · " + sayiBicimle(siparis.toplamKg) + " KG" : ""}</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Kod</th><th>Ürün</th><th>İstenen</th><th>Durum</th></tr></thead>
        <tbody>${urunler.map(u => {
          const durum = u.eksik ? `<span class="badge badge-red">Eksik</span>` : u.toplandi ? `<span class="badge badge-green">✓</span>` : "—";
          const fark = u.gercekMiktar !== undefined && u.gercekMiktar !== u.miktar
            ? `<span class="badge badge-amber">→ ${sayiBicimle(u.gercekMiktar)}</span>` : "";
          return `<tr><td class="cell-code">${kacisEt(u.kod || "")}</td><td>${kacisEt(u.ad)}${u.katalogDisi ? ' <span class="badge badge-amber" style="font-size:10px;">Özel</span>' : ""}</td><td>${sayiBicimle(u.miktar)} ${kacisEt(u.birim || "")} ${fark}</td><td>${durum}</td></tr>`;
        }).join("")}</tbody>
      </table></div>`;
  } catch (err) { document.getElementById("detayIcerik").textContent = "Yüklenemedi."; }
}

async function teslimAlModalAc(siparisId) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal" style="max-width:580px;">
        <h3>✅ Teslimat Onayı</h3>
        <p style="font-size:13px;color:var(--color-ink-soft);">Gelen ürünleri işaretleyin.</p>
        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" id="tumunuSec">Tümünü İşaretle</button>
          <button class="btn btn-ghost btn-sm" id="temizle">Temizle</button>
          <button class="btn btn-ghost btn-sm" id="ekstraEkleBtn">+ Listede Olmayan Ürün</button>
        </div>
        <div id="teslimUrunler" style="max-height:380px;overflow-y:auto;">⏳</div>
        <div id="ekstraUrunler"></div>
        <div id="teslimOzet" style="margin-top:10px;font-size:13px;font-weight:600;"></div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-green" data-role="onayla">Onayla ✅</button>
        </div>
      </div>
    </div>`;

  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };

  const urunler = await urunleriniGetir(siparisId);
  // Sadece gönderilen ürünler — eksik olanları çıkar
  const gonderilen = urunler
    .filter(u => !u.eksik && u.miktar > 0)
    .sort((a, b) => (a.kod || "zzz").localeCompare(b.kod || "zzz", "tr"));

  let ekstraUrunler = []; // Listede olmayan ürünler

  function ozetiGuncelle() {
    const toplam = gonderilen.length + ekstraUrunler.length;
    const secili = root.querySelectorAll('input[data-tip="geldi"]:checked').length;
    document.getElementById("teslimOzet").textContent =
      `✅ ${secili} / ${toplam} ürün işaretlendi`;
  }

  function renderListe() {
    document.getElementById("teslimUrunler").innerHTML = gonderilen.map((u) => {
      const miktar = u.gercekMiktar ?? u.miktar;
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--color-border);">
        <input type="checkbox" data-uid="${u.id}" data-tip="geldi" style="width:18px;height:18px;flex-shrink:0;cursor:pointer;" />
        <div style="flex:1;">
          <div style="font-weight:600;font-size:13px;">${kacisEt(u.ad)}${u.katalogDisi ? ' <span class="badge badge-amber" style="font-size:10px;">Özel</span>' : ""}</div>
          <div style="font-size:11.5px;color:var(--color-ink-soft);">${kacisEt(u.kod || "—")} · ${sayiBicimle(miktar)} ${kacisEt(u.birim || "")}</div>
        </div>
      </div>`;
    }).join("");

    root.querySelectorAll('input[data-tip="geldi"]').forEach(cb => {
      cb.addEventListener("change", ozetiGuncelle);
    });

    // Ekstra ürünler
    document.getElementById("ekstraUrunler").innerHTML = ekstraUrunler.length
      ? `<div style="margin-top:10px;font-weight:700;font-size:12px;color:var(--color-ink-soft);margin-bottom:6px;">📦 LİSTEDE OLMAYAN GELENLER</div>` +
        ekstraUrunler.map((e, i) => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border);">
            <div style="flex:1;">
              <div style="font-weight:600;font-size:13px;">${kacisEt(e.ad)}</div>
              <div style="font-size:11.5px;color:var(--color-ink-soft);">${sayiBicimle(e.miktar)} ${kacisEt(e.birim)}</div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="this.closest('div').remove();ekstraUrunler.splice(${i},1);ozetiGuncelle();">✕</button>
          </div>`).join("")
      : "";

    ozetiGuncelle();
  }

  renderListe();

  document.getElementById("tumunuSec").onclick = () => {
    root.querySelectorAll('input[data-tip="geldi"]').forEach(cb => { cb.checked = true; });
    ozetiGuncelle();
  };
  document.getElementById("temizle").onclick = () => {
    root.querySelectorAll('input[data-tip="geldi"]').forEach(cb => { cb.checked = false; });
    ozetiGuncelle();
  };

  // Listede olmayan ürün ekle
  document.getElementById("ekstraEkleBtn").onclick = () => {
    const adInput = prompt("Ürün adı:");
    if (!adInput?.trim()) return;
    const miktarInput = prompt("Miktar:");
    const birimInput = prompt("Birim (KG, Adet...):");
    ekstraUrunler.push({
      ad: adInput.trim(),
      miktar: ondalikOku(miktarInput || "1") || 1,
      birim: birimInput?.trim() || "Adet"
    });
    renderListe();
  };

  root.querySelector('[data-role="onayla"]').onclick = async () => {
    const teslimatKalemleri = [
      ...gonderilen.map(u => ({
        urunId: u.id, ad: u.ad, kod: u.kod || "",
        birim: u.birim || "",
        siparisMiktari: u.gercekMiktar ?? u.miktar,
        gelenMiktar: root.querySelector(`input[data-uid="${u.id}"][data-tip="geldi"]`)?.checked
          ? (u.gercekMiktar ?? u.miktar) : 0,
        durum: root.querySelector(`input[data-uid="${u.id}"][data-tip="geldi"]`)?.checked
          ? "tamam" : "eksik"
      })),
      ...ekstraUrunler.map(e => ({
        urunId: "", ad: e.ad, kod: "", birim: e.birim,
        siparisMiktari: 0, gelenMiktar: e.miktar, durum: "fazla"
      }))
    ];
    await teslimatKaydet(siparisId, {
      teslimatKalemleri,
      onaylayanKullanici: mevcutKullanici.ad || mevcutKullanici.uid,
      subeAdi: mevcutKullanici.subeAdi || mevcutKullanici.ad
    });
    kapat();
    toast("✅ Teslimat onaylandı!", "success");
  };
}

function urunEkleModalAc(siparisId) {
  const siparis = siparislerCache.find(s => s.id === siparisId);
  const kontrolSonrasi = siparis && ["tamamlandi", "sevk_edildi"].includes(siparis.durum);
  const root = document.getElementById("modalRoot");
  const adOptions = katalogCache.map(u => `<option value="${kacisEt(u.ad)}">`).join("");
  const kodOptions = katalogCache.map(u => `<option value="${kacisEt(u.stokKodu || "")}">`).join("");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal" style="max-width:440px;">
        <h3>Ürün Ekle${kontrolSonrasi ? " — Eksik Olarak" : ""}</h3>
        ${kontrolSonrasi ? "<p style='font-size:13px;color:#F59E0B;'>⚠ Kontrol sonrası ekleme — eksikler listesine düşecek.</p>" : ""}
        <datalist id="ueAdList">${adOptions}</datalist>
        <datalist id="ueKodList">${kodOptions}</datalist>
        <div class="field"><label>Stok Kodu</label><input class="input" id="ueKod" list="ueKodList" autocomplete="off" /></div>
        <div class="field"><label>Ürün Adı</label><input class="input" id="ueAd" list="ueAdList" autocomplete="off" /></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div class="field"><label>Miktar</label><input class="input" type="text" inputmode="decimal" id="ueMiktar" /></div>
          <div class="field"><label>Birim</label><input class="input" id="ueBirim" value="KG" /></div>
        </div>
        <div class="field"><label>Not</label><input class="input" id="ueNot" placeholder="İsteğe bağlı" /></div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="ekle">Ekle</button>
        </div>
      </div>
    </div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
  const ueKod = root.querySelector("#ueKod"), ueAd = root.querySelector("#ueAd");
  const ueBirim = root.querySelector("#ueBirim");
  function doldur(u) { if (!u) return; if (!ueKod.value) ueKod.value = u.stokKodu || ""; if (!ueAd.value) ueAd.value = u.ad || ""; if (!ueBirim.value) ueBirim.value = u.birim || ""; }
  ueAd.addEventListener("change", () => doldur(katalogCache.find(u => u.ad === ueAd.value)));
  ueKod.addEventListener("change", () => doldur(katalogCache.find(u => u.stokKodu === ueKod.value)));
  root.querySelector('[data-role="ekle"]').onclick = async () => {
    const ad = ueAd.value.trim();
    if (!ad) { toast("Ürün adı zorunlu.", "error"); return; }
    await urunEkle(siparisId, {
      kod: ueKod.value.trim(), ad,
      miktar: ondalikOku(document.getElementById("ueMiktar").value),
      birim: ueBirim.value.trim(),
      eksik: kontrolSonrasi ? true : false,
      subeEkledi: true,
      subeNotu: document.getElementById("ueNot").value.trim()
    });
    kapat();
    toast(kontrolSonrasi ? "Eksikler listesine eklendi." : "Ürün eklendi.", "success");
  };
}
