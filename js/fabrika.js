// ============================================================================
// FABRİKA EKRANI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import {
  katalogDinle, subeSimarisiOlustur, stokGirisiKaydet, stokGirisleriGetir,
  subeSiparisleriDinle, urunleriniGetir, fabrikaSiparisleriniDinle, fabrikaSiparisiHazirla
} from "./veri.js?v=20261116";
import { arayuzHazirla, toast, onayIste, kacisEt, sayiBicimle, ondalikOku, excelOlarakIndir, tarihBicimle, sesCal } from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;
let katalogCache = [];
let miktarlar = {};
let ozelKalemler = [];
let aktifSekme = "siparis";

const bugun = new Date().toISOString().slice(0, 10);
document.getElementById("girisTarih").value = bugun;

sayfaKorumasi(["fabrika", "admin"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  katalogDinle(katalogGuncellendi);
  subeSiparisleriDinle(kullanici.uid, renderSiparislerim);   // fabrikanın merkezden istedikleri
  fabrikaSiparisleriniDinle(merkezSiparisleriGeldi);         // merkezin fabrikadan istedikleri
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth); window.location.href = "index.html";
});

/* ---- Sekmeler ---- */
document.querySelectorAll("[data-sekme]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-sekme]").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    aktifSekme = btn.dataset.sekme;
    document.getElementById("siparisBloku").classList.toggle("u-hidden", aktifSekme !== "siparis");
    document.getElementById("siparislerimBloku").classList.toggle("u-hidden", aktifSekme !== "siparislerim");
    document.getElementById("merkezBloku").classList.toggle("u-hidden", aktifSekme !== "merkez");
    document.getElementById("girisBloku").classList.toggle("u-hidden", aktifSekme !== "giris");
    document.getElementById("gecmisBloku").classList.toggle("u-hidden", aktifSekme !== "gecmis");
    if (aktifSekme === "gecmis") gecmisYukle();
  });
});

/* ---- Katalog ---- */
function katalogGuncellendi(liste) {
  katalogCache = liste.filter(u => u.aktif !== false);
  document.getElementById("yukleniyorAlani").classList.add("u-hidden");
  if (!katalogCache.length) {
    document.getElementById("bosKatalog").classList.remove("u-hidden");
    document.getElementById("katalogAlani").classList.add("u-hidden");
    return;
  }
  document.getElementById("bosKatalog").classList.add("u-hidden");
  document.getElementById("katalogAlani").classList.remove("u-hidden");

  // Kategori dropdown
  const kategoriler = [...new Set(katalogCache.map(u => (u.kategori || "").trim()).filter(Boolean))].sort();
  const sel = document.getElementById("kategoriFiltre");
  const mevcut = sel.value;
  sel.innerHTML = '<option value="">Tüm Kategoriler</option>' +
    kategoriler.map(k => `<option value="${kacisEt(k)}">${kacisEt(k)}</option>`).join("");
  if (mevcut) sel.value = mevcut;

  // Stok girişi autocomplete
  document.getElementById("girisUrunList").innerHTML =
    katalogCache.map(u => `<option value="${kacisEt(u.ad)}">${kacisEt(u.stokKodu || "")}</option>`).join("");

  renderKatalog();
}

document.getElementById("urunAraInput").addEventListener("input", renderKatalog);
document.getElementById("kategoriFiltre").addEventListener("change", renderKatalog);

function renderKatalog() {
  const ara = document.getElementById("urunAraInput").value.toLowerCase().trim();
  const kat = document.getElementById("kategoriFiltre").value.trim();
  const liste = katalogCache.filter(u => {
    const katOk = !kat || (u.kategori || "").trim() === kat;
    const araOk = !ara || (u.ad || "").toLowerCase().includes(ara) || (u.stokKodu || "").toLowerCase().includes(ara);
    return katOk && araOk;
  });

  const gruplar = new Map();
  liste.forEach(u => {
    const k = (u.kategori || "").trim() || "Diğer";
    if (!gruplar.has(k)) gruplar.set(k, []);
    gruplar.get(k).push(u);
  });

  let tablo = "";
  let kartlar = "";
  gruplar.forEach((urunler, kategori) => {
    tablo += `<tr><td colspan="4" style="background:var(--color-surface-2);font-weight:700;font-size:12.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-ink-soft);padding:8px 12px;">${kacisEt(kategori)}</td></tr>`;
    kartlar += `<div style="background:var(--color-surface-2);font-weight:700;font-size:12px;text-transform:uppercase;color:var(--color-ink-soft);padding:8px 12px;border-radius:var(--radius-sm);margin:14px 0 6px;">${kacisEt(kategori)}</div>`;
    urunler.forEach(u => {
      const val = miktarlar[u.id] || "";
      tablo += `<tr>
        <td>${kacisEt(u.ad)}<br><span class="cell-code" style="font-size:11px;">${kacisEt(u.stokKodu || "")}</span></td>
        <td>${kacisEt(u.kategori || "")}</td>
        <td>${kacisEt(u.birim || "")}</td>
        <td><input class="input miktar-input" type="text" inputmode="decimal" data-id="${u.id}" value="${val}" placeholder="0" style="width:90px;" /></td>
      </tr>`;
      kartlar += `<div class="row-card">
        <div class="row-card__top">
          <div>
            <div class="row-card__name">${kacisEt(u.ad)}</div>
            <div class="row-card__code">${kacisEt(u.birim || "")} · ${kacisEt(u.stokKodu || "")}</div>
          </div>
        </div>
        <input class="input miktar-input" type="text" inputmode="decimal" data-id="${u.id}" value="${val}" placeholder="Miktar girin…" style="margin-top:8px;" />
      </div>`;
    });
  });

  document.getElementById("katalogGovde").innerHTML = tablo;
  document.getElementById("katalogKartlar").innerHTML = kartlar;
}

document.addEventListener("input", (e) => {
  if (!e.target.classList.contains("miktar-input")) return;
  const id = e.target.dataset.id;
  const val = ondalikOku(e.target.value);
  if (val > 0) miktarlar[id] = e.target.value;
  else delete miktarlar[id];
  document.getElementById("siparisGonderBtn").disabled = Object.keys(miktarlar).length === 0 && ozelKalemler.length === 0;
});

/* ---- Katalog Dışı Ekle ---- */
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
    ozelKalemler.push({
      ad, miktar: ondalikOku(document.getElementById("odMiktar").value) || 1,
      birim: document.getElementById("odBirim").value.trim() || "KG",
      not: document.getElementById("odNot").value.trim(), katalogDisi: true
    });
    renderOzelKalemler();
    document.getElementById("siparisGonderBtn").disabled = false;
    kapat();
    toast(`"${ad}" eklendi.`, "success", 2000);
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
      <button class="btn btn-danger btn-sm" data-sil="${i}">✕</button>
    </div>`).join("");
  liste.querySelectorAll("[data-sil]").forEach(btn => {
    btn.addEventListener("click", () => {
      ozelKalemler.splice(Number(btn.dataset.sil), 1);
      renderOzelKalemler();
    });
  });
}

/* ---- Sipariş Gönder (fabrika → merkez) ----
   Şube siparişiyle aynı fonksiyon; siparişe kaynak:"fabrika" eklenir, toplama ve
   kontrol ekranlarında 🏭 FABRİKA etiketiyle görünür. */
function sekmeyeGec(sekme) {
  document.querySelector(`[data-sekme="${sekme}"]`)?.click();
}

document.getElementById("siparisGonderBtn").addEventListener("click", async () => {
  const secilen = Object.entries(miktarlar).filter(([, v]) => ondalikOku(v) > 0);
  if (!secilen.length && !ozelKalemler.length) { toast("Ürün seçilmedi.", "error"); return; }
  const onay = await onayIste({
    baslik: "Siparişi Gönder",
    metin: `${secilen.length + ozelKalemler.length} çeşit ürün için merkeze sipariş gönderilecek.`,
    onayMetni: "Gönder"
  });
  if (!onay) return;
  const satirlar = [
    ...secilen.map(([id, miktar]) => {
      const u = katalogCache.find((x) => x.id === id) || {};
      return { ...u, miktar: ondalikOku(miktar) };
    }),
    ...ozelKalemler.map((k) => ({
      ad: k.ad, stokKodu: "", barkod: "", birim: k.birim,
      miktar: k.miktar, kategori: "Özel Talep", katalogDisi: true, subeNotu: k.not || ""
    }))
  ];
  const btn = document.getElementById("siparisGonderBtn");
  btn.disabled = true;
  try {
    await subeSimarisiOlustur({
      subeAdi: mevcutKullanici.subeAdi || "FABRİKA",
      subeId: mevcutKullanici.uid,
      olusturan: mevcutKullanici.uid,
      satirlar,
      ekAlanlar: { kaynak: "fabrika" }
    });
    miktarlar = {};
    ozelKalemler.length = 0;
    renderOzelKalemler();
    document.querySelectorAll(".miktar-input").forEach((i) => { i.value = ""; });
    toast("✅ Sipariş merkeze gönderildi.", "success");
    sekmeyeGec("siparislerim");
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    toast("Sipariş gönderilemedi: " + (err.code === "permission-denied" ? "izin yok (Firestore kuralları güncellenmeli)" : (err.message || err)), "error", 8000);
  }
});

/* ---- Siparişlerim (fabrika → merkez) ---- */
const SIPARIS_DURUM = {
  beklemede: ["↩ Düzenleme bekliyor", "badge-red"],
  toplaniyor: ["⏳ Hazırlanıyor", "badge-amber"],
  toplandi: ["🔍 Kontrolde", "badge-blue"],
  kontrol_ediliyor: ["🔍 Kontrolde", "badge-blue"],
  tamamlandi: ["📦 Hazır", "badge-green"],
  sevk_edildi: ["🚚 Yolda", "badge-blue"],
  teslim_edildi: ["✅ Teslim alındı", "badge-green"],
  arsivlendi: ["🗂 Arşiv", "badge-gray"]
};

function renderSiparislerim(liste) {
  const kap = document.getElementById("siparislerimListe");
  document.getElementById("siparislerimBos").classList.toggle("u-hidden", liste.length !== 0);
  kap.innerHTML = liste.map((s) => {
    const [etiket, sinif] = SIPARIS_DURUM[s.durum] || [s.durum, "badge-gray"];
    return `<div class="card order-card">
      <div class="order-card__main">
        <div class="order-card__name">${kacisEt(s.ad || "Sipariş")}</div>
        <div class="order-card__meta">
          <span class="badge ${sinif}">${etiket}</span>
          <span>${s.toplamUrun || 0} ürün</span>
          ${s.eksikUrun ? `<span class="u-text-soft">${s.eksikUrun} eksik</span>` : ""}
          <span>${tarihBicimle(s.olusturulmaTarihi)}</span>
        </div>
      </div>
      <div class="order-card__actions">
        <button class="btn btn-ghost btn-sm" data-sdetay="${s.id}">Detay</button>
      </div>
    </div>`;
  }).join("");
  kap.querySelectorAll("[data-sdetay]").forEach((b) => b.onclick = () => siparisDetayAc(liste.find((x) => x.id === b.dataset.sdetay)));
}

async function siparisDetayAc(s) {
  if (!s) return;
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-backdrop" data-role="backdrop"><div class="modal" style="max-width:600px;">
    <h3>${kacisEt(s.ad || "Sipariş")}</h3><div id="fsDetay">⏳ Yükleniyor…</div>
    <div class="modal__actions"><button class="btn btn-primary" data-role="kapat">Kapat</button></div></div></div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="kapat"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
  try {
    const urunler = await urunleriniGetir(s.id);
    document.getElementById("fsDetay").innerHTML = `<div class="table-wrap"><table class="data-table fs-tablo">
      <thead><tr><th>Kod</th><th>Ürün</th><th class="sayi">İstenen</th><th>Durum</th></tr></thead>
      <tbody>${urunler.map((u) => `<tr>
        <td class="cell-code">${kacisEt(u.kod || "")}</td>
        <td>${kacisEt(u.ad)}</td>
        <td class="sayi">${sayiBicimle(u.miktar)} ${kacisEt(u.birim || "")}</td>
        <td>${u.eksik ? '<span class="badge badge-red">Eksik</span>' : u.toplandi ? '<span class="badge badge-green">✓ Toplandı</span>' : "—"}</td>
      </tr>`).join("")}</tbody></table></div>`;
  } catch (e) {
    document.getElementById("fsDetay").textContent = "Yüklenemedi.";
  }
}

/* ---- Merkezden Gelen (merkez → fabrika) ---- */
const MERKEZ_DURUM = {
  bekliyor: ["🆕 Yeni", "badge-red"],
  hazirlaniyor: ["⏳ Hazırlanıyor", "badge-amber"],
  gonderildi: ["🚚 Gönderildi", "badge-blue"],
  teslim_alindi: ["✅ Merkez teslim aldı", "badge-green"],
  iptal: ["✕ İptal", "badge-gray"]
};
let merkezSiparisleri = [];
let merkezIlkYukleme = true;

function merkezSiparisleriGeldi(liste) {
  const eskiIdler = new Set(merkezSiparisleri.map((s) => s.id));
  const yeniler = liste.filter((s) => s.durum === "bekliyor" && !eskiIdler.has(s.id));
  if (!merkezIlkYukleme && yeniler.length) {
    sesCal("basari");
    toast(`🏭 Merkezden yeni sipariş: ${yeniler.map((s) => s.no).join(", ")}`, "info", 8000);
  }
  merkezIlkYukleme = false;
  merkezSiparisleri = liste;
  const acik = liste.filter((s) => ["bekliyor", "hazirlaniyor"].includes(s.durum)).length;
  const sayac = document.getElementById("merkezSayac");
  sayac.textContent = acik;
  sayac.classList.toggle("u-hidden", acik === 0);
  renderMerkez();
}

function renderMerkez() {
  const kap = document.getElementById("merkezListe");
  const liste = merkezSiparisleri.filter((s) => s.durum !== "iptal" || (s.iptalTarihi?.toMillis?.() || 0) > Date.now() - 3 * 864e5);
  document.getElementById("merkezBos").classList.toggle("u-hidden", liste.length !== 0);
  kap.innerHTML = liste.map((s) => {
    const [etiket, sinif] = MERKEZ_DURUM[s.durum] || [s.durum, "badge-gray"];
    const acik = ["bekliyor", "hazirlaniyor"].includes(s.durum);
    return `<div class="card order-card${s.durum === "bekliyor" ? " is-aktarildi" : ""}">
      <div class="order-card__main">
        <div class="order-card__name">${kacisEt(s.no)}</div>
        <div class="order-card__meta">
          <span class="badge ${sinif}">${etiket}</span>
          <span>${(s.kalemler || []).length} ürün</span>
          ${s.termin ? `<span>📅 Termin: ${kacisEt(new Date(s.termin + "T00:00").toLocaleDateString("tr-TR"))}</span>` : ""}
          <span>${tarihBicimle(s.olusturmaTarihi)}</span>
        </div>
        ${s.not ? `<div class="u-text-soft" style="font-size:12.5px;margin-top:4px;">📝 ${kacisEt(s.not)}</div>` : ""}
      </div>
      <div class="order-card__actions">
        ${acik ? `<button class="btn btn-primary btn-sm" data-hazirla="${s.id}">Hazırla / Gönder →</button>` : `<button class="btn btn-ghost btn-sm" data-mdetay="${s.id}">Detay</button>`}
      </div>
    </div>`;
  }).join("");
  kap.querySelectorAll("[data-hazirla]").forEach((b) => b.onclick = () => hazirlaModalAc(merkezSiparisleri.find((x) => x.id === b.dataset.hazirla)));
  kap.querySelectorAll("[data-mdetay]").forEach((b) => b.onclick = () => merkezDetayAc(merkezSiparisleri.find((x) => x.id === b.dataset.mdetay)));
}

function hazirlaModalAc(s) {
  if (!s) return;
  const root = document.getElementById("modalRoot");
  const tarihYaz = (t) => new Date(t + "T00:00").toLocaleDateString("tr-TR");
  // Ekrandaki satırlar: mevcut kalemler + bu pencerede eklenenler
  let satirlar = (s.kalemler || []).map((k, i) => ({ ...k, eskiIndeks: i, gonderilen: k.gonderilen ?? k.miktar }));
  const silinecekler = new Set();

  function okuEkran() {
    root.querySelectorAll(".fs-gonderilen").forEach((inp) => {
      const sat = satirlar[Number(inp.dataset.i)];
      if (sat) sat.gonderilen = ondalikOku(inp.value) || 0;
    });
  }

  function ciz() {
    const gorunen = satirlar.map((k, i) => ({ k, i })).filter(({ k }) => !(k.eskiIndeks !== undefined && silinecekler.has(k.eskiIndeks)));
    root.innerHTML = `<div class="modal-backdrop" data-role="backdrop"><div class="modal" style="max-width:680px;">
    <h3>🏭 ${kacisEt(s.no)}</h3>
    <p style="font-size:13px;">${s.termin ? `Termin: <b>${kacisEt(tarihYaz(s.termin))}</b> · ` : ""}Siparişi veren: ${kacisEt(s.olusturanAd || "Merkez")}</p>
    ${s.not ? `<p style="font-size:13px;">📝 ${kacisEt(s.not)}</p>` : ""}
    <div class="table-wrap" style="max-height:46vh;overflow-y:auto;"><table class="data-table fs-tablo">
      <thead><tr><th>Ürün</th><th class="sayi">İstenen</th><th class="sayi">Gönderilen</th><th></th></tr></thead>
      <tbody>${gorunen.map(({ k, i }) => `<tr>
        <td>${kacisEt(k.ad)}${k.fabrikaEkledi ? ' <span class="badge badge-amber" style="font-size:10px;">Fabrika ekledi</span>' : ""}<div class="cell-code" style="font-size:11px;">${kacisEt(k.kod || "")}</div></td>
        <td class="sayi">${k.fabrikaEkledi ? "—" : `${sayiBicimle(k.miktar)} ${kacisEt(k.birim || "")}`}</td>
        <td class="sayi"><input class="input fs-gonderilen" data-i="${i}" type="text" inputmode="decimal" value="${k.gonderilen}" style="width:90px;text-align:right;" /> <span style="font-size:11px;color:var(--color-ink-soft);">${k.fabrikaEkledi ? kacisEt(k.birim || "") : ""}</span></td>
        <td>${k.fabrikaEkledi ? `<button class="btn btn-ghost btn-sm" data-kaldir="${i}" title="Kaldır">✕</button>` : ""}</td>
      </tr>`).join("")}</tbody></table></div>
    <div id="fsEkleForm" class="u-hidden" style="margin-top:10px;padding:10px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface-2);">
      <div style="font-weight:700;font-size:12.5px;margin-bottom:6px;">➕ Siparişte olmayan ürün</div>
      <datalist id="fsKodList">${katalogCache.map((u) => `<option value="${kacisEt(u.stokKodu || u.kod || "")}">${kacisEt(u.ad || "")}</option>`).join("")}</datalist>
      <datalist id="fsAdList">${katalogCache.map((u) => `<option value="${kacisEt(u.ad || "")}">`).join("")}</datalist>
      <div style="display:grid;grid-template-columns:110px 1fr;gap:6px;">
        <input class="input" id="fsEkKod" list="fsKodList" placeholder="Stok kodu" autocomplete="off" />
        <input class="input" id="fsEkAd" list="fsAdList" placeholder="Ürün adı" autocomplete="off" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:6px;margin-top:6px;">
        <input class="input" id="fsEkMiktar" type="text" inputmode="decimal" placeholder="Gönderilen miktar" />
        <input class="input" id="fsEkBirim" placeholder="Birim" value="KG" />
        <button class="btn btn-ghost btn-sm" id="fsEkVazgec">Vazgeç</button>
        <button class="btn btn-primary btn-sm" id="fsEkEkle">Ekle</button>
      </div>
    </div>
    <div style="margin-top:8px;"><button class="btn btn-ghost btn-sm" id="fsEkleAc">+ Ürün Ekle</button></div>
    <div class="field" style="margin-top:10px;"><label>Not (isteğe bağlı)</label><input class="input" id="fsNot" value="${kacisEt(notDegeri)}" placeholder="Örn. 2 kalem eksik, yarın tamamlanacak" /></div>
    <div class="modal__actions" style="flex-wrap:wrap;gap:8px;">
      <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
      <button class="btn btn-ghost" data-role="yazdir">🖨 Sevk Listesi</button>
      <button class="btn btn-ghost" data-role="kaydet">💾 Kaydet (hazırlanıyor)</button>
      <button class="btn btn-green" data-role="gonder">🚚 Gönderildi</button>
    </div></div></div>`;
    baglan();
  }

  let notDegeri = s.gonderimNotu || "";
  const kapat = () => { root.innerHTML = ""; };

  function baglan() {
    root.querySelector('[data-role="iptal"]').onclick = kapat;
    root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
    root.querySelector("#fsNot").addEventListener("input", (e) => { notDegeri = e.target.value; });
    root.querySelectorAll("[data-kaldir]").forEach((b) => b.onclick = () => {
      okuEkran();
      const i = Number(b.dataset.kaldir);
      const k = satirlar[i];
      if (k.eskiIndeks !== undefined) silinecekler.add(k.eskiIndeks); else satirlar.splice(i, 1);
      ciz();
    });
    const form = root.querySelector("#fsEkleForm");
    const kod = root.querySelector("#fsEkKod"), ad = root.querySelector("#fsEkAd"), birim = root.querySelector("#fsEkBirim");
    const bulKod = (v) => katalogCache.find((u) => (u.stokKodu || u.kod || "") === v.trim());
    const bulAd = (v) => katalogCache.find((u) => (u.ad || "") === v.trim());
    kod.addEventListener("change", () => { const u = bulKod(kod.value); if (u) { ad.value = u.ad || ""; if (u.birim) birim.value = u.birim; } });
    ad.addEventListener("change", () => { const u = bulAd(ad.value); if (u) { kod.value = u.stokKodu || u.kod || ""; if (u.birim) birim.value = u.birim; } });
    root.querySelector("#fsEkleAc").onclick = () => { form.classList.remove("u-hidden"); kod.focus(); };
    root.querySelector("#fsEkVazgec").onclick = () => form.classList.add("u-hidden");
    root.querySelector("#fsEkEkle").onclick = () => {
      const adV = ad.value.trim();
      const miktar = ondalikOku(root.querySelector("#fsEkMiktar").value);
      if (!adV) { toast("Ürün adını girin.", "error"); return; }
      if (!miktar || miktar <= 0) { toast("Gönderilen miktarı girin.", "error"); return; }
      okuEkran();
      satirlar.push({ kod: kod.value.trim(), ad: adV, birim: birim.value.trim() || "KG", miktar: 0, gonderilen: miktar, fabrikaEkledi: true });
      ciz();
    };
    root.querySelector('[data-role="kaydet"]').onclick = () => kaydet(false);
    root.querySelector('[data-role="gonder"]').onclick = () => kaydet(true);
    root.querySelector('[data-role="yazdir"]').onclick = () => {
      okuEkran();
      const liste = satirlar.filter((k) => !(k.eskiIndeks !== undefined && silinecekler.has(k.eskiIndeks)));
      sevkListesiYazdir({ ...s, kalemler: liste }, liste.map((k) => k.gonderilen), notDegeri.trim());
    };
  }

  async function kaydet(gonder) {
    okuEkran();
    const mevcut = satirlar.filter((k) => k.eskiIndeks !== undefined);
    const gonderilenler = (s.kalemler || []).map((_, i) => mevcut.find((k) => k.eskiIndeks === i)?.gonderilen ?? null);
    const ekKalemler = satirlar.filter((k) => k.eskiIndeks === undefined);
    if (gonder) {
      const eksik = mevcut.filter((k) => !k.fabrikaEkledi && !silinecekler.has(k.eskiIndeks) && Number(k.gonderilen) < Number(k.miktar)).length;
      const ek = ekKalemler.length + mevcut.filter((k) => k.fabrikaEkledi && !silinecekler.has(k.eskiIndeks)).length;
      const ok = await onayIste({
        baslik: "Gönderildi olarak işaretle",
        metin: [eksik ? `${eksik} üründe istenenden az gönderiliyor.` : "İstenen ürünler tam gönderiliyor.",
                ek ? `${ek} ürün siparişte yoktu, fabrika ekledi.` : "", "Merkez teslim alırken bunları görecek."].filter(Boolean).join(" "),
        onayMetni: "Gönderildi"
      });
      if (!ok) return;
    }
    try {
      await fabrikaSiparisiHazirla(s.id, {
        gonderilenler, gonder, not: notDegeri.trim(),
        gonderenAd: mevcutKullanici.ad || mevcutKullanici.uid,
        ekKalemler, silinecekler: [...silinecekler]
      });
      kapat();
      toast(gonder ? "🚚 Gönderildi olarak işaretlendi. Merkez teslim alınca kapanır." : "Kaydedildi.", "success");
    } catch (err) {
      toast("Kaydedilemedi: " + (err.message || err), "error");
    }
  }

  ciz();
}

/* ---- Sevk listesi (yazdırılabilir) ---- */
function sevkListesiYazdir(s, gonderilenler, not) {
  const kalemler = (s.kalemler || []).map((k, i) => ({
    ...k, gonderilen: gonderilenler ? gonderilenler[i] : (k.gonderilen ?? k.miktar)
  }));
  const gidenler = kalemler.filter((k) => Number(k.gonderilen) > 0);
  const eksikler = kalemler.filter((k) => Number(k.gonderilen) < Number(k.miktar));
  const birimToplam = {};
  gidenler.forEach((k) => {
    const b = (k.birim || "").toUpperCase() || "—";
    birimToplam[b] = (birimToplam[b] || 0) + (Number(k.gonderilen) || 0);
  });
  const e = kacisEt;
  const bugun = new Date().toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const logo = (ad) => (ad === "logo-tuglular.png" ? LOGO_TUGLULAR : LOGO_TUGLUBEY);
  const toplamYazi = Object.entries(birimToplam).map(([b, m]) => `${e(sayiBicimle(Math.round(m * 1000) / 1000))} ${e(b)}`).join(" + ") || "—";
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Sevk Listesi ${e(s.no || "")}</title>
  <style>
    @page { size: A4; margin: 12mm 12mm 16mm;
      @bottom-left { content: "Tuğlular Kuruyemiş Gıda San. Ltd. Şti."; font: 9px Arial, sans-serif; color: #6b7280; }
      @bottom-right { content: "Sayfa " counter(page) " / " counter(pages); font: 9px Arial, sans-serif; color: #6b7280; } }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    :root { --lacivert: #12306B; --altin: #B8892B; --murekkep: #111827; --gri: #6b7280; --cizgi: #d1d5db; --zemin: #f3f5f9; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: var(--murekkep); font-size: 11.5px; margin: 0; }
    .ust { display: grid; grid-template-columns: 170px 1fr 120px; align-items: center; gap: 14px; padding-bottom: 10px; }
    .ust img { display: block; max-width: 100%; height: auto; }
    .ust .marka { justify-self: end; width: 110px; }
    .baslik { text-align: center; }
    .baslik h1 { margin: 0; font-size: 24px; letter-spacing: 3px; color: var(--lacivert); font-weight: 800; }
    .baslik .alt { margin-top: 3px; font-size: 11px; letter-spacing: 1.5px; color: var(--gri); text-transform: uppercase; }
    .serit { height: 4px; background: linear-gradient(90deg, var(--lacivert) 0 70%, var(--altin) 70% 100%); border-radius: 2px; margin-bottom: 12px; }
    .bilgi { display: grid; grid-template-columns: repeat(5, 1fr); border: 1px solid var(--cizgi); border-radius: 6px; overflow: hidden; margin-bottom: 14px; }
    .bilgi div { padding: 7px 10px; border-right: 1px solid var(--cizgi); }
    .bilgi div:last-child { border-right: 0; }
    .bilgi small { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .8px; color: var(--gri); margin-bottom: 2px; }
    .bilgi b { font-size: 12.5px; }
    .bilgi .no b { color: var(--lacivert); font-size: 14px; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid var(--cizgi); border-radius: 6px; overflow: hidden; }
    thead th { background: var(--lacivert); color: #fff; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .7px; padding: 7px 8px; text-align: left; }
    tbody td { padding: 6px 8px; border-top: 1px solid var(--cizgi); vertical-align: middle; }
    tbody tr:nth-child(even) td { background: var(--zemin); }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    .s { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .k { font-family: Consolas, "Courier New", monospace; font-size: 11px; color: #374151; white-space: nowrap; }
    .sira { color: var(--gri); width: 26px; }
    .kutu { width: 34px; text-align: center; }
    .kutu span { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #6b7280; border-radius: 3px; }
    .gonderilen { font-weight: 700; }
    .eksik { color: #B91C1C; }
    .ozet { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 10px; padding: 9px 12px; border-left: 4px solid var(--altin); background: #fbf7ee; border-radius: 4px; font-size: 12px; }
    .ozet b { color: var(--lacivert); }
    .uyari { color: #B91C1C; font-weight: 700; }
    .notlar { display: grid; gap: 6px; margin-top: 10px; }
    .not { padding: 7px 10px; border: 1px solid var(--cizgi); border-radius: 4px; }
    .not small { color: var(--gri); text-transform: uppercase; font-size: 9px; letter-spacing: .8px; display: block; margin-bottom: 2px; }
    .imza { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 28px; page-break-inside: avoid; }
    .imza div { border: 1px solid var(--cizgi); border-radius: 6px; padding: 8px 10px; height: 92px; position: relative; }
    .imza h4 { margin: 0 0 4px; font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: var(--lacivert); }
    .imza p { position: absolute; left: 10px; right: 10px; bottom: 8px; margin: 0; font-size: 9.5px; color: var(--gri); border-top: 1px dotted #9ca3af; padding-top: 3px; }
  </style></head><body>
  <div class="ust">
    <img src="${logo("logo-tuglular.png")}" alt="Tuğlular" />
    <div class="baslik"><h1>SEVK LİSTESİ</h1><div class="alt">Fabrika → Merkez Depo</div></div>
    <img class="marka" src="${logo("logo-tuglubey.png")}" alt="Tuğlubey" />
  </div>
  <div class="serit"></div>
  <div class="bilgi">
    <div class="no"><small>Sipariş No</small><b>${e(s.no || "—")}</b></div>
    <div><small>Sipariş Tarihi</small><b>${e(tarihBicimle(s.olusturmaTarihi) || "—")}</b></div>
    <div><small>Termin</small><b>${s.termin ? e(new Date(s.termin + "T00:00").toLocaleDateString("tr-TR")) : "—"}</b></div>
    <div><small>Hazırlayan</small><b>${e(mevcutKullanici?.ad || "—")}</b></div>
    <div><small>Yazdırma</small><b>${e(bugun)}</b></div>
  </div>
  <table>
    <thead><tr><th class="sira">#</th><th>Stok Kodu</th><th>Ürün</th><th class="s">İstenen</th><th class="s">Gönderilen</th><th>Birim</th><th class="kutu">Kontrol</th></tr></thead>
    <tbody>${kalemler.map((k, i) => {
      const az = Number(k.gonderilen) < Number(k.miktar);
      return `<tr><td class="sira s">${i + 1}</td><td class="k">${e(k.kod || "")}</td><td>${e(k.ad || "")}${k.fabrikaEkledi ? ' <small style="color:#B8892B;font-weight:700;">(ek)</small>' : ""}</td>
        <td class="s">${k.fabrikaEkledi ? "—" : e(sayiBicimle(k.miktar))}</td>
        <td class="s gonderilen${az ? " eksik" : ""}">${e(sayiBicimle(k.gonderilen))}</td>
        <td>${e(k.birim || "")}</td><td class="kutu"><span></span></td></tr>`;
    }).join("")}</tbody>
  </table>
  <div class="ozet">
    <span><b>${gidenler.length}</b> kalem gönderiliyor</span>
    <span>Toplam: <b>${toplamYazi}</b></span>
    ${eksikler.length ? `<span class="uyari">${eksikler.length} kalem istenenden az</span>` : `<span>Tüm kalemler tam</span>`}
  </div>
  ${(s.not || not) ? `<div class="notlar">
    ${s.not ? `<div class="not"><small>Sipariş notu</small>${e(s.not)}</div>` : ""}
    ${not ? `<div class="not"><small>Gönderim notu</small>${e(not)}</div>` : ""}
  </div>` : ""}
  <div class="imza">
    <div><h4>Teslim Eden — Fabrika</h4><p>Ad Soyad / İmza</p></div>
    <div><h4>Araç / Şoför</h4><p>Plaka · Ad Soyad / İmza</p></div>
    <div><h4>Teslim Alan — Merkez</h4><p>Ad Soyad / İmza / Tarih</p></div>
  </div>
  </body></html>`;
  const cerceve = document.createElement("iframe");
  cerceve.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(cerceve);
  const d = cerceve.contentWindow.document;
  d.open(); d.write(html); d.close();
  // Logolar yüklenince (en fazla 3 sn) yazdır
  const resimler = [...d.images];
  Promise.race([
    Promise.all(resimler.map((r) => r.complete ? 0 : new Promise((ok) => { r.onload = r.onerror = ok; }))),
    new Promise((ok) => setTimeout(ok, 3000))
  ]).then(() => {
    cerceve.contentWindow.focus();
    cerceve.contentWindow.print();
    setTimeout(() => cerceve.remove(), 60000);
  });
}

function merkezDetayAc(s) {
  if (!s) return;
  const root = document.getElementById("modalRoot");
  const teslim = s.durum === "teslim_alindi";
  root.innerHTML = `<div class="modal-backdrop" data-role="backdrop"><div class="modal" style="max-width:640px;">
    <h3>🏭 ${kacisEt(s.no)}</h3>
    <div class="table-wrap" style="max-height:55vh;overflow-y:auto;"><table class="data-table fs-tablo">
      <thead><tr><th>Ürün</th><th class="sayi">İstenen</th><th class="sayi">Gönderilen</th>${teslim ? '<th class="sayi">Merkeze gelen</th>' : ""}</tr></thead>
      <tbody>${(s.kalemler || []).map((k) => {
        const fark = teslim ? (Number(k.gelen) || 0) - (Number(k.gonderilen ?? k.miktar) || 0) : 0;
        return `<tr><td>${kacisEt(k.ad)}</td>
          <td class="sayi">${sayiBicimle(k.miktar)} ${kacisEt(k.birim || "")}</td>
          <td class="sayi">${k.gonderilen === null || k.gonderilen === undefined ? "—" : sayiBicimle(k.gonderilen)}</td>
          ${teslim ? `<td class="sayi">${sayiBicimle(k.gelen)}${fark ? ` <span class="badge ${fark < 0 ? "badge-red" : "badge-blue"}">${fark > 0 ? "+" : ""}${sayiBicimle(fark)}</span>` : ""}</td>` : ""}
        </tr>`;
      }).join("")}</tbody></table></div>
    ${s.teslimNotu ? `<p style="font-size:13px;margin-top:8px;">Merkez notu: ${kacisEt(s.teslimNotu)}</p>` : ""}
    <div class="modal__actions"><button class="btn btn-ghost" data-role="yazdir">🖨 Sevk Listesi</button><button class="btn btn-primary" data-role="kapat">Kapat</button></div></div></div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="kapat"]').onclick = kapat;
  root.querySelector('[data-role="yazdir"]').onclick = () => sevkListesiYazdir(s, null, s.gonderimNotu || "");
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
}

/* ---- Stok Girişi ---- */
document.getElementById("girisKaydetBtn").addEventListener("click", async () => {
  const urunAd = document.getElementById("girisUrun").value.trim();
  if (!urunAd) { toast("Ürün adı zorunlu.", "error"); return; }
  const miktar = ondalikOku(document.getElementById("girisMiktar").value);
  if (!miktar) { toast("Miktar zorunlu.", "error"); return; }

  const katalogUrun = katalogCache.find(u => u.ad === urunAd || u.stokKodu === urunAd);
  await stokGirisiKaydet({
    urunAd,
    stokKodu: katalogUrun?.stokKodu || "",
    miktar,
    birim: document.getElementById("girisBirim").value.trim() || "KG",
    tarihStr: document.getElementById("girisTarih").value,
    parti: document.getElementById("girisParti").value.trim(),
    not: document.getElementById("girisNot").value.trim(),
    yapan: mevcutKullanici.ad || mevcutKullanici.uid,
    kaynak: "fabrika"
  });

  toast(`✅ ${urunAd} — ${sayiBicimle(miktar)} giriş kaydedildi.`, "success");
  document.getElementById("girisUrun").value = "";
  document.getElementById("girisMiktar").value = "";
  document.getElementById("girisParti").value = "";
  document.getElementById("girisNot").value = "";
});

/* ---- Geçmiş ---- */
async function gecmisYukle() {
  const tbody = document.getElementById("gecmisTablosu");
  const kartlar = document.getElementById("gecmisKartlar");
  const bos = document.getElementById("gecmisBosDurum");
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">⏳</td></tr>';
  try {
    const kayitlar = await stokGirisleriGetir();
    if (!kayitlar.length) { tbody.innerHTML = ""; kartlar.innerHTML = ""; bos.classList.remove("u-hidden"); return; }
    bos.classList.add("u-hidden");
    tbody.innerHTML = kayitlar.map(k => {
      const tarih = k.tarih?.toDate?.()?.toLocaleString("tr-TR") || k.tarihStr || "—";
      return `<tr>
        <td style="font-size:12px;">${tarih}</td>
        <td>${kacisEt(k.urunAd || "—")}</td>
        <td style="font-weight:600;">${sayiBicimle(k.miktar)}</td>
        <td>${kacisEt(k.birim || "")}</td>
        <td class="cell-code">${kacisEt(k.parti || "—")}</td>
        <td>${kacisEt(k.yapan || "—")}</td>
        <td class="u-text-soft" style="font-size:12px;">${kacisEt(k.not || "")}</td>
      </tr>`;
    }).join("");
    kartlar.innerHTML = kayitlar.map(k => {
      const tarih = k.tarih?.toDate?.()?.toLocaleString("tr-TR") || k.tarihStr || "—";
      return `<div class="row-card">
        <div class="row-card__top">
          <div>
            <div class="row-card__name">${kacisEt(k.urunAd || "—")}</div>
            <div class="row-card__code">${sayiBicimle(k.miktar)} ${kacisEt(k.birim || "")} · ${tarih}</div>
          </div>
          <span class="badge badge-green">📥 Giriş</span>
        </div>
        <div style="font-size:12px;color:var(--color-ink-soft);margin-top:4px;">
          👤 ${kacisEt(k.yapan || "—")}${k.parti ? " · " + kacisEt(k.parti) : ""}${k.not ? " · " + kacisEt(k.not) : ""}
        </div>
      </div>`;
    }).join("");
    // Excel butonu
    document.getElementById("gecmisExcelBtn").onclick = () => {
      const basliklar = ["Tarih", "Ürün", "Stok Kodu", "Miktar", "Birim", "Parti", "Yapan", "Not"];
      const satirlar = kayitlar.map(k => [
        k.tarih?.toDate?.()?.toLocaleString("tr-TR") || k.tarihStr || "",
        k.urunAd || "", k.stokKodu || "", k.miktar, k.birim || "",
        k.parti || "", k.yapan || "", k.not || ""
      ]);
      const tarih = new Date().toLocaleDateString("tr-TR").replace(/\./g, "-");
      excelOlarakIndir([basliklar, ...satirlar], `fabrika_girisler_${tarih}.xlsx`);
    };
  } catch (err) {
    console.error(err);
    toast("Geçmiş yüklenemedi.", "error");
  }
}

/* Sevk listesindeki logolar dosyanın içine gömülü (ayrıca resim yüklemeye gerek yok) */
const LOGO_TUGLULAR = "data:image/jpeg;base64,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";
const LOGO_TUGLUBEY = "data:image/jpeg;base64,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";
