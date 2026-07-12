// ============================================================================
// SÜRÜCÜ TESLİMAT EKRANI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { surucuSiparisleriDinle, urunleriniGetir } from "./veri.js";
import { arayuzHazirla, toast, kacisEt, sayiBicimle, tarihBicimle } from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;

sayfaKorumasi(["surucu"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("plakaEtiketi").textContent = kullanici.plaka || "Sürücü";
  surucuSiparisleriDinle(kullanici.uid, renderSiparisler);
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

function renderSiparisler(liste) {
  const kapsayici = document.getElementById("siparisList");
  const bos = document.getElementById("bosDurum");

  if (liste.length === 0) {
    kapsayici.innerHTML = "";
    bos.classList.remove("u-hidden");
    document.getElementById("ozetYazi").textContent = "Atanmış teslimat yok.";
    return;
  }
  bos.classList.add("u-hidden");

  const bekleyen = liste.filter((s) => s.durum === "sevk_edildi").length;
  const teslim = liste.filter((s) => s.durum === "teslim_edildi").length;
  const toplamPalet = liste.reduce((t, s) => t + (Number(s.paletSayisi) || 0), 0);
  document.getElementById("ozetYazi").textContent =
    `${liste.length} teslimat — ${bekleyen} bekliyor, ${teslim} teslim edildi · Toplam ${toplamPalet} palet`;

  kapsayici.innerHTML = liste.map((s) => {
    const teslimEdildi = s.durum === "teslim_edildi";
    const rozet = teslimEdildi
      ? '<span class="badge badge-green">✅ Teslim Edildi</span>'
      : '<span class="badge badge-amber">⏳ Bekliyor</span>';
    const tarih = s.teslimatTarihi
      ? s.teslimatTarihi.toDate?.().toLocaleString("tr-TR") || ""
      : "";
    return `
      <div class="card order-card${teslimEdildi ? "" : ""}" data-id="${s.id}">
        <div class="order-card__main">
          <div class="order-card__name">${kacisEt(s.subeAdi || s.ad)}</div>
          <div class="order-card__meta">
            ${rozet}
            ${s.paletSayisi ? `<span>📦 ${s.paletSayisi} palet</span>` : ""}
            ${s.toplamKg ? `<span>⚖ ${sayiBicimle(s.toplamKg)} KG</span>` : ""}
            ${teslimEdildi && tarih ? `<span>🕐 ${tarih}</span>` : ""}
            <span>${tarihBicimle(s.olusturulmaTarihi)}</span>
          </div>
        </div>
        <div class="order-card__actions">
          <button class="btn btn-ghost btn-sm" data-detay="${s.id}">Ürünleri Gör</button>
        </div>
      </div>`;
  }).join("");

  kapsayici.querySelectorAll("[data-detay]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await detayGoster(liste.find((x) => x.id === btn.dataset.detay));
    });
  });
}

async function detayGoster(siparis) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="empty-state__icon">⏳</div><p>Yükleniyor…</p></div></div>`;
  try {
    // Teslim edilmişse teslimatKalemleri, değilse orijinal ürünler
    let satirlar;
    if (siparis.durum === "teslim_edildi" && siparis.teslimatKalemleri?.length) {
      satirlar = siparis.teslimatKalemleri.map((k) => ({
        ad: k.ad, kod: k.kod, birim: k.birim,
        siparisMiktari: k.siparisMiktari, gelenMiktar: k.gelenMiktar, durum: k.durum
      }));
    } else {
      const urunler = await urunleriniGetir(siparis.id);
      satirlar = urunler.map((u) => ({
        ad: u.ad, kod: u.kod, birim: u.birim,
        siparisMiktari: u.miktar, gelenMiktar: null, durum: null
      }));
    }

    const teslimEdildi = siparis.durum === "teslim_edildi";
    const mobil = window.innerWidth <= 720;

    const satirHtml = satirlar.map((s) => {
      const durumRozet = !s.durum ? "" :
        s.durum === "tamam" ? '<span class="badge badge-green">✅</span>' :
        s.durum === "eksik" ? '<span class="badge badge-red">⚠ Eksik</span>' :
        '<span class="badge badge-blue">➕ Fazla</span>';
      return mobil ? `
        <div class="row-card" style="margin-bottom:8px;">
          <div class="row-card__top">
            <div>
              <div class="row-card__name">${kacisEt(s.ad)}</div>
              <div class="row-card__code">${kacisEt(s.kod || "—")} · ${sayiBicimle(s.siparisMiktari || 0)} ${kacisEt(s.birim || "")}</div>
            </div>
            ${durumRozet}
          </div>
          ${teslimEdildi && s.gelenMiktar !== null ? `<div class="u-text-soft" style="font-size:12px;">Gelen: ${sayiBicimle(s.gelenMiktar)} ${kacisEt(s.birim || "")}</div>` : ""}
        </div>` :
        `<tr>
          <td class="cell-code">${kacisEt(s.kod || "—")}</td>
          <td>${kacisEt(s.ad)}</td>
          <td>${sayiBicimle(s.siparisMiktari || 0)}</td>
          ${teslimEdildi ? `<td>${sayiBicimle(s.gelenMiktar || 0)}</td>` : ""}
          <td>${kacisEt(s.birim || "")}</td>
          ${durumRozet ? `<td>${durumRozet}</td>` : ""}
        </tr>`;
    }).join("");

    root.innerHTML = `
      <div class="modal-backdrop" data-role="backdrop">
        <div class="modal" style="max-width:520px;">
          <h3>${kacisEt(siparis.subeAdi || siparis.ad)}</h3>
          <p>
            ${siparis.paletSayisi ? `<span class="badge badge-blue">${siparis.paletSayisi} palet</span>` : ""}
            ${siparis.toplamKg ? `<span class="badge badge-gray">${sayiBicimle(siparis.toplamKg)} KG</span>` : ""}
            ${teslimEdildi ? '<span class="badge badge-green">✅ Teslim Edildi</span>' : '<span class="badge badge-amber">⏳ Bekliyor</span>'}
          </p>
          ${mobil
            ? `<div style="max-height:60vh;overflow-y:auto;margin-top:12px;">${satirHtml}</div>`
            : `<div style="overflow-x:auto;margin-top:12px;">
                <table class="data-table">
                  <thead><tr>
                    <th>Kod</th><th>Ürün</th><th>Sipariş</th>
                    ${teslimEdildi ? "<th>Gelen</th>" : ""}
                    <th>Birim</th>
                    ${teslimEdildi ? "<th>Durum</th>" : ""}
                  </tr></thead>
                  <tbody>${satirHtml}</tbody>
                </table>
              </div>`}
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
