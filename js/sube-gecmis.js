// ============================================================================
// ŞUBE SİPARİŞ GEÇMİŞİ
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { subeSiparisleriDinle, urunleriniGetir } from "./veri.js";
import { arayuzHazirla, toast, kacisEt, sayiBicimle, tarihBicimle } from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;

sayfaKorumasi(["sube"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("subeEtiketi").textContent = kullanici.subeAdi || "Şube";
  subeSiparisleriDinle(kullanici.uid, renderSiparisler);
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
  sevk_edildi: { etiket: "✅ Yolda / Teslim", sinif: "badge-green" }
};

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
          <button class="btn btn-ghost btn-sm" data-detay="${s.id}">Detay →</button>
        </div>
      </div>`;
  }).join("");

  kapsayici.querySelectorAll("[data-detay]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const s = liste.find((x) => x.id === btn.dataset.detay);
      await detayGoster(s);
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
              <thead><tr><th>Ürün</th><th>İstenen</th><th>Birim</th><th>Durum</th></tr></thead>
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
