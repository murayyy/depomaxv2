// ============================================================================
// PERSONEL PERFORMANSI RAPORU
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { tumSiparisleriGetir, urunleriniGetir } from "./veri.js";
import { arayuzHazirla, toast, kacisEt, sayiBicimle, yukleniyorGoster, yukleniyorKapat } from "./utils.js";

arayuzHazirla();

sayfaKorumasi(["admin"], (kullanici) => {
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  document.getElementById("baslangicDurum").classList.remove("u-hidden");
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth); window.location.href = "index.html";
});

function tarihGiris(d) { return d.toISOString().slice(0, 10); }
document.getElementById("butGun7").addEventListener("click", () => {
  const b = new Date();
  document.getElementById("tarihBaslangic").value = tarihGiris(new Date(b - 6*864e5));
  document.getElementById("tarihBitis").value = tarihGiris(b);
});
document.getElementById("butGun30").addEventListener("click", () => {
  const b = new Date();
  document.getElementById("tarihBaslangic").value = tarihGiris(new Date(b - 29*864e5));
  document.getElementById("tarihBitis").value = tarihGiris(b);
});
document.getElementById("butTumZamanlar").addEventListener("click", () => {
  document.getElementById("tarihBaslangic").value = "";
  document.getElementById("tarihBitis").value = "";
});

document.getElementById("hesaplaBtn").addEventListener("click", hesapla);

async function hesapla() {
  document.getElementById("baslangicDurum").classList.add("u-hidden");
  yukleniyorGoster("Siparişler okunuyor…");
  try {
    let siparisler = await tumSiparisleriGetir();
    const baslangic = document.getElementById("tarihBaslangic").value;
    const bitis = document.getElementById("tarihBitis").value;
    if (baslangic) {
      const s = new Date(baslangic + "T00:00:00").getTime();
      siparisler = siparisler.filter((x) => !x.olusturulmaTarihi || x.olusturulmaTarihi.toMillis() >= s);
    }
    if (bitis) {
      const s = new Date(bitis + "T23:59:59").getTime();
      siparisler = siparisler.filter((x) => !x.olusturulmaTarihi || x.olusturulmaTarihi.toMillis() <= s);
    }
    yukleniyorGoster(`${siparisler.length} siparişin ürünleri okunuyor…`);
    const listeleri = await Promise.all(siparisler.map((s) => urunleriniGetir(s.id)));
    const tumUrunler = listeleri.flat();
    const { toplayicilar, kontrolorler } = hesaplaOzetler(tumUrunler, siparisler);
    render(toplayicilar, kontrolorler, siparisler.length, tumUrunler.length);
    yukleniyorKapat();
  } catch (err) {
    yukleniyorKapat(); console.error(err);
    toast("Hesaplanırken hata oluştu.", "error");
  }
}

/* ---- Süre hesaplama ---- */
function dakikaFarki(baslangicIso, bitisIso) {
  if (!baslangicIso || !bitisIso) return null;
  const fark = (new Date(bitisIso) - new Date(baslangicIso)) / 60000;
  return fark > 0 ? fark : null;
}

function sureBicimle(dakika) {
  if (!dakika) return "—";
  if (dakika < 60) return `${Math.round(dakika)} dk`;
  const saat = Math.floor(dakika / 60);
  const kalanDk = Math.round(dakika % 60);
  return kalanDk > 0 ? `${saat}s ${kalanDk}dk` : `${saat}s`;
}

/* ---- Aktif saat hesaplama (sipariş bazlı yaklaşım) ---- */
// Her kullanıcının sipariş üzerinde geçirdiği süreleri gün bazında toplar.
// Aynı günde birden fazla sipariş varsa üst üste geldiği varsayılır.
function aktifSaatHesapla(sureListesi) {
  if (!sureListesi.length) return "—";
  const toplamDk = sureListesi.reduce((t, d) => t + d, 0);
  return sureBicimle(toplamDk);
}

function hesaplaOzetler(urunler, siparisler) {
  const tMap = new Map(); // toplayıcılar
  const kMap = new Map(); // kontrolörler

  const tGetir = (ad) => {
    if (!tMap.has(ad)) tMap.set(ad, {
      ad, toplananUrun: 0, toplananKg: 0,
      eksikHata: 0, miktarHata: 0, toplamaSureleri: []
    });
    return tMap.get(ad);
  };
  const kGetir = (ad) => {
    if (!kMap.has(ad)) kMap.set(ad, {
      ad, kontrolEdilenUrun: 0, kontrolEdilenKg: 0,
      eksikTespit: 0, miktarDuzeltme: 0, kontrolSureleri: []
    });
    return kMap.get(ad);
  };

  const kgMi = (u) => String(u.birim || "").trim().toLowerCase() === "kg";

  // Sipariş bazlı süreler
  siparisler.forEach((s) => {
    // Toplama süresi
    if (s.toplamayiTamamlayan && s.olusturulmaTarihi && s.toplamaBitis) {
      const baslangic = s.olusturulmaTarihi.toDate?.().toISOString?.() || s.olusturulmaTarihi;
      const sure = dakikaFarki(baslangic, s.toplamaBitis);
      if (sure) {
        const kayit = tGetir(s.toplamayiTamamlayan);
        kayit.toplamaSureleri.push(sure);
      }
    }
    // Kontrol süresi
    if (s.kontrolTamamlayan && s.kontrolBaslangic && s.kontrolBitis) {
      const sure = dakikaFarki(s.kontrolBaslangic, s.kontrolBitis);
      if (sure) {
        const kayit = kGetir(s.kontrolTamamlayan);
        kayit.kontrolSureleri.push(sure);
      }
    }
  });

  // Ürün bazlı metrikler
  urunler.forEach((u) => {
    if (u.toplayanKullanici) {
      const k = tGetir(u.toplayanKullanici);
      k.toplananUrun++;
      if (kgMi(u)) k.toplananKg += Number(u.miktar) || 0;
      if (u.duzeltildi) k.eksikHata++;
      if (u.miktarDuzeltildi && u.orijinalMiktar !== undefined && u.orijinalMiktar !== u.miktar) k.miktarHata++;
    }
    if (u.kontrolEdenKullanici) {
      const k = kGetir(u.kontrolEdenKullanici);
      k.kontrolEdilenUrun++;
      if (kgMi(u)) k.kontrolEdilenKg += Number(u.miktar) || 0;
      if (u.kontrolorEksikTespiti && u.kontrolorEksikTespitiKullanici === u.kontrolEdenKullanici) k.eksikTespit++;
      if (u.miktarDuzeltildi && u.miktarDuzeltenKullanici === u.kontrolEdenKullanici) k.miktarDuzeltme++;
    }
  });

  // Ortalama ve hız hesapla
  const toplayicilar = Array.from(tMap.values()).map((k) => {
    const topOrt = k.toplamaSureleri.length ? k.toplamaSureleri.reduce((a, b) => a + b, 0) / k.toplamaSureleri.length : null;
    const toplamSure = k.toplamaSureleri.reduce((a, b) => a + b, 0);
    const hizUrun = toplamSure > 0 ? (k.toplananUrun / toplamSure * 60).toFixed(1) : null;
    const hizKg = toplamSure > 0 && k.toplananKg ? (k.toplananKg / toplamSure * 60).toFixed(1) : null;
    const hataOrani = k.toplananUrun > 0 ? (((k.eksikHata + k.miktarHata) / k.toplananUrun) * 100).toFixed(1) : null;
    return {
      ...k,
      ortalamaToplamaSure: topOrt,
      toplamAktifSure: toplamSure || null,
      siparisSayisi: k.toplamaSureleri.length,
      hizUrun, hizKg, hataOrani
    };
  }).sort((a, b) => b.toplananUrun - a.toplananUrun);

  const kontrolorler = Array.from(kMap.values()).map((k) => {
    const konOrt = k.kontrolSureleri.length ? k.kontrolSureleri.reduce((a, b) => a + b, 0) / k.kontrolSureleri.length : null;
    const toplamSure = k.kontrolSureleri.reduce((a, b) => a + b, 0);
    const hizUrun = toplamSure > 0 ? (k.kontrolEdilenUrun / toplamSure * 60).toFixed(1) : null;
    return {
      ...k,
      ortalamaKontrolSure: konOrt,
      toplamAktifSure: toplamSure || null,
      siparisSayisi: k.kontrolSureleri.length,
      hizUrun
    };
  }).sort((a, b) => b.kontrolEdilenUrun - a.kontrolEdilenUrun);

  return { toplayicilar, kontrolorler };
}

/* ---- Yardımcı render fonksiyonları ---- */
function hataRozetiHtml(sayi) {
  if (!sayi) return '<span class="u-text-soft">—</span>';
  const sinif = sayi > 10 ? "badge-red" : sayi > 3 ? "badge-amber" : "badge-gray";
  return `<span class="badge ${sinif}">${sayi}</span>`;
}
function hataOraniHtml(oran) {
  if (oran === null || oran === undefined) return "—";
  const s = parseFloat(oran);
  const sinif = s > 10 ? "badge-red" : s > 3 ? "badge-amber" : "badge-green";
  return `<span class="badge ${sinif}">%${oran}</span>`;
}
function tespitRozetiHtml(sayi) {
  if (!sayi) return '<span class="u-text-soft">—</span>';
  return `<span class="badge badge-blue">${sayi}</span>`;
}

function render(toplayicilar, kontrolorler, siparisSayisi, urunSayisi) {
  document.getElementById("ozetAlani").textContent =
    `${siparisSayisi} sipariş, ${urunSayisi} ürün üzerinden hesaplandı.`;

  const tbody = document.getElementById("performansTabloGovde");
  const kartGovde = document.getElementById("performansKartGovde");
  const bos = document.getElementById("bosDurum");

  if (!toplayicilar.length && !kontrolorler.length) {
    tbody.innerHTML = ""; kartGovde.innerHTML = "";
    bos.classList.remove("u-hidden"); return;
  }
  bos.classList.add("u-hidden");

  tbody.innerHTML = `
    <tr style="background:var(--color-surface-2);">
      <td colspan="9" style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-ink-soft);padding:8px 12px;">
        📦 Toplayıcılar
      </td>
    </tr>
    ${toplayicilar.map((k) => `
    <tr>
      <td>${kacisEt(k.ad)}</td>
      <td>${k.toplananUrun}</td>
      <td>${k.toplananKg ? sayiBicimle(k.toplananKg) + " KG" : "—"}</td>
      <td>${hataRozetiHtml(k.eksikHata)}</td>
      <td>${hataRozetiHtml(k.miktarHata)}</td>
      <td>${hataOraniHtml(k.hataOrani)}</td>
      <td>${sureBicimle(k.ortalamaToplamaSure)}</td>
      <td>${k.hizUrun ? k.hizUrun + " ürün/s" : "—"}</td>
      <td>${k.hizKg ? k.hizKg + " KG/s" : "—"}</td>
    </tr>`).join("")}
    <tr style="background:var(--color-surface-2);">
      <td colspan="9" style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-ink-soft);padding:8px 12px;">
        ✅ Kontrolörler
      </td>
    </tr>
    ${kontrolorler.map((k) => `
    <tr>
      <td>${kacisEt(k.ad)}</td>
      <td>${k.kontrolEdilenUrun}</td>
      <td>${k.kontrolEdilenKg ? sayiBicimle(k.kontrolEdilenKg) + " KG" : "—"}</td>
      <td>${tespitRozetiHtml(k.eksikTespit)}</td>
      <td>${tespitRozetiHtml(k.miktarDuzeltme)}</td>
      <td>—</td>
      <td>${sureBicimle(k.ortalamaKontrolSure)}</td>
      <td>${k.hizUrun ? k.hizUrun + " ürün/s" : "—"}</td>
      <td>—</td>
    </tr>`).join("")}`;

  kartGovde.innerHTML = [
    ...toplayicilar.map((k) => `
      <div class="row-card">
        <div class="row-card__top">
          <div class="row-card__name">📦 ${kacisEt(k.ad)}</div>
          ${k.hataOrani !== null ? hataOraniHtml(k.hataOrani) : ""}
        </div>
        <div class="row-card__grid" style="margin-top:8px;">
          <div><div class="row-card__label">Topladığı Ürün</div>${k.toplananUrun}</div>
          <div><div class="row-card__label">Topladığı KG</div>${k.toplananKg ? sayiBicimle(k.toplananKg) + " KG" : "—"}</div>
          <div><div class="row-card__label">Eksik Hata</div>${hataRozetiHtml(k.eksikHata)}</div>
          <div><div class="row-card__label">Miktar Hatası</div>${hataRozetiHtml(k.miktarHata)}</div>
          <div><div class="row-card__label">Ort. Süre</div>${sureBicimle(k.ortalamaToplamaSure)}</div>
          <div><div class="row-card__label">Hız</div>${k.hizUrun ? k.hizUrun + " ürün/s" : "—"}</div>
        </div>
      </div>`),
    ...kontrolorler.map((k) => `
      <div class="row-card">
        <div class="row-card__top">
          <div class="row-card__name">✅ ${kacisEt(k.ad)}</div>
        </div>
        <div class="row-card__grid" style="margin-top:8px;">
          <div><div class="row-card__label">Kontrol Ettiği Ürün</div>${k.kontrolEdilenUrun}</div>
          <div><div class="row-card__label">Kontrol Ettiği KG</div>${k.kontrolEdilenKg ? sayiBicimle(k.kontrolEdilenKg) + " KG" : "—"}</div>
          <div><div class="row-card__label">Eksik Tespit</div>${tespitRozetiHtml(k.eksikTespit)}</div>
          <div><div class="row-card__label">Miktar Düzeltme</div>${tespitRozetiHtml(k.miktarDuzeltme)}</div>
          <div><div class="row-card__label">Ort. Süre</div>${sureBicimle(k.ortalamaKontrolSure)}</div>
          <div><div class="row-card__label">Hız</div>${k.hizUrun ? k.hizUrun + " ürün/s" : "—"}</div>
        </div>
      </div>`)
  ].join("");
}
