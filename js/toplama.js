// ============================================================================
// TOPLAMA EKRANI MANTIĞI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import {
  siparisleriDinle, siparisOlustur, siparisGuncelle, tumSiparisleriCanliDinle,
  urunleriDinle, urunleriTopluEkle, urunEkle, urunGuncelle, urunSil,
  stokDusur, stokGeriEkle
} from "./veri.js";
import { stoklariDinle, stokRozetiHtml } from "./stok.js";
import {
  arayuzHazirla, toast, onayIste, yukleniyorGoster, yukleniyorKapat,
  reyonKarsilastir, excelDosyasiniOku, excelOlarakIndir, tarihBicimle,
  debounce, BarkodTarayici, kacisEt, kgToplami, sayiBicimle, ondalikOku,
  odakDurumunuKaydet, odakDurumunuGeriYukle, sesCal, siparisGecisleriniTespitEt
} from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;
let aktifSekme = "aktif";
let siparisAbonelikIptal = null;
let urunAbonelikIptal = null;
let sayacYazimZamanlayici = null;
let aktifSiparis = null;
let urunlerCache = [];
let aramaMetni = "";
let tarayici = null;
let sonBulunamadiBarkod = null;
let stokMap = new Map();
stoklariDinle((map) => {
  stokMap = map;
  if (aktifSiparis) renderUrunler(aktifSiparis.durum !== "toplaniyor");
});

/* ---------------- Bildirimler: sekme/durum geçişlerini canlı izle ---------------- */
let bilinenSiparisDurumlari = new Map();
let bildirimIlkYukleme = true;
tumSiparisleriCanliDinle((tumListe) => {
  const gecisler = siparisGecisleriniTespitEt(bilinenSiparisDurumlari, tumListe, bildirimIlkYukleme);
  bildirimIlkYukleme = false;
  gecisler.forEach((g) => {
    if (g.eskiDurum === undefined && g.yeniDurum === "toplaniyor") {
      sesCal("basari");
      toast(`🆕 Yeni sipariş oluşturuldu: ${g.ad}`, "info", 5000);
    } else if (g.yeniDurum === "sevk_edildi" && g.eskiDurum && g.eskiDurum !== "sevk_edildi") {
      sesCal("basari");
      toast(`🚚 Sipariş sevke çevrildi: ${g.ad}`, "success", 5000);
    }
  });
});

/* ---------------- Başlangıç / yetki kontrolü ---------------- */
sayfaKorumasi(["toplayici"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  if (kullanici.rol === "admin") {
    document.getElementById("topNav").insertAdjacentHTML("beforeend",
      `<a class="topbar__link" href="kontrol.html">✅ Kontrol</a><a class="topbar__link" href="admin.html">👥 Yönetim</a><a class="topbar__link" href="performans.html">📊 Performans</a>`);
  }
  sekmeYukle("aktif");
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

/* ---------------- Sekmeler (Devam Eden / Tamamlanan) ---------------- */
document.querySelectorAll("[data-sekme]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-sekme]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    sekmeYukle(btn.dataset.sekme);
  });
});

let sonSiparisListesi = [];

function sekmeYukle(sekme) {
  aktifSekme = sekme;
  if (siparisAbonelikIptal) siparisAbonelikIptal();
  const durumlar = sekme === "aktif" ? ["toplaniyor"] : ["toplandi", "kontrol_ediliyor", "tamamlandi", "sevk_edildi"];
  siparisAbonelikIptal = siparisleriDinle(durumlar, (liste) => {
    sonSiparisListesi = liste;
    filtreliSiparisleriGoster();
  });
}

function filtreliSiparisleriGoster() {
  let liste = sonSiparisListesi;
  const aramaMetni = document.getElementById("siparisAramaKutusu").value.trim().toLowerCase();
  if (aramaMetni) liste = liste.filter((s) => (s.ad || "").toLowerCase().includes(aramaMetni));

  const baslangic = document.getElementById("tarihBaslangic").value;
  const bitis = document.getElementById("tarihBitis").value;
  if (baslangic) {
    const sinir = new Date(baslangic + "T00:00:00").getTime();
    liste = liste.filter((s) => !s.olusturulmaTarihi || s.olusturulmaTarihi.toMillis() >= sinir);
  }
  if (bitis) {
    const sinir = new Date(bitis + "T23:59:59").getTime();
    liste = liste.filter((s) => !s.olusturulmaTarihi || s.olusturulmaTarihi.toMillis() <= sinir);
  }
  renderSiparisListesi(liste);
}

document.getElementById("siparisAramaKutusu").addEventListener("input", debounce(filtreliSiparisleriGoster, 200));
document.getElementById("tarihBaslangic").addEventListener("change", filtreliSiparisleriGoster);
document.getElementById("tarihBitis").addEventListener("change", filtreliSiparisleriGoster);

function renderSiparisListesi(liste) {
  const kapsayici = document.getElementById("siparisListesi");
  const bos = document.getElementById("bosDurum");
  if (liste.length === 0) {
    kapsayici.innerHTML = "";
    bos.classList.remove("u-hidden");
    return;
  }
  bos.classList.add("u-hidden");
  kapsayici.innerHTML = liste.map((s) => {
    const toplam = s.toplamUrun || 0;
    const tamam = (s.toplananUrun || 0) + (s.eksikUrun || 0);
    const yuzde = toplam ? Math.round((tamam / toplam) * 100) : 0;
    const durumRozeti = {
      toplaniyor: '<span class="badge badge-amber">Toplanıyor</span>',
      toplandi: '<span class="badge badge-blue">Kontrolde</span>',
      kontrol_ediliyor: '<span class="badge badge-blue">Kontrolde</span>',
      tamamlandi: '<span class="badge badge-amber">Sevk Bekliyor</span>',
      sevk_edildi: '<span class="badge badge-green">Sevk Edildi</span>'
    }[s.durum] || "";
    const aciliyetRozeti = { cok_acil: '<span class="badge badge-red">🔴 Çok Acil</span>', acil: '<span class="badge badge-amber">🟡 Acil</span>' }[s.aciliyet] || "";
    return `
      <div class="card order-card${s.aciliyet === "cok_acil" ? " is-aktarildi" : ""}" data-id="${s.id}">
        <div class="order-card__main">
          <div class="order-card__name">${kacisEt(s.ad)}</div>
          <div class="order-card__meta">
            ${durumRozeti}
            ${aciliyetRozeti}
            <span>${toplam} ürün</span>
            ${s.toplamKg ? `<span>${sayiBicimle(s.toplamKg)} KG</span>` : ""}
            <span>${tarihBicimle(s.olusturulmaTarihi)}</span>
          </div>
        </div>
        <div class="order-card__progress">
          <div class="progress-bar"><div class="progress-bar__fill" style="width:${yuzde}%"></div></div>
          <div class="progress-label">${tamam}/${toplam} işaretlendi</div>
        </div>
        <div class="order-card__actions">
          <button class="btn btn-primary btn-sm" data-ac="${s.id}">${s.durum === "toplaniyor" ? "Aç →" : "Görüntüle →"}</button>
        </div>
      </div>`;
  }).join("");

  kapsayici.querySelectorAll("[data-ac]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const siparis = liste.find((s) => s.id === btn.dataset.ac);
      siparisAc(siparis);
    });
  });
}

/* ---------------- Yeni sipariş oluşturma ---------------- */
document.getElementById("yeniSiparisBtn").addEventListener("click", yeniSiparisModalAc);

function yeniSiparisModalAc() {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal">
        <h3>Yeni Sipariş Oluştur</h3>
        <p>Sipariş için bir ad girin ve isteğe bağlı olarak Excel dosyasından ürün yükleyin.</p>
        <div class="field">
          <label>Sipariş Adı</label>
          <input class="input" id="ysAd" placeholder="örn. Tuğlubey-21Haz-Sevkiyat1" />
        </div>
        <div class="field">
          <label>Aciliyet</label>
          <select class="select" id="ysAciliyet">
            <option value="normal">Normal</option>
            <option value="acil">🟡 Acil</option>
            <option value="cok_acil">🔴 Çok Acil</option>
          </select>
        </div>
        <div class="field">
          <label>Excel Dosyası (opsiyonel — sonra da eklenebilir)</label>
          <div class="file-drop">
            📄 Ürün listesini içeren .xlsx dosyasını seçin
            <br><input type="file" id="ysDosya" accept=".xlsx,.xls,.csv" />
          </div>
        </div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="onay">Oluştur</button>
        </div>
      </div>
    </div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
  root.querySelector('[data-role="onay"]').onclick = async () => {
    const ad = document.getElementById("ysAd").value.trim();
    const dosya = document.getElementById("ysDosya").files[0];
    const aciliyet = document.getElementById("ysAciliyet")?.value || "normal";
    if (!ad) { toast("Lütfen sipariş için bir ad girin.", "error"); return; }
    kapat();
    yukleniyorGoster("Sipariş oluşturuluyor…");
    try {
      const siparisId = await siparisOlustur({ ad, olusturan: mevcutKullanici.uid, aciliyet });
      let toplamUrun = 0;
      if (dosya) {
        yukleniyorGoster("Excel okunuyor ve yükleniyor…");
        const satirlar = await excelDosyasiniOku(dosya);
        console.log("[Depomax] Excel'den okunan satır sayısı:", satirlar.length, satirlar[0]);
        toplamUrun = await urunleriTopluEkle(siparisId, satirlar);
      }
      yukleniyorKapat();
      if (dosya && toplamUrun === 0) {
        toast("Sipariş oluşturuldu fakat Excel'den hiç ürün okunamadı. Dosya başlıklarını kontrol edin.", "error", 7000);
      } else if (dosya) {
        toast(`Sipariş oluşturuldu, ${toplamUrun} ürün eklendi.`, "success");
      } else {
        toast("Sipariş oluşturuldu.", "success");
      }
      siparisAc({ id: siparisId, ad, durum: "toplaniyor", toplamUrun, toplananUrun: 0, eksikUrun: 0 });
    } catch (err) {
      yukleniyorKapat();
      console.error(err);
      toast("Sipariş oluşturulurken hata oluştu.", "error");
    }
  };
}

/* ---------------- Sipariş detayını açma / kapama ---------------- */
function siparisAc(siparis) {
  aktifSiparis = siparis;
  document.getElementById("listeGorunumu").classList.add("u-hidden");
  document.getElementById("detayGorunumu").classList.remove("u-hidden");
  document.getElementById("detaySiparisAdi").textContent = siparis.ad;

  const saltOkunur = siparis.durum !== "toplaniyor";
  document.getElementById("tamamlaBtn").classList.toggle("u-hidden", saltOkunur);
  document.getElementById("urunEkleBtn").classList.toggle("u-hidden", saltOkunur);
  document.getElementById("barkodTaraBtn").classList.toggle("u-hidden", saltOkunur);
  document.getElementById("excelYukleBtn").classList.toggle("u-hidden", saltOkunur);

  if (urunAbonelikIptal) urunAbonelikIptal();
  urunAbonelikIptal = urunleriDinle(siparis.id, (liste) => {
    urunlerCache = liste;
    // Liste sayfasındaki ilerleme göstergesi için sipariş üzerinde sayaçları güncelle.
    const toplanan = liste.filter((u) => u.toplandi).length;
    const eksik = liste.filter((u) => u.eksik).length;
    const toplamKg = kgToplami(liste);
    if (siparis.durum === "toplaniyor" &&
        (toplanan !== siparis.toplananUrun || eksik !== siparis.eksikUrun || liste.length !== siparis.toplamUrun || toplamKg !== siparis.toplamKg)) {
      siparis.toplananUrun = toplanan;
      siparis.eksikUrun = eksik;
      siparis.toplamUrun = liste.length;
      siparis.toplamKg = toplamKg;
      clearTimeout(sayacYazimZamanlayici);
      sayacYazimZamanlayici = setTimeout(() => {
        siparisGuncelle(siparis.id, { toplananUrun: toplanan, eksikUrun: eksik, toplamUrun: liste.length, toplamKg });
      }, 2500);
    }
    renderUrunler(saltOkunur);
  });
}

document.getElementById("geriBtn").addEventListener("click", geriDon);
function geriDon() {
  if (urunAbonelikIptal) { urunAbonelikIptal(); urunAbonelikIptal = null; }
  clearTimeout(sayacYazimZamanlayici);
  if (tarayici) tarayici.durdur();
  aktifSiparis = null;
  urunlerCache = [];
  document.getElementById("detayGorunumu").classList.add("u-hidden");
  document.getElementById("listeGorunumu").classList.remove("u-hidden");
}

/* ---------------- Ürün tablosu render ---------------- */
document.getElementById("aramaKutusu").addEventListener("input", debounce((e) => {
  aramaMetni = e.target.value.trim().toLowerCase();
  renderUrunler(aktifSiparis && aktifSiparis.durum !== "toplaniyor");
}, 200));

function renderUrunler(saltOkunur) {
  stokRiskBanneriniGoster();

  let liste = [...urunlerCache].sort((a, b) => reyonKarsilastir(a.reyon, b.reyon));
  if (aramaMetni) {
    liste = liste.filter((u) =>
      (u.ad || "").toLowerCase().includes(aramaMetni) ||
      (u.kod || "").toLowerCase().includes(aramaMetni) ||
      (u.reyon || "").toLowerCase().includes(aramaMetni) ||
      (u.barkod || "").toLowerCase().includes(aramaMetni)
    );
  }

  const toplam = urunlerCache.length;
  const tamam = urunlerCache.filter((u) => u.toplandi || u.eksik).length;
  const yuzde = toplam ? Math.round((tamam / toplam) * 100) : 0;
  document.getElementById("detayIlerlemeYazi").textContent = `${tamam}/${toplam} ürün işaretlendi`;
  document.getElementById("detayIlerlemeBar").style.width = yuzde + "%";
  const toplamKg = kgToplami(urunlerCache);
  document.getElementById("detayAgirlikYazi").textContent = toplamKg ? `Toplam: ${sayiBicimle(toplamKg)} KG` : "";

  document.getElementById("detayBosDurum").classList.toggle("u-hidden", urunlerCache.length !== 0);

  const tbody = document.getElementById("urunTabloGovde");
  const kartGovde = document.getElementById("urunKartGovde");

  if (liste.length === 0) { tbody.innerHTML = ""; kartGovde.innerHTML = ""; return; }

  const tbodyOdak = odakDurumunuKaydet("urunTabloGovde");
  const kartOdak = odakDurumunuKaydet("urunKartGovde");

  tbody.innerHTML = liste.map((u) => satirHtml(u, saltOkunur)).join("");
  kartGovde.innerHTML = liste.map((u) => kartHtml(u, saltOkunur)).join("");

  baglaSatirOlaylari(tbody, saltOkunur);
  baglaSatirOlaylari(kartGovde, saltOkunur);

  odakDurumunuGeriYukle("urunTabloGovde", tbodyOdak);
  odakDurumunuGeriYukle("urunKartGovde", kartOdak);
}

function durumSinifi(u) {
  if (u.toplandi) return "row-done";
  if (u.eksik) return "row-missing";
  return "";
}

function depoStokHucresi(kod) {
  const kayit = stokMap.get(kod);
  if (!kayit) return '<span class="u-text-soft" style="font-size:11.5px;">—</span>';
  return `<div style="display:flex; flex-direction:column; gap:2px; align-items:flex-start;">
      <span style="font-size:12.5px; font-weight:600;">${sayiBicimle(kayit.miktar)} ${kacisEt(kayit.birim || "")}</span>
      ${stokRozetiHtml(kayit)}
    </div>`;
}

function stokRiskBanneriniGoster() {
  const banner = document.getElementById("stokRiskBanner");
  if (!banner) return;

  // Henüz toplanmamış/eksik işaretlenmemiş ürünler için risk kontrolü yapılır —
  // zaten sonuçlanmış (toplandı/eksik) ürünler artık "risk" sayılmaz.
  const riskler = urunlerCache
    .filter((u) => !u.toplandi && !u.eksik && u.kod)
    .map((u) => {
      const stok = stokMap.get(u.kod);
      if (!stok) return null;
      const stokBirim = String(stok.birim || "").trim().toLowerCase();
      const siparisBirim = String(u.birim || "").trim().toLowerCase();
      if (stokBirim && siparisBirim && stokBirim !== siparisBirim) return null; // birim uyuşmuyorsa kıyaslama
      const mevcut = Number(stok.miktar) || 0;
      const istenen = Number(u.miktar) || 0;
      if (mevcut < istenen) return { ...u, mevcutStok: mevcut, stokBirim: stok.birim };
      return null;
    })
    .filter(Boolean);

  if (riskler.length === 0) {
    banner.classList.add("u-hidden");
    banner.innerHTML = "";
    return;
  }

  banner.classList.remove("u-hidden");
  banner.innerHTML = `
    <div class="risk-banner">
      <div class="risk-banner__title">⚠️ Stok Riski: ${riskler.length} üründe depo stoğu siparişten az görünüyor</div>
      <div class="risk-banner__list">
        ${riskler.map((r) => `
          <div class="risk-banner__item">
            <b>${kacisEt(r.ad)}</b> (${kacisEt(r.kod)}) —
            istenen ${sayiBicimle(r.miktar)} ${kacisEt(r.birim || "")},
            depoda ${sayiBicimle(r.mevcutStok)} ${kacisEt(r.stokBirim || "")}
          </div>`).join("")}
      </div>
    </div>`;
}

function satirHtml(u, saltOkunur) {
  return `
    <tr class="${durumSinifi(u)}" data-uid="${u.id}">
      <td class="cell-code">${kacisEt(u.kod)}</td>
      <td>${kacisEt(u.ad)}</td>
      <td><input type="text" inputmode="decimal" class="cell-qty-input" data-rol="miktar" value="${u.miktar || 0}" ${saltOkunur ? "disabled" : ""} /></td>
      <td>${kacisEt(u.birim || "—")}</td>
      <td>${depoStokHucresi(u.kod)}</td>
      <td><span class="reyon-tag">${kacisEt(u.reyon || "—")}</span></td>
      <td>${kacisEt(u.aciklama)}</td>
      <td class="cell-code">${kacisEt(u.barkod)}</td>
      <td><input type="checkbox" class="checkbox-lg" data-rol="toplandi" ${u.toplandi ? "checked" : ""} ${saltOkunur ? "disabled" : ""} /></td>
      <td><input type="checkbox" class="checkbox-lg" data-rol="eksik" ${u.eksik ? "checked" : ""} ${saltOkunur ? "disabled" : ""} /></td>
      <td class="u-text-soft" style="font-size:12px;">${kacisEt(u.toplayanKullanici || "—")}</td>
      <td>${saltOkunur ? "" : `<button class="btn btn-danger btn-sm" data-rol="sil">Sil</button>`}</td>
    </tr>`;
}

function kartHtml(u, saltOkunur) {
  return `
    <div class="row-card ${durumSinifi(u)}" data-uid="${u.id}">
      <div class="row-card__top">
        <div>
          <div class="row-card__name">${kacisEt(u.ad)}</div>
          <div class="row-card__code">${kacisEt(u.kod)} · ${kacisEt(u.barkod || "barkod yok")}</div>
        </div>
        <span class="reyon-tag">${kacisEt(u.reyon || "—")}</span>
      </div>
      <div class="row-card__grid">
        <div><div class="row-card__label">Miktar</div><input type="text" inputmode="decimal" class="cell-qty-input" data-rol="miktar" value="${u.miktar || 0}" ${saltOkunur ? "disabled" : ""} /></div>
        <div><div class="row-card__label">Depo Stok</div>${depoStokHucresi(u.kod)}</div>
        <div><div class="row-card__label">Birim</div>${kacisEt(u.birim || "—")}</div>
        <div><div class="row-card__label">Açıklama</div>${kacisEt(u.aciklama) || "—"}</div>
      </div>
      <div class="row-card__actions">
        <label class="row-card__action"><input type="checkbox" class="checkbox-lg" data-rol="toplandi" ${u.toplandi ? "checked" : ""} ${saltOkunur ? "disabled" : ""} /> Toplandı</label>
        <label class="row-card__action"><input type="checkbox" class="checkbox-lg" data-rol="eksik" ${u.eksik ? "checked" : ""} ${saltOkunur ? "disabled" : ""} /> Eksik</label>
        ${saltOkunur ? "" : `<button class="btn btn-danger btn-sm" data-rol="sil">Sil</button>`}
      </div>
      ${u.toplayanKullanici ? `<div class="u-text-soft" style="font-size:11.5px; margin-top:6px;">Toplayan: ${kacisEt(u.toplayanKullanici)}</div>` : ""}
    </div>`;
}

function baglaSatirOlaylari(kapsayici, saltOkunur) {
  if (saltOkunur) return;
  kapsayici.querySelectorAll("[data-uid]").forEach((satir) => {
    const uid = satir.dataset.uid;
    const miktarInput = satir.querySelector('[data-rol="miktar"]');
    if (miktarInput) {
      miktarInput.addEventListener("input", debounce(() => {
        urunGuncelle(aktifSiparis.id, uid, { miktar: ondalikOku(miktarInput.value) });
      }, 400));
    }
    const toplandiCb = satir.querySelector('[data-rol="toplandi"]');
    if (toplandiCb) {
      toplandiCb.addEventListener("change", () => {
        const urun = urunlerCache.find((u) => u.id === uid);
        const patch = toplandiCb.checked ? { toplandi: true, eksik: false } : { toplandi: false };
        if (toplandiCb.checked) {
          patch.toplayanKullanici = mevcutKullanici.ad || mevcutKullanici.uid;
          // Stoktan düş — sadece stok kodu varsa
          if (urun?.kod) stokDusur(urun.kod, urun.miktar);
        } else {
          // İşaret kaldırıldı — stoğu geri ekle
          if (urun?.kod && urun?.toplandi) stokGeriEkle(urun.kod, urun.miktar);
        }
        urunGuncelle(aktifSiparis.id, uid, patch);
      });
    }
    const eksikCb = satir.querySelector('[data-rol="eksik"]');
    if (eksikCb) {
      eksikCb.addEventListener("change", () => {
        const patch = eksikCb.checked ? { eksik: true, toplandi: false } : { eksik: false };
        if (eksikCb.checked) patch.toplayanKullanici = mevcutKullanici.ad || mevcutKullanici.uid;
        urunGuncelle(aktifSiparis.id, uid, patch);
      });
    }
    const silBtn = satir.querySelector('[data-rol="sil"]');
    if (silBtn) {
      silBtn.addEventListener("click", async () => {
        const onay = await onayIste({ baslik: "Ürünü Sil", metin: "Bu ürünü siparişten kaldırmak istediğinize emin misiniz?", tehlikeli: true, onayMetni: "Sil" });
        if (onay) { await urunSil(aktifSiparis.id, uid); toast("Ürün silindi.", "info"); }
      });
    }
  });
}

/* ---------------- Mevcut siparişe Excel'den ürün ekle ---------------- */
document.getElementById("excelYukleBtn").addEventListener("click", () => {
  document.getElementById("excelYukleInput").click();
});
document.getElementById("excelYukleInput").addEventListener("change", async (e) => {
  const dosya = e.target.files[0];
  e.target.value = ""; // aynı dosyayı tekrar seçebilmek için sıfırla
  if (!dosya || !aktifSiparis) return;
  yukleniyorGoster("Excel okunuyor ve ürünler ekleniyor…");
  try {
    const satirlar = await excelDosyasiniOku(dosya);
    console.log("[Depomax] Excel'den okunan satır sayısı:", satirlar.length, satirlar[0]);
    const eklenen = await urunleriTopluEkle(aktifSiparis.id, satirlar);
    yukleniyorKapat();
    if (eklenen === 0) {
      toast("Excel okundu fakat hiç ürün eklenemedi. Dosya başlıklarını kontrol edin.", "error", 7000);
    } else {
      toast(`${eklenen} ürün siparişe eklendi.`, "success");
    }
  } catch (err) {
    yukleniyorKapat();
    console.error(err);
    toast("Excel okunurken hata oluştu. Dosya formatını kontrol edin.", "error");
  }
});

/* ---------------- Manuel ürün ekle ---------------- */
document.getElementById("urunEkleBtn").addEventListener("click", () => {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal">
        <h3>Ürün Ekle</h3>
        <div class="input-row">
          <div class="field"><label>Ürün Kodu</label><input class="input" id="ueKod" /></div>
          <div class="field"><label>Ürün Adı</label><input class="input" id="ueAd" /></div>
          <div class="field"><label>Miktar</label><input class="input" type="text" inputmode="decimal" id="ueMiktar" /></div>
          <div class="field"><label>Birim</label><input class="input" id="ueBirim" placeholder="KG, Adet…" /></div>
          <div class="field"><label>Reyon</label><input class="input" id="ueReyon" /></div>
          <div class="field"><label>Barkod</label><input class="input" id="ueBarkod" /></div>
          <div class="field"><label>Açıklama</label><input class="input" id="ueAciklama" /></div>
        </div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="onay">Ekle</button>
        </div>
      </div>
    </div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
  root.querySelector('[data-role="onay"]').onclick = async () => {
    const kod = document.getElementById("ueKod").value.trim();
    const ad = document.getElementById("ueAd").value.trim();
    if (!kod && !ad) { toast("Ürün kodu veya adı girin.", "error"); return; }
    await urunEkle(aktifSiparis.id, {
      kod, ad,
      miktar: ondalikOku(document.getElementById("ueMiktar").value),
      birim: document.getElementById("ueBirim").value.trim(),
      reyon: document.getElementById("ueReyon").value.trim(),
      barkod: document.getElementById("ueBarkod").value.trim(),
      aciklama: document.getElementById("ueAciklama").value.trim()
    });
    kapat();
    toast("Ürün eklendi.", "success");
  };
});

/* ---------------- Barkod tarama ---------------- */
document.getElementById("barkodTaraBtn").addEventListener("click", barkodModalAc);
document.getElementById("tarayiciKapatBtn").addEventListener("click", barkodModalKapat);

async function barkodModalAc() {
  document.getElementById("tarayiciModal").classList.remove("u-hidden");
  tarayici = new BarkodTarayici("scannerView");
  try {
    await tarayici.baslat(barkodOkundu);
  } catch (err) {
    toast("Kamera başlatılamadı. Tarayıcı izinlerini kontrol edin.", "error");
    barkodModalKapat();
  }
}

function barkodModalKapat() {
  if (tarayici) tarayici.durdur();
  document.getElementById("tarayiciModal").classList.add("u-hidden");
}

function barkodOkundu(kod) {
  const urun = urunlerCache.find((u) => u.barkod && u.barkod === kod);
  if (!urun) {
    if (sonBulunamadiBarkod !== kod) {
      sonBulunamadiBarkod = kod;
      sesCal("hata");
      toast(`Barkod bulunamadı: ${kod}`, "error");
      setTimeout(() => { if (sonBulunamadiBarkod === kod) sonBulunamadiBarkod = null; }, 2500);
    }
    return;
  }
  sonBulunamadiBarkod = null;
  sesCal("basari");
  if (tarayici) tarayici.durdur();
  document.getElementById("tarayiciModal").classList.add("u-hidden");
  taramaSonucModalAc(urun);
}

function taramaSonucModalAc(urun) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal">
        <h3>${kacisEt(urun.ad)}</h3>
        <p><span class="reyon-tag">${kacisEt(urun.reyon || "—")}</span> &nbsp; <span class="cell-code">${kacisEt(urun.kod)}</span></p>
        <p class="u-text-soft" style="font-size:13px;">Depo Stok: ${depoStokHucresi(urun.kod)}</p>
        <div class="field">
          <label>Miktar</label>
          <input class="input" type="text" inputmode="decimal" id="tsMiktar" value="${urun.miktar || 0}" />
        </div>
        <div class="modal__actions" style="justify-content:space-between;">
          <button class="btn btn-ghost" data-role="kapat">Kapat</button>
          <div class="u-flex">
            <button class="btn btn-danger" data-role="eksik">⚠ Eksik</button>
            <button class="btn btn-green" data-role="toplandi">✓ Toplandı</button>
          </div>
        </div>
      </div>
    </div>`;
  const devamEt = () => { root.innerHTML = ""; barkodModalAcYenidenBaslat(); };
  root.querySelector('[data-role="kapat"]').onclick = devamEt;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") devamEt(); };
  root.querySelector('[data-role="toplandi"]').onclick = async () => {
    const miktar = ondalikOku(document.getElementById("tsMiktar").value);
    await urunGuncelle(aktifSiparis.id, urun.id, { toplandi: true, eksik: false, miktar, toplayanKullanici: mevcutKullanici.ad || mevcutKullanici.uid });
    // Stoktan düş
    if (urun.kod) stokDusur(urun.kod, miktar);
    toast(`${urun.ad} toplandı. Stok güncellendi.`, "success");
    devamEt();
  };
  root.querySelector('[data-role="eksik"]').onclick = async () => {
    const miktar = ondalikOku(document.getElementById("tsMiktar").value);
    await urunGuncelle(aktifSiparis.id, urun.id, { eksik: true, toplandi: false, miktar, toplayanKullanici: mevcutKullanici.ad || mevcutKullanici.uid });
    toast(`${urun.ad} eksik olarak işaretlendi.`, "info");
    devamEt();
  };
}

async function barkodModalAcYenidenBaslat() {
  // Bir ürün işaretlendikten sonra tarayıcıyı tekrar açar, böylece kullanıcı
  // art arda birden çok ürünü kesintisiz tarayabilir.
  document.getElementById("tarayiciModal").classList.remove("u-hidden");
  tarayici = new BarkodTarayici("scannerView");
  try { await tarayici.baslat(barkodOkundu); } catch (e) { barkodModalKapat(); }
}

/* ---------------- Excel'e aktar ---------------- */
document.getElementById("excelIndirBtn").addEventListener("click", () => {
  const liste = [...urunlerCache].sort((a, b) => reyonKarsilastir(a.reyon, b.reyon));
  const basliklar = ["Ürün Kodu", "Ürün Adı", "Miktar", "Birim", "Reyon", "Açıklama", "Barkod", "Toplandı", "Eksik"];
  const satirlar = liste.map((u) => [u.kod, u.ad, u.miktar || 0, u.birim, u.reyon, u.aciklama, u.barkod, u.toplandi ? "Evet" : "", u.eksik ? "Evet" : ""]);
  const dosyaAdi = `${(aktifSiparis.ad || "siparis").replace(/[^\wçğıöşüÇĞİÖŞÜ\- ]/g, "_")}_toplama.xlsx`;
  excelOlarakIndir(basliklar, satirlar, dosyaAdi);
});

/* ---------------- Toplamayı tamamla ---------------- */
document.getElementById("tamamlaBtn").addEventListener("click", async () => {
  const isaretlenmemis = urunlerCache.filter((u) => !u.toplandi && !u.eksik);
  if (isaretlenmemis.length > 0) {
    toast(`${isaretlenmemis.length} ürün için "Toplandı" veya "Eksik" işaretlenmedi.`, "error");
    return;
  }
  if (urunlerCache.length === 0) {
    toast("Bu siparişte hiç ürün yok.", "error");
    return;
  }
  const onay = await onayIste({
    baslik: "Toplama Tamamlansın mı?",
    metin: "Tamamlandıktan sonra bu sipariş kontrol ekibine gönderilecek ve düzenlenemeyecek.",
    onayMetni: "Tamamla"
  });
  if (!onay) return;
  await siparisGuncelle(aktifSiparis.id, {
    durum: "toplandi",
    toplamaBitis: new Date().toISOString(),
    toplamayiTamamlayan: mevcutKullanici.ad || mevcutKullanici.uid
  });
  toast("Toplama tamamlandı. Sipariş kontrol ekibine iletildi.", "success");
  geriDon();
});

/* ---------------- Barkod tabancası (USB/Bluetooth keyboard wedge) ---------------- */
// Tabancalar barkodu klavye girişi gibi gönderir ve Enter ile bitirir.
document.getElementById("barkodTabancaInput").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const kod = e.target.value.trim();
  e.target.value = "";
  if (!kod || !aktifSiparis) return;
  barkodOkundu(kod);
});

/* ---------------- Gecikme bildirimi ---------------- */
const GECIKME_ESIGI_SAAT = 4; // 4 saatten fazla "toplaniyor"da kalan siparişler
let gecikmeKontrolZamanlayici = null;

function gecikmeleriKontrolEt(liste) {
  const simdi = Date.now();
  const gecikenler = liste.filter((s) => {
    if (s.durum !== "toplaniyor") return false;
    if (!s.olusturulmaTarihi) return false;
    const gec = simdi - s.olusturulmaTarihi.toMillis();
    return gec > GECIKME_ESIGI_SAAT * 3600 * 1000;
  });
  if (gecikenler.length > 0) {
    toast(`⏰ ${gecikenler.length} sipariş ${GECIKME_ESIGI_SAAT} saattir toplanmadı: ${gecikenler.map(s => s.ad).join(", ")}`, "error", 8000);
  }
}

// Her 30 dakikada bir kontrol et
function gecikmeZamanlamasiniBaslat() {
  clearInterval(gecikmeKontrolZamanlayici);
  gecikmeKontrolZamanlayici = setInterval(() => {
    if (sonSiparisListesi.length) gecikmeleriKontrolEt(sonSiparisListesi);
  }, 30 * 60 * 1000);
}
gecikmeZamanlamasiniBaslat();
