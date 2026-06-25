// ============================================================================
// EKSİK ÜRÜN TAKİBİ
// ----------------------------------------------------------------------------
// Kontrolden geçmiş (kontrol_ediliyor / tamamlandi) siparişlerdeki "eksik"
// işaretli ürünleri toplar, ürün koduna göre gruplar ve canlı Mikro stok
// verisiyle karşılaştırır. Stok gelmiş ürünler üstte ve yeşil rozetle çıkar.
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { tumSiparisleriGetir, urunleriniGetir, urunGuncelle } from "./veri.js";
import { stoklariDinle } from "./stok.js";
import { arayuzHazirla, toast, onayIste, kacisEt, sayiBicimle, yukleniyorGoster, yukleniyorKapat } from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;
let stokMap = new Map();
let gruplar = []; // son yüklenen eksik ürün grupları

sayfaKorumasi(["toplayici", "kontrolor"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  const nav = document.getElementById("topNav");
  if (kullanici.rol === "admin") {
    nav.insertAdjacentHTML("afterbegin",
      `<a class="topbar__link" href="toplama.html">📦 Toplama</a><a class="topbar__link" href="kontrol.html">✅ Kontrol</a><a class="topbar__link" href="admin.html">👥 Yönetim</a><a class="topbar__link" href="performans.html">📊 Performans</a>`);
  } else if (kullanici.rol === "toplayici") {
    nav.insertAdjacentHTML("afterbegin", `<a class="topbar__link" href="toplama.html">📦 Toplama</a>`);
  } else if (kullanici.rol === "kontrolor") {
    nav.insertAdjacentHTML("afterbegin", `<a class="topbar__link" href="kontrol.html">✅ Kontrol</a>`);
  }
  yukle();
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

stoklariDinle((map) => {
  stokMap = map;
  render(); // stok değiştiğinde aynı listeyi yeni stok bilgisiyle yeniden çiz
});

document.getElementById("yenileBtn").addEventListener("click", yukle);

async function yukle() {
  document.getElementById("eksikListesi").innerHTML = "";
  document.getElementById("bosDurum").classList.add("u-hidden");
  document.getElementById("yukleniyorDurum").classList.remove("u-hidden");
  document.getElementById("ozetAlani").textContent = "";

  try {
    const tumSiparisler = await tumSiparisleriGetir();
    const sinirTarihi = Date.now() - 60 * 24 * 60 * 60 * 1000; // son 60 gün (kota tasarrufu)
    const ilgiliSiparisler = tumSiparisler.filter((s) =>
      (s.durum === "kontrol_ediliyor" || s.durum === "tamamlandi") &&
      (!s.olusturulmaTarihi || s.olusturulmaTarihi.toMillis() >= sinirTarihi)
    );

    const eksikKayitlari = [];
    const urunListeleri = await Promise.all(ilgiliSiparisler.map((s) => urunleriniGetir(s.id)));
    urunListeleri.forEach((urunler, i) => {
      const s = ilgiliSiparisler[i];
      urunler.filter((u) => u.eksik).forEach((u) => {
        eksikKayitlari.push({
          siparisId: s.id, siparisAdi: s.ad,
          urunId: u.id, kod: u.kod, ad: u.ad, birim: u.birim, miktar: u.miktar
        });
      });
    });

    gruplar = grupla(eksikKayitlari);
    document.getElementById("yukleniyorDurum").classList.add("u-hidden");
    render();
  } catch (err) {
    document.getElementById("yukleniyorDurum").classList.add("u-hidden");
    console.error(err);
    toast("Eksik ürünler yüklenirken hata oluştu.", "error");
  }
}

function grupla(eksikKayitlari) {
  const map = new Map();
  eksikKayitlari.forEach((e) => {
    const anahtar = e.kod || e.ad;
    if (!map.has(anahtar)) map.set(anahtar, { kod: e.kod, ad: e.ad, birim: e.birim, toplamMiktar: 0, kayitlar: [] });
    const grup = map.get(anahtar);
    grup.toplamMiktar += Number(e.miktar) || 0;
    grup.kayitlar.push(e);
  });
  return Array.from(map.values());
}

function stokDurumu(grup) {
  const stok = grup.kod ? stokMap.get(grup.kod) : null;
  const mevcut = stok ? Number(stok.miktar) || 0 : null;
  if (mevcut === null) return { etiket: "Stok verisi yok", sinif: "badge-gray", mevcut: null };
  if (mevcut <= 0) return { etiket: "⏳ Stok Yok", sinif: "badge-gray", mevcut };
  if (mevcut >= grup.toplamMiktar) return { etiket: "✅ Stok Geldi (Tam)", sinif: "badge-green", mevcut };
  return { etiket: "🟡 Kısmi Stok", sinif: "badge-amber", mevcut };
}

function render() {
  const kapsayici = document.getElementById("eksikListesi");
  const bos = document.getElementById("bosDurum");

  if (gruplar.length === 0) {
    kapsayici.innerHTML = "";
    bos.classList.remove("u-hidden");
    document.getElementById("ozetAlani").textContent = "";
    return;
  }
  bos.classList.add("u-hidden");

  // Stok gelenler üstte
  const siraliGruplar = [...gruplar].sort((a, b) => {
    const da = stokDurumu(a), db = stokDurumu(b);
    const oncelik = (d) => (d.sinif === "badge-green" ? 0 : d.sinif === "badge-amber" ? 1 : 2);
    return oncelik(da) - oncelik(db);
  });

  const stokGelenSayisi = siraliGruplar.filter((g) => stokDurumu(g).sinif === "badge-green").length;
  document.getElementById("ozetAlani").textContent =
    `${gruplar.length} farklı üründe eksik var. ${stokGelenSayisi} üründe stok geldi.`;

  kapsayici.innerHTML = siraliGruplar.map((grup, idx) => {
    const durum = stokDurumu(grup);
    return `
      <div class="card order-card" data-idx="${idx}">
        <div class="order-card__main">
          <div class="order-card__name">${kacisEt(grup.ad)} <span class="cell-code">(${kacisEt(grup.kod)})</span></div>
          <div class="order-card__meta">
            <span class="badge ${durum.sinif}">${durum.etiket}</span>
            <span>Eksik: ${sayiBicimle(grup.toplamMiktar)} ${kacisEt(grup.birim || "")}</span>
            ${durum.mevcut !== null ? `<span>Depo Stok: ${sayiBicimle(durum.mevcut)} ${kacisEt(grup.birim || "")}</span>` : ""}
            <span>${grup.kayitlar.length} siparişte</span>
          </div>
        </div>
        <div class="order-card__actions">
          <button class="btn btn-ghost btn-sm" data-detay="${idx}">Siparişleri Gör</button>
        </div>
      </div>`;
  }).join("");

  kapsayici.querySelectorAll("[data-detay]").forEach((btn) => {
    btn.addEventListener("click", () => detayModalAc(siraliGruplar[Number(btn.dataset.detay)]));
  });
}

function detayModalAc(grup) {
  const root = document.getElementById("modalRoot");
  const satirHtml = (k) => `
    <div class="row-card" style="margin-bottom:8px;">
      <div class="row-card__top">
        <div>
          <div class="row-card__name">${kacisEt(k.siparisAdi)}</div>
          <div class="row-card__code">Eksik: ${sayiBicimle(k.miktar)} ${kacisEt(k.birim || "")}</div>
        </div>
        <button class="btn btn-green btn-sm" data-topla="${k.siparisId}|${k.urunId}">✓ Toplandı Yap</button>
      </div>
    </div>`;

  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal" style="max-width:480px;">
        <h3>${kacisEt(grup.ad)}</h3>
        <p>Bu ürünün eksik kaldığı siparişler:</p>
        <div>${grup.kayitlar.map(satirHtml).join("")}</div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="kapat">Kapat</button>
        </div>
      </div>
    </div>`;

  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="kapat"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };

  root.querySelectorAll("[data-topla]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const [siparisId, urunId] = btn.dataset.topla.split("|");
      const onay = await onayIste({
        baslik: "Toplandı Olarak İşaretle",
        metin: "Bu ürün artık stokta var diyerek o siparişte toplandı olarak işaretlenecek.",
        onayMetni: "İşaretle"
      });
      if (!onay) return;
      yukleniyorGoster("İşaretleniyor…");
      try {
        await urunGuncelle(siparisId, urunId, {
          toplandi: true, eksik: false,
          toplayanKullanici: mevcutKullanici.ad || mevcutKullanici.uid
        });
        yukleniyorKapat();
        toast("Ürün toplandı olarak işaretlendi.", "success");
        kapat();
        yukle();
      } catch (err) {
        yukleniyorKapat();
        console.error(err);
        toast("İşaretlenirken hata oluştu.", "error");
      }
    });
  });
}
