// ============================================================================
// PERSONEL PERFORMANSI RAPORU
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { tumSiparisleriGetir, urunleriniGetir } from "./veri.js";
import { arayuzHazirla, toast, kacisEt, sayiBicimle, yukleniyorGoster, yukleniyorKapat } from "./utils.js";

arayuzHazirla();

let sonTumUrunler = [];
let sonSiparisler = [];
let sonUrunListeleri = [];

sayfaKorumasi(["admin"], (kullanici) => {
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  document.getElementById("baslangicDurum").classList.remove("u-hidden");
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth); window.location.href = "index.html";
});

/* ---- Tarih kısayolları ---- */
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

/* ---- Ana hesaplama ---- */
document.getElementById("hesaplaBtn").addEventListener("click", async () => {
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
    sonTumUrunler = tumUrunler;
    sonSiparisler = siparisler;
    sonUrunListeleri = listeleri;
    const { toplayicilar, kontrolorler } = hesaplaOzetler(tumUrunler, siparisler);
    render(toplayicilar, kontrolorler, siparisler.length, tumUrunler.length);
    renderAnalizler(tumUrunler, siparisler, listeleri);
    yukleniyorKapat();
  } catch (err) {
    yukleniyorKapat(); console.error(err);
    toast("Hesaplanırken hata oluştu: " + (err.message || err), "error");
  }
});

/* ---- Süre yardımcıları ---- */
function dakikaFarki(baslangicIso, bitisIso) {
  if (!baslangicIso || !bitisIso) return null;
  const fark = (new Date(bitisIso) - new Date(baslangicIso)) / 60000;
  return fark > 0 && fark < 1440 ? fark : null; // 24 saatten büyükse geçersiz say
}

function sureBicimle(dakika) {
  if (!dakika) return "—";
  if (dakika < 60) return `${Math.round(dakika)} dk`;
  const saat = Math.floor(dakika / 60);
  const kalanDk = Math.round(dakika % 60);
  return kalanDk > 0 ? `${saat}s ${kalanDk}dk` : `${saat}s`;
}

/* ---- Özet hesaplama ---- */
function hesaplaOzetler(urunler, siparisler) {
  const tMap = new Map();
  const kMap = new Map();

  const tGetir = (ad) => {
    if (!tMap.has(ad)) tMap.set(ad, {
      ad, toplananUrun: 0, toplananKg: 0,
      eksikHata: 0, miktarHata: 0, toplamaSureleri: [], siparisSeti: new Set()
    });
    return tMap.get(ad);
  };
  const kGetir = (ad) => {
    if (!kMap.has(ad)) kMap.set(ad, {
      ad, kontrolEdilenUrun: 0, kontrolEdilenKg: 0,
      eksikTespit: 0, miktarDuzeltme: 0, kontrolSureleri: [], siparisSeti: new Set()
    });
    return kMap.get(ad);
  };

  const kgMi = (u) => String(u.birim || "").trim().toLowerCase() === "kg";

  siparisler.forEach((s) => {
    if (s.toplamayiTamamlayan && s.olusturulmaTarihi && s.toplamaBitis) {
      const baslangic = s.olusturulmaTarihi.toDate?.().toISOString?.() || s.olusturulmaTarihi;
      const sure = dakikaFarki(baslangic, s.toplamaBitis);
      if (sure) tGetir(s.toplamayiTamamlayan).toplamaSureleri.push(sure);
    }
    if (s.kontrolTamamlayan && s.kontrolBaslangic && s.kontrolBitis) {
      const sure = dakikaFarki(s.kontrolBaslangic, s.kontrolBitis);
      if (sure) kGetir(s.kontrolTamamlayan).kontrolSureleri.push(sure);
    }
  });

  urunler.forEach((u) => {
    if (u.toplayanKullanici) {
      const k = tGetir(u.toplayanKullanici);
      k.toplananUrun++;
      k.siparisSeti.add(u.siparisId || "");
      if (kgMi(u)) k.toplananKg += Number(u.miktar) || 0;
      if (u.duzeltildi) k.eksikHata++;
      if (u.miktarDuzeltildi && u.orijinalMiktar !== undefined && u.orijinalMiktar !== u.miktar) k.miktarHata++;
    }
    if (u.kontrolEdenKullanici) {
      const k = kGetir(u.kontrolEdenKullanici);
      k.kontrolEdilenUrun++;
      k.siparisSeti.add(u.siparisId || "");
      if (kgMi(u)) k.kontrolEdilenKg += Number(u.miktar) || 0;
      if (u.kontrolorEksikTespiti) k.eksikTespit++;
      if (u.miktarDuzeltildi && u.miktarDuzeltenKullanici === u.kontrolEdenKullanici) k.miktarDuzeltme++;
    }
  });

  const toplayicilar = Array.from(tMap.values()).map((k) => {
    const toplamSure = k.toplamaSureleri.reduce((a, b) => a + b, 0);
    const ortSure = k.toplamaSureleri.length ? toplamSure / k.toplamaSureleri.length : null;
    const hizUrun = toplamSure > 0 ? (k.toplananUrun / toplamSure * 60).toFixed(1) : null;
    const hizKg = toplamSure > 0 && k.toplananKg ? (k.toplananKg / toplamSure * 60).toFixed(1) : null;
    const toplamHata = k.eksikHata + k.miktarHata;
    const hataOrani = k.toplananUrun > 0 ? ((toplamHata / k.toplananUrun) * 100).toFixed(1) : null;
    return { ...k, ortalamaToplamaSure: ortSure, toplamSure, siparisSayisi: k.toplamaSureleri.length, hizUrun, hizKg, hataOrani, toplamHata };
  }).sort((a, b) => b.toplananUrun - a.toplananUrun);

  const kontrolorler = Array.from(kMap.values()).map((k) => {
    const toplamSure = k.kontrolSureleri.reduce((a, b) => a + b, 0);
    const ortSure = k.kontrolSureleri.length ? toplamSure / k.kontrolSureleri.length : null;
    const hizUrun = toplamSure > 0 ? (k.kontrolEdilenUrun / toplamSure * 60).toFixed(1) : null;
    const toplamDuzeltme = k.eksikTespit + k.miktarDuzeltme;
    return { ...k, ortalamaKontrolSure: ortSure, toplamSure, siparisSayisi: k.kontrolSureleri.length, hizUrun, toplamDuzeltme };
  }).sort((a, b) => b.kontrolEdilenUrun - a.kontrolEdilenUrun);

  return { toplayicilar, kontrolorler };
}

/* ---- Rozet yardımcıları ---- */
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

/* ---- Personel render ---- */
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
      <td colspan="9" style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-ink-soft);padding:8px 12px;">📦 Toplayıcılar</td>
    </tr>
    ${toplayicilar.map((k) => `
    <tr>
      <td><strong>${kacisEt(k.ad)}</strong></td>
      <td>${k.toplananUrun} ürün${k.siparisSayisi ? ` <span class="u-text-soft" style="font-size:11px;">(${k.siparisSayisi} sipariş)</span>` : ""}</td>
      <td>${k.toplananKg ? sayiBicimle(k.toplananKg) + " KG" : "—"}</td>
      <td>${hataRozetiHtml(k.eksikHata)}</td>
      <td>${hataRozetiHtml(k.miktarHata)}</td>
      <td>${hataOraniHtml(k.hataOrani)}</td>
      <td>${sureBicimle(k.ortalamaToplamaSure)}</td>
      <td>${k.hizUrun ? k.hizUrun + " ürün/s" : "—"}</td>
      <td>${k.hizKg ? k.hizKg + " KG/s" : "—"}</td>
    </tr>`).join("")}
    <tr style="background:var(--color-surface-2);">
      <td colspan="9" style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-ink-soft);padding:8px 12px;">✅ Kontrolörler</td>
    </tr>
    ${kontrolorler.map((k) => `
    <tr>
      <td><strong>${kacisEt(k.ad)}</strong></td>
      <td>${k.kontrolEdilenUrun} ürün${k.siparisSayisi ? ` <span class="u-text-soft" style="font-size:11px;">(${k.siparisSayisi} sipariş)</span>` : ""}</td>
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
          <div><div class="row-card__label">Sipariş</div>${k.siparisSayisi || "—"}</div>
          <div><div class="row-card__label">Toplanan Ürün</div>${k.toplananUrun}</div>
          <div><div class="row-card__label">Toplanan KG</div>${k.toplananKg ? sayiBicimle(k.toplananKg) : "—"}</div>
          <div><div class="row-card__label">Eksik Hata</div>${hataRozetiHtml(k.eksikHata)}</div>
          <div><div class="row-card__label">Miktar Hatası</div>${hataRozetiHtml(k.miktarHata)}</div>
          <div><div class="row-card__label">Ort. Süre</div>${sureBicimle(k.ortalamaToplamaSure)}</div>
          <div><div class="row-card__label">Hız</div>${k.hizUrun ? k.hizUrun + " ürün/s" : "—"}</div>
          <div><div class="row-card__label">KG Hız</div>${k.hizKg ? k.hizKg + " KG/s" : "—"}</div>
        </div>
      </div>`),
    ...kontrolorler.map((k) => `
      <div class="row-card">
        <div class="row-card__top">
          <div class="row-card__name">✅ ${kacisEt(k.ad)}</div>
          ${k.toplamDuzeltme ? `<span class="badge badge-blue">${k.toplamDuzeltme} düzeltme</span>` : ""}
        </div>
        <div class="row-card__grid" style="margin-top:8px;">
          <div><div class="row-card__label">Sipariş</div>${k.siparisSayisi || "—"}</div>
          <div><div class="row-card__label">Kontrol Ettiği Ürün</div>${k.kontrolEdilenUrun}</div>
          <div><div class="row-card__label">Kontrol Ettiği KG</div>${k.kontrolEdilenKg ? sayiBicimle(k.kontrolEdilenKg) : "—"}</div>
          <div><div class="row-card__label">Eksik Tespit</div>${tespitRozetiHtml(k.eksikTespit)}</div>
          <div><div class="row-card__label">Miktar Düzeltme</div>${tespitRozetiHtml(k.miktarDuzeltme)}</div>
          <div><div class="row-card__label">Ort. Süre</div>${sureBicimle(k.ortalamaKontrolSure)}</div>
          <div><div class="row-card__label">Hız</div>${k.hizUrun ? k.hizUrun + " ürün/s" : "—"}</div>
        </div>
      </div>`)
  ].join("");
}

/* ---- Analiz bölümleri ---- */
function hesaplaEksikAnalizi(urunler) {
  const map = new Map();
  urunler.forEach((u) => {
    const anahtar = (u.kod || u.ad || "bilinmiyor").trim();
    if (!map.has(anahtar)) map.set(anahtar, {
      ad: u.ad || u.kod, kod: u.kod, birim: u.birim || "",
      istek: 0, toplamMiktar: 0, eksik: 0, eksikMiktar: 0
    });
    const k = map.get(anahtar);
    k.istek++;
    k.toplamMiktar += Number(u.miktar) || 0;
    if (u.eksik) { k.eksik++; k.eksikMiktar += Number(u.miktar) || 0; }
  });
  return Array.from(map.values())
    .filter((k) => k.eksik > 0)
    .sort((a, b) => b.eksik - a.eksik)
    .slice(0, 20);
}

function hesaplaSubeAnalizi(siparisler, urunListeleri) {
  const map = new Map();
  siparisler.forEach((s, i) => {
    const sube = s.subeAdi || s.ad || "—";
    if (!map.has(sube)) map.set(sube, { sube, siparis: 0, urun: 0, kg: 0, teslim: 0, eksikUrun: 0 });
    const k = map.get(sube);
    k.siparis++;
    if (s.durum === "teslim_edildi") k.teslim++;
    const urunler = urunListeleri[i] || [];
    urunler.forEach((u) => {
      k.urun++;
      if (String(u.birim || "").trim().toLowerCase() === "kg") k.kg += Number(u.miktar) || 0;
      if (u.eksik) k.eksikUrun++;
    });
  });
  return Array.from(map.values()).sort((a, b) => b.siparis - a.siparis);
}

function renderAnalizler(tumUrunler, siparisler, urunListeleri) {
  // Eksik ürün analizi
  const eksikAnalizBolumu = document.getElementById("eksikAnalizBolumu");
  const eksikAnalizTablosu = document.getElementById("eksikAnalizTablosu");
  const eksikler = hesaplaEksikAnalizi(tumUrunler);
  eksikAnalizBolumu.classList.toggle("u-hidden", eksikler.length === 0);
  if (eksikler.length) {
    eksikAnalizTablosu.innerHTML = eksikler.map((k) => {
      const oran = ((k.eksik / k.istek) * 100).toFixed(1);
      const sinif = oran > 30 ? "badge-red" : oran > 10 ? "badge-amber" : "badge-gray";
      const birim = kacisEt(k.birim || "");
      return `<tr>
        <td class="cell-code">${kacisEt(k.kod || "—")}</td>
        <td>${kacisEt(k.ad)}</td>
        <td>${k.eksik}</td>
        <td>${sayiBicimle(k.eksikMiktar)} ${birim}</td>
        <td>${sayiBicimle(k.toplamMiktar)} ${birim}</td>
        <td>${k.istek}</td>
        <td><span class="badge ${sinif}">%${oran}</span></td>
      </tr>`;
    }).join("");
  }

  // Şube analizi — urunListeleri doğru geçiriliyor
  const subeAnalizBolumu = document.getElementById("subeAnalizBolumu");
  const subeAnalizTablosu = document.getElementById("subeAnalizTablosu");
  const subeler = hesaplaSubeAnalizi(siparisler, urunListeleri);
  subeAnalizBolumu.classList.toggle("u-hidden", subeler.length === 0);
  if (subeler.length) {
    subeAnalizTablosu.innerHTML = subeler.map((k) => `<tr>
      <td>${kacisEt(k.sube)}</td>
      <td>${k.siparis}</td>
      <td>${k.urun}</td>
      <td>${k.kg ? sayiBicimle(k.kg) + " KG" : "—"}</td>
      <td>${k.eksikUrun > 0 ? `<span class="badge badge-red">${k.eksikUrun}</span>` : '<span class="u-text-soft">—</span>'}</td>
      <td>${k.teslim > 0 ? `<span class="badge badge-green">${k.teslim}</span>` : "—"}</td>
    </tr>`).join("");
  }

  document.getElementById("excelExportBtn").style.display = "";
}

/* ---- Excel export ---- */
document.getElementById("excelExportBtn").addEventListener("click", () => {
  if (!sonTumUrunler.length) return;
  const wb = window.XLSX.utils.book_new();

  // Personel sayfası
  const { toplayicilar, kontrolorler } = hesaplaOzetler(sonTumUrunler, sonSiparisler);
  const personelSatirlar = [
    ["Personel", "Rol", "Sipariş", "Ürün", "KG", "Eksik Hata", "Miktar Hatası", "% Hata", "Ort. Süre (dk)", "Hız (ürün/s)", "Hız (KG/s)"],
    ...toplayicilar.map((k) => [k.ad, "Toplayıcı", k.siparisSayisi, k.toplananUrun, k.toplananKg, k.eksikHata, k.miktarHata, k.hataOrani, k.ortalamaToplamaSure ? Math.round(k.ortalamaToplamaSure) : "", k.hizUrun || "", k.hizKg || ""]),
    ...kontrolorler.map((k) => [k.ad, "Kontrolör", k.siparisSayisi, k.kontrolEdilenUrun, k.kontrolEdilenKg, k.eksikTespit, k.miktarDuzeltme, "", k.ortalamaKontrolSure ? Math.round(k.ortalamaKontrolSure) : "", k.hizUrun || "", ""])
  ];
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(personelSatirlar), "Personel");

  // Eksik ürün sayfası
  const eksikler = hesaplaEksikAnalizi(sonTumUrunler);
  if (eksikler.length) {
    const eksikSatirlar = [
      ["Kod", "Ürün Adı", "Eksik Kez", "Eksik Miktar", "Toplam İstenen", "Toplam Sipariş", "% Eksik", "Birim"],
      ...eksikler.map((k) => [k.kod, k.ad, k.eksik, k.eksikMiktar, k.toplamMiktar, k.istek, ((k.eksik / k.istek) * 100).toFixed(1), k.birim])
    ];
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(eksikSatirlar), "Eksik Ürünler");
  }

  // Şube sayfası — artık sonUrunListeleri doğru geçiriliyor
  const subeler = hesaplaSubeAnalizi(sonSiparisler, sonUrunListeleri);
  if (subeler.length) {
    const subeSatirlar = [
      ["Şube", "Sipariş Sayısı", "Toplam Ürün", "Toplam KG", "Eksik Ürün", "Teslim Onayı"],
      ...subeler.map((k) => [k.sube, k.siparis, k.urun, k.kg, k.eksikUrun, k.teslim])
    ];
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(subeSatirlar), "Şube Analizi");
  }

  const tarih = new Date().toLocaleDateString("tr-TR").replace(/\./g, "-");
  window.XLSX.writeFile(wb, `depomax_rapor_${tarih}.xlsx`);
  toast("Excel indirildi.", "success");
});
