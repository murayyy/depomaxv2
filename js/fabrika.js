// ============================================================================
// FABRİKA EKRANI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import {
  katalogDinle, subeSimarisiOlustur, stokGirisiKaydet, stokGirisleriGetir,
  subeSiparisleriDinle, urunleriniGetir, fabrikaSiparisleriniDinle, fabrikaSiparisiHazirla
} from "./veri.js?v=20261112";
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
  root.innerHTML = `<div class="modal-backdrop" data-role="backdrop"><div class="modal" style="max-width:640px;">
    <h3>🏭 ${kacisEt(s.no)}</h3>
    <p style="font-size:13px;">${s.termin ? `Termin: <b>${kacisEt(new Date(s.termin + "T00:00").toLocaleDateString("tr-TR"))}</b> · ` : ""}Siparişi veren: ${kacisEt(s.olusturanAd || "Merkez")}</p>
    ${s.not ? `<p style="font-size:13px;">📝 ${kacisEt(s.not)}</p>` : ""}
    <div class="table-wrap" style="max-height:50vh;overflow-y:auto;"><table class="data-table fs-tablo">
      <thead><tr><th>Ürün</th><th class="sayi">İstenen</th><th class="sayi">Gönderilen</th></tr></thead>
      <tbody>${(s.kalemler || []).map((k, i) => `<tr>
        <td>${kacisEt(k.ad)}<div class="cell-code" style="font-size:11px;">${kacisEt(k.kod || "")}</div></td>
        <td class="sayi">${sayiBicimle(k.miktar)} ${kacisEt(k.birim || "")}</td>
        <td class="sayi"><input class="input fs-gonderilen" data-i="${i}" type="text" inputmode="decimal" value="${k.gonderilen ?? k.miktar}" style="width:90px;text-align:right;" /></td>
      </tr>`).join("")}</tbody></table></div>
    <div class="field" style="margin-top:10px;"><label>Not (isteğe bağlı)</label><input class="input" id="fsNot" value="${kacisEt(s.gonderimNotu || "")}" placeholder="Örn. 2 kalem eksik, yarın tamamlanacak" /></div>
    <div class="modal__actions" style="flex-wrap:wrap;gap:8px;">
      <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
      <button class="btn btn-ghost" data-role="kaydet">💾 Kaydet (hazırlanıyor)</button>
      <button class="btn btn-green" data-role="gonder">🚚 Gönderildi</button>
    </div></div></div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
  const oku = () => [...root.querySelectorAll(".fs-gonderilen")].map((inp) => ondalikOku(inp.value) || 0);
  const kaydet = async (gonder) => {
    const gonderilenler = oku();
    if (gonder) {
      const eksik = (s.kalemler || []).filter((k, i) => gonderilenler[i] < Number(k.miktar)).length;
      const ok = await onayIste({
        baslik: "Gönderildi olarak işaretle",
        metin: eksik ? `${eksik} üründe istenenden az gönderiliyor. Merkez teslim alırken bunu görecek. Devam edilsin mi?` : "Tüm ürünler istenen miktarda gönderiliyor.",
        onayMetni: "Gönderildi"
      });
      if (!ok) return;
    }
    try {
      await fabrikaSiparisiHazirla(s.id, {
        gonderilenler, gonder, not: document.getElementById("fsNot").value.trim(),
        gonderenAd: mevcutKullanici.ad || mevcutKullanici.uid
      });
      kapat();
      toast(gonder ? "🚚 Gönderildi olarak işaretlendi. Merkez teslim alınca kapanır." : "Kaydedildi.", "success");
    } catch (err) {
      toast("Kaydedilemedi: " + (err.message || err), "error");
    }
  };
  root.querySelector('[data-role="kaydet"]').onclick = () => kaydet(false);
  root.querySelector('[data-role="gonder"]').onclick = () => kaydet(true);
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
    <div class="modal__actions"><button class="btn btn-primary" data-role="kapat">Kapat</button></div></div></div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="kapat"]').onclick = kapat;
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
