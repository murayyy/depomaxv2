// ============================================================================
// PERSONEL PERFORMANSI RAPORU MANTIĞI
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
  await signOut(auth);
  window.location.href = "index.html";
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
    const sonuc = hesaplaPersonelOzeti(tumUrunler);
    render(sonuc, siparisler.length, tumUrunler.length);
    yukleniyorKapat();
  } catch (err) {
    yukleniyorKapat();
    console.error(err);
    toast("Hesaplanırken bir hata oluştu.", "error");
  }
}

function hesaplaPersonelOzeti(urunler) {
  const map = new Map();
  const kayitGetir = (ad) => {
    if (!map.has(ad)) map.set(ad, {
      ad,
      toplananUrun: 0, toplananKg: 0,
      kontrolEdilenUrun: 0, kontrolEdilenKg: 0,
      eksikHata: 0,     // toplayıcı eksik dedi ama kontrolör toplandı yaptı
      miktarHata: 0     // toplayıcı yanlış miktar girdi, kontrolör düzeltti
    });
    return map.get(ad);
  };
  const kgMi = (u) => String(u.birim || "").trim().toLowerCase() === "kg";

  urunler.forEach((u) => {
    if (u.toplayanKullanici) {
      const k = kayitGetir(u.toplayanKullanici);
      k.toplananUrun++;
      if (kgMi(u)) k.toplananKg += Number(u.miktar) || 0;
      // Eksik işaretleme hatası: kontrolör duzeltildi=true işaretledi
      if (u.duzeltildi) k.eksikHata++;
      // Miktar hatası: kontrolör miktarı değiştirdi
      if (u.miktarDuzeltildi && u.orijinalMiktar !== undefined && u.orijinalMiktar !== u.miktar) k.miktarHata++;
    }
    if (u.kontrolEdenKullanici) {
      const k = kayitGetir(u.kontrolEdenKullanici);
      k.kontrolEdilenUrun++;
      if (kgMi(u)) k.kontrolEdilenKg += Number(u.miktar) || 0;
    }
  });

  return Array.from(map.values())
    .sort((a, b) => (b.toplananUrun + b.kontrolEdilenUrun) - (a.toplananUrun + a.kontrolEdilenUrun));
}

function hataRozetiHtml(sayi, tip) {
  if (!sayi) return '<span class="u-text-soft">—</span>';
  const sinif = sayi > 5 ? "badge-red" : sayi > 2 ? "badge-amber" : "badge-gray";
  return `<span class="badge ${sinif}" title="${tip}">${sayi}</span>`;
}

function render(sonuc, siparisSayisi, urunSayisi) {
  document.getElementById("ozetAlani").textContent =
    `${siparisSayisi} sipariş, ${urunSayisi} ürün üzerinden hesaplandı.`;

  const tbody = document.getElementById("performansTabloGovde");
  const kartGovde = document.getElementById("performansKartGovde");
  const bos = document.getElementById("bosDurum");

  if (sonuc.length === 0) {
    tbody.innerHTML = "";
    kartGovde.innerHTML = "";
    bos.classList.remove("u-hidden");
    return;
  }
  bos.classList.add("u-hidden");

  tbody.innerHTML = sonuc.map((k) => `
    <tr>
      <td>${kacisEt(k.ad)}</td>
      <td>${k.toplananUrun}</td>
      <td>${k.toplananKg ? sayiBicimle(k.toplananKg) + " KG" : "—"}</td>
      <td>${k.kontrolEdilenUrun}</td>
      <td>${k.kontrolEdilenKg ? sayiBicimle(k.kontrolEdilenKg) + " KG" : "—"}</td>
      <td>${hataRozetiHtml(k.eksikHata, "Eksik işaretleyip kontrolde düzeltilen ürün")}</td>
      <td>${hataRozetiHtml(k.miktarHata, "Yanlış miktar girip kontrolde düzeltilen ürün")}</td>
    </tr>`).join("");

  kartGovde.innerHTML = sonuc.map((k) => `
    <div class="row-card">
      <div class="row-card__name">${kacisEt(k.ad)}</div>
      <div class="row-card__grid" style="margin-top:8px;">
        <div><div class="row-card__label">Topladığı Ürün</div>${k.toplananUrun}</div>
        <div><div class="row-card__label">Topladığı KG</div>${k.toplananKg ? sayiBicimle(k.toplananKg) + " KG" : "—"}</div>
        <div><div class="row-card__label">Kontrol Ettiği Ürün</div>${k.kontrolEdilenUrun}</div>
        <div><div class="row-card__label">Kontrol Ettiği KG</div>${k.kontrolEdilenKg ? sayiBicimle(k.kontrolEdilenKg) + " KG" : "—"}</div>
        <div><div class="row-card__label">Eksik Hata</div>${hataRozetiHtml(k.eksikHata, "")}</div>
        <div><div class="row-card__label">Miktar Hatası</div>${hataRozetiHtml(k.miktarHata, "")}</div>
      </div>
    </div>`).join("");
}
