// ============================================================================
// ŞUBE SİPARİŞ GEÇMİŞİ
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { subeSiparisleriDinle, urunleriniGetir, urunEkle, katalogDinle, teslimiOnayla } from "./veri.js";
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
  sevk_edildi: { etiket: "🚚 Yolda", sinif: "badge-blue" },
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
      const onay = await onayIste({ baslik: "Teslim Alındı mı?", metin: "Bu sipariş teslim alındı olarak işaretlenecek.", onayMetni: "Evet, Teslim Aldım" });
      if (!onay) return;
      await teslimiOnayla(btn.dataset.teslim, mevcutKullanici.subeAdi || mevcutKullanici.ad);
      toast("Teslim onaylandı. Teşekkürler!", "success");
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
