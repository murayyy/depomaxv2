// ============================================================================
// PERSONEL PERFORMANSI RAPORU MANTIĞI
// ----------------------------------------------------------------------------
// Bu sayfa gerçek zamanlı değil — "Hesapla" butonuna basıldığında seçilen
// tarih aralığındaki siparişleri ve ürünlerini bir kerelik okuyup,
// toplayanKullanici / kontrolEdenKullanici alanlarına göre kişi başına
// toplam ürün sayısı ve KG'yi hesaplar.
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

/* ---------------- Hızlı tarih aralığı butonları ---------------- */
function tarihGiris(d) { return d.toISOString().slice(0, 10); }

document.getElementById("butGun7").addEventListener("click", () => {
  const bugun = new Date();
  const yediGunOnce = new Date(bugun.getTime() - 6 * 24 * 60 * 60 * 1000);
  document.getElementById("tarihBaslangic").value = tarihGiris(yediGunOnce);
  document.getElementById("tarihBitis").value = tarihGiris(bugun);
});
document.getElementById("butGun30").addEventListener("click", () => {
  const bugun = new Date();
  const otuzGunOnce = new Date(bugun.getTime() - 29 * 24 * 60 * 60 * 1000);
  document.getElementById("tarihBaslangic").value = tarihGiris(otuzGunOnce);
  document.getElementById("tarihBitis").value = tarihGiris(bugun);
});
document.getElementById("butTumZamanlar").addEventListener("click", () => {
  document.getElementById("tarihBaslangic").value = "";
  document.getElementById("tarihBitis").value = "";
});

/* ---------------- Hesaplama ---------------- */
document.getElementById("hesaplaBtn").addEventListener("click", hesapla);

async function hesapla() {
  document.getElementById("baslangicDurum").classList.add("u-hidden");
  yukleniyorGoster("Siparişler okunuyor…");
  try {
    const tumSiparisler = await tumSiparisleriGetir();

    const baslangic = document.getElementById("tarihBaslangic").value;
    const bitis = document.getElementById("tarihBitis").value;
    let siparisler = tumSiparisler;
    if (baslangic) {
      const sinir = new Date(baslangic + "T00:00:00").getTime();
      siparisler = siparisler.filter((s) => !s.olusturulmaTarihi || s.olusturulmaTarihi.toMillis() >= sinir);
    }
    if (bitis) {
      const sinir = new Date(bitis + "T23:59:59").getTime();
      siparisler = siparisler.filter((s) => !s.olusturulmaTarihi || s.olusturulmaTarihi.toMillis() <= sinir);
    }

    yukleniyorGoster(`${siparisler.length} siparişin ürünleri okunuyor…`);
    const urunListeleri = await Promise.all(siparisler.map((s) => urunleriniGetir(s.id)));
    const tumUrunler = urunListeleri.flat();

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
    if (!map.has(ad)) map.set(ad, { ad, toplananUrun: 0, toplananKg: 0, kontrolEdilenUrun: 0, kontrolEdilenKg: 0 });
    return map.get(ad);
  };
  const kgMi = (u) => String(u.birim || "").trim().toLowerCase() === "kg";

  urunler.forEach((u) => {
    if (u.toplayanKullanici) {
      const kayit = kayitGetir(u.toplayanKullanici);
      kayit.toplananUrun++;
      if (kgMi(u)) kayit.toplananKg += Number(u.miktar) || 0;
    }
    if (u.kontrolEdenKullanici) {
      const kayit = kayitGetir(u.kontrolEdenKullanici);
      kayit.kontrolEdilenUrun++;
      if (kgMi(u)) kayit.kontrolEdilenKg += Number(u.miktar) || 0;
    }
  });

  return Array.from(map.values()).sort((a, b) => (b.toplananUrun + b.kontrolEdilenUrun) - (a.toplananUrun + a.kontrolEdilenUrun));
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
    </tr>`).join("");

  kartGovde.innerHTML = sonuc.map((k) => `
    <div class="row-card">
      <div class="row-card__name">${kacisEt(k.ad)}</div>
      <div class="row-card__grid" style="margin-top:8px;">
        <div><div class="row-card__label">Topladığı Ürün</div>${k.toplananUrun}</div>
        <div><div class="row-card__label">Topladığı KG</div>${k.toplananKg ? sayiBicimle(k.toplananKg) + " KG" : "—"}</div>
        <div><div class="row-card__label">Kontrol Ettiği Ürün</div>${k.kontrolEdilenUrun}</div>
        <div><div class="row-card__label">Kontrol Ettiği KG</div>${k.kontrolEdilenKg ? sayiBicimle(k.kontrolEdilenKg) + " KG" : "—"}</div>
      </div>
    </div>`).join("");
}
