// ============================================================================
// ŞUBE SİPARİŞ GEÇMİŞİ
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { subeSiparisleriDinle, urunleriniGetir, urunEkle, katalogDinle, teslimatKaydet } from "./veri.js";
import { arayuzHazirla, toast, onayIste, kacisEt, sayiBicimle, ondalikOku, tarihBicimle } from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;
let katalogCache = [];

sayfaKorumasi(["sube"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("subeEtiketi").textContent = kullanici.subeAdi || "Şube";
  subeSiparisleriDinle(kullanici.uid, renderSiparisler);
  katalogDinle((liste) => { katalogCache = liste.filter((u) => u.aktif !== false); });
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

const DURUM_ETIKETI = {
  toplaniyor: { etiket: "⏳ Hazırlanıyor", sinif: "badge-amber" },
  toplandi: { etiket: "🔍 Kontrolde", sinif: "badge-blue" },
  kontrol_ediliyor: { etiket: "🔍 Kontrolde", sinif: "badge-blue" },
  tamamlandi: { etiket: "🚚 Sevk Bekliyor", sinif: "badge-amber" },
  sevk_edildi: { etiket: "🚚 Yolda — Teslim Bekliyor", sinif: "badge-blue" },
  teslim_edildi: { etiket: "✅ Teslim Edildi", sinif: "badge-green" }
};

// Sadece "toplaniyor" aşamasındaki siparişlere ürün eklenebilir
const DUZENLENEBILIR = ["toplaniyor"];
const TESLIM_ONAYLANABILIR = ["sevk_edildi"];

function renderSiparisler(liste) {
  const kapsayici = document.getElementById("siparisListesi");
  const bos = document.getElementById("bosDurum");

  if (liste.length === 0) {
    kapsayici.innerHTML = "";
    bos.classList.remove("u-hidden");
    return;
  }
  bos.classList.add("u-hidden");

  kapsayici.innerHTML = liste.map((s) => {
    const d = DURUM_ETIKETI[s.durum] || { etiket: s.durum, sinif: "badge-gray" };
    const duzenlenebilir = DUZENLENEBILIR.includes(s.durum);
    return `
      <div class="card order-card">
        <div class="order-card__main">
          <div class="order-card__name">${kacisEt(s.ad)}</div>
          <div class="order-card__meta">
            <span class="badge ${d.sinif}">${d.etiket}</span>
            <span>${s.toplamUrun || 0} ürün</span>
            ${s.paletSayisi ? `<span>${s.paletSayisi} palet</span>` : ""}
            <span>${tarihBicimle(s.olusturulmaTarihi)}</span>
          </div>
        </div>
        <div class="order-card__actions">
          ${duzenlenebilir ? `<button class="btn btn-primary btn-sm" data-ekle="${s.id}">+ Ürün Ekle</button>` : ""}
          ${TESLIM_ONAYLANABILIR.includes(s.durum) ? `<button class="btn btn-green btn-sm" data-teslim="${s.id}">✅ Teslim Aldım</button>` : ""}
          <button class="btn btn-ghost btn-sm" data-detay="${s.id}">Detay →</button>
        </div>
      </div>`;
  }).join("");

  kapsayici.querySelectorAll("[data-detay]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await detayGoster(liste.find((x) => x.id === btn.dataset.detay));
    });
  });
  kapsayici.querySelectorAll("[data-ekle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      urunEkleModalAc(btn.dataset.ekle);
    });
  });
  kapsayici.querySelectorAll("[data-teslim]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const siparis = liste.find((x) => x.id === btn.dataset.teslim);
      await teslimatModalAc(siparis);
    });
  });
}

async function detayGoster(siparis) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="empty-state__icon">⏳</div><p>Yükleniyor…</p></div></div>`;
  try {
    const urunler = await urunleriniGetir(siparis.id);
    const d = DURUM_ETIKETI[siparis.durum] || { etiket: siparis.durum, sinif: "badge-gray" };
    root.innerHTML = `
      <div class="modal-backdrop" data-role="backdrop">
        <div class="modal" style="max-width:520px;">
          <h3>${kacisEt(siparis.ad)}</h3>
          <p><span class="badge ${d.sinif}">${d.etiket}</span> &nbsp; ${tarihBicimle(siparis.olusturulmaTarihi)}</p>
          <div class="table-wrap" style="margin-top:12px;">
            <table class="data-table">
              <thead><tr><th>Ürün</th><th>İstenen</th><th>Birim</th><th>Not</th><th>Durum</th></tr></thead>
              <tbody>
                ${urunler.map((u) => {
                  const durumRozet = u.eksik
                    ? '<span class="badge badge-red">Eksik</span>'
                    : u.toplandi ? '<span class="badge badge-green">Toplandı</span>'
                    : '<span class="badge badge-gray">Bekliyor</span>';
                  return `<tr>
                    <td>${kacisEt(u.ad)}</td>
                    <td>${sayiBicimle(u.miktar || 0)}</td>
                    <td>${kacisEt(u.birim || "")}</td>
                    <td class="u-text-soft" style="font-size:12px;">${kacisEt(u.aciklama || "—")}</td>
                    <td>${durumRozet}</td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
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

function urunEkleModalAc(siparisId) {
  const root = document.getElementById("modalRoot");

  // Katalogdan seçme veya serbest yazma — ikisini de sunan bir modal
  const katalogOptions = katalogCache.length > 0
    ? `<div class="field">
        <label>Katalogdan Seç (isteğe bağlı)</label>
        <select class="select" id="subeKatalogSec">
          <option value="">— Serbest giriş —</option>
          ${katalogCache.map((u) => `<option value="${u.id}" data-ad="${kacisEt(u.ad)}" data-birim="${kacisEt(u.birim || "")}" data-stok="${kacisEt(u.stokKodu || "")}">${kacisEt(u.ad)}${u.birim ? " (" + u.birim + ")" : ""}</option>`).join("")}
        </select>
       </div>`
    : "";

  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal">
        <h3>Siparişe Ürün Ekle</h3>
        <p>Sipariş henüz hazırlanıyor aşamasında olduğu için ürün ekleyebilirsiniz.</p>
        ${katalogOptions}
        <div class="input-row">
          <div class="field"><label>Ürün Adı</label><input class="input" id="subeUrunAd" /></div>
          <div class="field"><label>Miktar</label><input class="input" type="text" inputmode="decimal" id="subeUrunMiktar" /></div>
          <div class="field"><label>Birim</label><input class="input" id="subeUrunBirim" placeholder="KG, Adet…" /></div>
          <div class="field"><label>Not</label><input class="input" id="subeUrunNot" placeholder="İsteğe bağlı…" /></div>
        </div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="onay">Ekle</button>
        </div>
      </div>
    </div>`;

  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => {
    if (e.target.dataset.role === "backdrop") kapat();
  };

  // Katalogdan seçilince alanları otomatik doldur
  const katalogSec = root.querySelector("#subeKatalogSec");
  if (katalogSec) {
    katalogSec.addEventListener("change", () => {
      const opt = katalogSec.options[katalogSec.selectedIndex];
      if (opt.value) {
        document.getElementById("subeUrunAd").value = opt.dataset.ad || "";
        document.getElementById("subeUrunBirim").value = opt.dataset.birim || "";
      }
    });
  }

  root.querySelector('[data-role="onay"]').onclick = async () => {
    const ad = document.getElementById("subeUrunAd").value.trim();
    const miktar = ondalikOku(document.getElementById("subeUrunMiktar").value);
    if (!ad) { toast("Ürün adı zorunlu.", "error"); return; }
    if (!miktar) { toast("Miktar giriniz.", "error"); return; }
    try {
      const katalogSec = root.querySelector("#subeKatalogSec");
      const katalogId = katalogSec?.value || "";
      const katalogUrun = katalogCache.find((u) => u.id === katalogId);
      await urunEkle(siparisId, {
        kod: katalogUrun?.stokKodu || "",
        ad,
        miktar,
        birim: document.getElementById("subeUrunBirim").value.trim(),
        aciklama: document.getElementById("subeUrunNot").value.trim(),
        reyon: katalogUrun?.reyon || "",
        barkod: "",
        eksik: false
      });
      kapat();
      toast("Ürün siparişe eklendi.", "success");
    } catch (err) {
      console.error(err);
      toast("Eklenirken hata: " + (err.message || err), "error");
    }
  };
}

/* ============================================================================
   AYRINTILI TESLİMAT KONTROL MODALI
   ============================================================================ */
async function teslimatModalAc(siparis) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="empty-state__icon">⏳</div><p>Ürünler yükleniyor…</p></div></div>`;

  let urunler;
  try { urunler = await urunleriniGetir(siparis.id); }
  catch (err) { root.innerHTML = ""; toast("Ürünler yüklenemedi.", "error"); return; }

  // Her ürün için başlangıç durumu: sipariş miktarını gelen miktar olarak önceden doldur (tamam varsayımı)
  let kalemler = urunler.map((u) => ({
    urunId: u.id,
    ad: u.ad,
    kod: u.kod || "",
    birim: u.birim || "",
    siparisMiktari: Number(u.miktar) || 0,
    gelenMiktar: Number(u.miktar) || 0,
    durum: "tamam",
    not: ""
  }));

  function kalemBagla(kapsayici) {
    kapsayici.querySelectorAll("[data-i]").forEach((satir) => {
      const i = Number(satir.dataset.i);
      const durumSec = satir.querySelector('[data-rol="durum"]');
      if (durumSec) durumSec.addEventListener("change", (e) => {
        kalemler[i].durum = e.target.value;
        if (e.target.value === "tamam") kalemler[i].gelenMiktar = kalemler[i].siparisMiktari;
        if (e.target.value === "gelmedi") { kalemler[i].gelenMiktar = 0; kalemler[i].durum = "eksik"; }
        yenile();
      });
      const miktarInput = satir.querySelector('[data-rol="miktar"]');
      if (miktarInput) miktarInput.addEventListener("input", (e) => {
        kalemler[i].gelenMiktar = ondalikOku(e.target.value);
      });
      const notInput = satir.querySelector('[data-rol="not"]');
      if (notInput) notInput.addEventListener("input", (e) => { kalemler[i].not = e.target.value; });
      const gelmediBtn = satir.querySelector('[data-rol="gelmedi"]');
      if (gelmediBtn) gelmediBtn.addEventListener("click", () => {
        kalemler[i].durum = "eksik";
        kalemler[i].gelenMiktar = 0;
        yenile();
      });
    });
  }

  function durumSecHtml(k, tamGenislik = false) {
    const stil = tamGenislik ? "width:100%;" : "min-width:90px;";
    return `<select class="select" data-rol="durum" style="${stil}">
      <option value="tamam" ${k.durum === "tamam" ? "selected" : ""}>✅ Tamam</option>
      <option value="eksik" ${k.durum === "eksik" ? "selected" : ""}>⚠ Eksik</option>
      <option value="fazla" ${k.durum === "fazla" ? "selected" : ""}>➕ Fazla</option>
    </select>`;
  }

  const MOBIL = () => window.innerWidth <= 720;

  function yenile() {
    const mobil = MOBIL();

    // --- Masaüstü tablo ---
    const tableWrap = root.querySelector(".teslimat-table-wrap");
    const tbody = root.querySelector("#teslimatGovde");
    if (tableWrap) tableWrap.style.display = mobil ? "none" : "";
    if (tbody && !mobil) {
      tbody.innerHTML = kalemler.map((k, i) => {
        const renkSinif = k.durum === "eksik" ? "row-missing" : k.durum === "fazla" ? "row-checked" : "";
        return `
          <tr class="${renkSinif}" data-i="${i}">
            <td class="cell-code">${kacisEt(k.kod || "—")}</td>
            <td>${kacisEt(k.ad)}</td>
            <td>${sayiBicimle(k.siparisMiktari)} ${kacisEt(k.birim)}</td>
            <td>${durumSecHtml(k)}</td>
            <td>
              <input type="text" inputmode="decimal" class="cell-qty-input" data-rol="miktar"
                value="${k.gelenMiktar}" style="width:72px;"
                ${k.durum === "tamam" ? "disabled" : ""} />
            </td>
            <td><input type="text" class="input" data-rol="not" value="${kacisEt(k.not)}"
              placeholder="Not…" style="min-width:110px;font-size:12px;" /></td>
            <td><button class="btn btn-danger btn-sm" data-rol="gelmedi">Gelmedi</button></td>
          </tr>`;
      }).join("");
      kalemBagla(tbody);
    }

    // --- Mobil kartlar ---
    const kartlar = root.querySelector("#teslimatKartlar");
    if (kartlar) {
      kartlar.style.display = mobil ? "flex" : "none";
      kartlar.style.flexDirection = "column";
      kartlar.style.gap = "10px";
      if (mobil) {
        kartlar.innerHTML = kalemler.map((k, i) => {
          const renkSinif = k.durum === "eksik" ? "row-missing" : k.durum === "fazla" ? "row-checked" : "";
          return `
            <div class="row-card ${renkSinif}" data-i="${i}">
              <div class="row-card__top">
                <div>
                  <div class="row-card__name">${kacisEt(k.ad)}</div>
                  <div class="row-card__code">${kacisEt(k.kod || "—")} · Sipariş: ${sayiBicimle(k.siparisMiktari)} ${kacisEt(k.birim)}</div>
                </div>
                <button class="btn btn-danger btn-sm" data-rol="gelmedi">Gelmedi</button>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
                <div><div class="row-card__label">Durum</div>${durumSecHtml(k, true)}</div>
                <div><div class="row-card__label">Gelen Miktar</div>
                  <input type="text" inputmode="decimal" class="cell-qty-input" data-rol="miktar"
                    value="${k.gelenMiktar}" style="width:80px;"
                    ${k.durum === "tamam" ? "disabled" : ""} />
                </div>
              </div>
              <div style="margin-top:8px;">
                <div class="row-card__label">Not</div>
                <input type="text" class="input" data-rol="not" value="${kacisEt(k.not)}"
                  placeholder="İsteğe bağlı not…" style="font-size:12.5px;" />
              </div>
            </div>`;
        }).join("");
        kalemBagla(kartlar);
      }
    }
  }

  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal" style="max-width:700px;">
        <h3>📦 Teslimат Kontrolü — ${kacisEt(siparis.ad)}</h3>
        <p style="font-size:13px;color:var(--color-ink-soft);">
          Her ürünü kontrol edin. Eksik veya fazla gelenleri işaretleyip miktarını girin.
          Listede olmayan ürün geldiyse "➕ Ürün Ekle" ile ekleyin.
        </p>
        <div class="table-wrap teslimat-table-wrap" style="max-height:360px;overflow-y:auto;margin-bottom:12px;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Kod</th><th>Ürün Adı</th><th>Sipariş</th>
                <th>Durum</th><th>Gelen Miktar</th><th>Not</th><th></th>
              </tr>
            </thead>
            <tbody id="teslimatGovde"></tbody>
          </table>
        </div>
        <div id="teslimatKartlar" style="max-height:60vh;overflow-y:auto;margin-bottom:12px;display:none;"></div>
        <button class="btn btn-ghost btn-sm" id="ekstraUrunEkleBtn">➕ Listede Olmayan Ürün Ekle</button>
        <div class="modal__actions" style="margin-top:14px;">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-green" data-role="onayla">✅ Teslimаtı Onayla</button>
        </div>
      </div>
    </div>`;

  yenile();

  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => {
    if (e.target.dataset.role === "backdrop") kapat();
  };

  // Listede olmayan ürün ekleme
  root.querySelector("#ekstraUrunEkleBtn").addEventListener("click", () => {
    // Autocomplete listesi: mevcut siparişin ürünleri + katalog
    const oneriListesi = [
      ...urunler.map((u) => ({ kod: u.kod || "", ad: u.ad || "", birim: u.birim || "" })),
      ...katalogCache.filter((k) => !urunler.find((u) => u.kod && u.kod === k.stokKodu))
        .map((k) => ({ kod: k.stokKodu || "", ad: k.ad || "", birim: k.birim || "" }))
    ];
    const oneriOptions = oneriListesi.map((o, i) =>
      `<option value="${i}">${o.kod ? o.kod + " — " : ""}${kacisEt(o.ad)}${o.birim ? " (" + o.birim + ")" : ""}</option>`
    ).join("");

    const ekModal = document.createElement("div");
    ekModal.innerHTML = `
      <div class="modal-backdrop" style="z-index:201;" data-role="arka">
        <div class="modal" style="max-width:380px;">
          <h3>Listede Olmayan Ürün Ekle</h3>
          <div class="field">
            <label>Ürün Seç veya Yaz</label>
            <select class="select" id="ekUrunSec">
              <option value="">— Listeden seç —</option>
              ${oneriOptions}
            </select>
          </div>
          <div class="field"><label>Ürün Adı</label><input class="input" id="ekAd" /></div>
          <div class="field"><label>Ürün Kodu</label><input class="input" id="ekKod" /></div>
          <div class="field"><label>Gelen Miktar</label><input class="input" type="text" inputmode="decimal" id="ekMiktar" placeholder="0" /></div>
          <div class="field"><label>Birim</label><input class="input" id="ekBirim" placeholder="KG, Adet…" /></div>
          <div class="modal__actions">
            <button class="btn btn-ghost" id="ekIptal">Vazgeç</button>
            <button class="btn btn-primary" id="ekOnay">Ekle</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(ekModal);

    ekModal.querySelector("#ekUrunSec").addEventListener("change", (e) => {
      if (!e.target.value) return;
      const o = oneriListesi[Number(e.target.value)];
      ekModal.querySelector("#ekAd").value = o.ad;
      ekModal.querySelector("#ekKod").value = o.kod;
      ekModal.querySelector("#ekBirim").value = o.birim;
    });
    const kapat2 = () => ekModal.remove();
    ekModal.querySelector("#ekIptal").onclick = kapat2;
    ekModal.querySelector("#ekOnay").onclick = () => {
      const ad = ekModal.querySelector("#ekAd").value.trim();
      const miktar = ondalikOku(ekModal.querySelector("#ekMiktar").value);
      if (!ad) { toast("Ürün adı zorunlu.", "error"); return; }
      kalemler.push({
        urunId: null,
        ad,
        kod: ekModal.querySelector("#ekKod").value.trim(),
        birim: ekModal.querySelector("#ekBirim").value.trim(),
        siparisMiktari: 0,
        gelenMiktar: miktar,
        durum: "fazla",
        not: "Listede olmayan ürün"
      });
      kapat2();
      yenile();
    };
  });

  root.querySelector('[data-role="onayla"]').onclick = async () => {
    const btn = root.querySelector('[data-role="onayla"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      const ozet = await teslimatKaydet(siparis.id, {
        teslimatKalemleri: kalemler,
        onaylayanKullanici: mevcutKullanici.subeAdi || mevcutKullanici.ad,
        subeAdi: mevcutKullanici.subeAdi || ""
      });
      kapat();
      const mesaj = `Teslim onaylandı. ${ozet.tamam} tamam${ozet.eksik ? `, ${ozet.eksik} eksik` : ""}${ozet.fazla ? `, ${ozet.fazla} fazla` : ""}.`;
      toast(mesaj, ozet.eksik || ozet.fazla ? "info" : "success", 6000);
    } catch (err) {
      console.error(err);
      toast("Kayıt sırasında hata oluştu.", "error");
      btn.disabled = false;
      btn.innerHTML = "✅ Teslimаtı Onayla";
    }
  };
}
