// ============================================================================
// FABRİKA EKRANI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { katalogDinle, subeSimarisiOlustur, stokGirisiKaydet, stokGirisleriGetir } from "./veri.js";
import { arayuzHazirla, toast, onayIste, kacisEt, sayiBicimle, ondalikOku, excelOlarakIndir } from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;
let katalogCache = [];
let miktarlar = {};
let aktifSekme = "siparis";

const bugun = new Date().toISOString().slice(0, 10);
document.getElementById("girisTarih").value = bugun;

sayfaKorumasi(["fabrika", "admin"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  katalogDinle(katalogGuncellendi);
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
  document.getElementById("siparisGonderBtn").disabled = Object.keys(miktarlar).length === 0;
});

/* ---- Sipariş Gönder ---- */
document.getElementById("siparisGonderBtn").addEventListener("click", async () => {
  const secilen = Object.entries(miktarlar).filter(([, v]) => ondalikOku(v) > 0);
  if (!secilen.length) { toast("Ürün seçilmedi.", "error"); return; }
  const onay = await onayIste({
    baslik: "Siparişi Gönder",
    metin: `${secilen.length} çeşit ürün için sipariş gönderilecek.`,
    onayMetni: "Gönder"
  });
  if (!onay) return;
  const urunler = secilen.map(([id, miktar]) => {
    const u = katalogCache.find(x => x.id === id);
    return { id, ad: u?.ad || "", stokKodu: u?.stokKodu || "", barkod: u?.barkod || "", birim: u?.birim || "", kategori: u?.kategori || "", reyon: u?.reyon || "", miktar: ondalikOku(miktar), minMiktar: u?.minMiktar || 1 };
  });
  await subeSimarisiOlustur({
    ad: mevcutKullanici.subeAdi || mevcutKullanici.ad || "Fabrika",
    subeId: mevcutKullanici.uid,
    rol: "fabrika",
    urunler
  });
  miktarlar = {};
  document.querySelectorAll(".miktar-input").forEach(i => { i.value = ""; });
  document.getElementById("siparisGonderBtn").disabled = true;
  toast("✅ Sipariş gönderildi!", "success");
});

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
