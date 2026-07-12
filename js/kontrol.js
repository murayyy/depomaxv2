// ============================================================================
// KONTROL EKRANI MANTIĞI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { siparisleriDinle, siparisGuncelle, urunleriDinle, urunGuncelle, urunEkle, tumSiparisleriCanliDinle, siparisArsivle, suruculeriGetir } from "./veri.js";
import { stoklariDinle, stokRozetiHtml } from "./stok.js";
import { serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  arayuzHazirla, toast, onayIste, girdiIste,
  reyonKarsilastir, excelOlarakIndir, tarihBicimle,
  debounce, BarkodTarayici, kacisEt, kgToplami, sayiBicimle, ondalikOku,
  odakDurumunuKaydet, odakDurumunuGeriYukle, sesCal, siparisGecisleriniTespitEt
} from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;
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
  if (aktifSiparis) renderUrunler(aktifSiparis.durum === "tamamlandi" || aktifSiparis.durum === "sevk_edildi");
});

/* ---------------- Bildirimler: sekme/durum geçişlerini canlı izle ---------------- */
let bilinenSiparisDurumlari = new Map();
let bildirimIlkYukleme = true;
tumSiparisleriCanliDinle((tumListe) => {
  const gecisler = siparisGecisleriniTespitEt(bilinenSiparisDurumlari, tumListe, bildirimIlkYukleme);
  bildirimIlkYukleme = false;
  gecisler.forEach((g) => {
    if (g.yeniDurum === "toplandi" && g.eskiDurum && g.eskiDurum !== "toplandi") {
      sesCal("basari");
      toast(`📦 Sipariş kontrole düştü: ${g.ad}`, "info", 5000);
    } else if (g.yeniDurum === "sevk_edildi" && g.eskiDurum && g.eskiDurum !== "sevk_edildi") {
      sesCal("basari");
      toast(`🚚 Sipariş sevke çevrildi: ${g.ad}`, "success", 5000);
    }
  });
});

/* ---------------- Başlangıç / yetki kontrolü ---------------- */
sayfaKorumasi(["kontrolor"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  if (kullanici.rol === "admin") {
    document.getElementById("topNav").insertAdjacentHTML("beforeend",
      `<a class="topbar__link" href="toplama.html">📦 Toplama</a><a class="topbar__link" href="admin.html">👥 Yönetim</a><a class="topbar__link" href="performans.html">📊 Performans</a>`);
  }
  sekmeYukle("aktif");
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

/* ---------------- Sekmeler ---------------- */
document.querySelectorAll("[data-sekme]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-sekme]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    sekmeYukle(btn.dataset.sekme);
  });
});

let sonSiparisListesi = [];

function sekmeYukle(sekme) {
  if (siparisAbonelikIptal) siparisAbonelikIptal();
  const durumlar = sekme === "aktif" ? ["toplandi", "kontrol_ediliyor"]
    : sekme === "sevkbekleyen" ? ["tamamlandi"]
    : sekme === "arsiv" ? ["arsivlendi"]
    : ["sevk_edildi"];
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
    const kontrolEdilen = s.kontrolEdilenUrun || 0;
    const yuzde = toplam ? Math.round((kontrolEdilen / toplam) * 100) : 0;
    const durumRozeti = s.sistemeAktarildi
      ? '<span class="badge badge-red">Sisteme Aktarıldı</span>'
      : ({
          tamamlandi: '<span class="badge badge-amber">Sevk Bekliyor</span>',
          sevk_edildi: '<span class="badge badge-green">Sevk Edildi</span>',
          arsivlendi: '<span class="badge badge-gray">🗂 Arşiv</span>'
        }[s.durum] || '<span class="badge badge-blue">Kontrol Bekliyor</span>');
    const butonMetni = s.durum === "sevk_edildi" ? "Görüntüle →" : s.durum === "tamamlandi" ? "Sevke Hazırla →" : "Kontrol Et →";
    return `
      <div class="card order-card${s.sistemeAktarildi ? " is-aktarildi" : ""}" data-id="${s.id}">
        <div class="order-card__main">
          <div class="order-card__name">${kacisEt(s.ad)}</div>
          <div class="order-card__meta">
            ${durumRozeti}
            <span>${toplam} ürün</span>
            ${s.toplamKg ? `<span>${sayiBicimle(s.toplamKg)} KG</span>` : ""}
            <span>${s.eksikUrun || 0} eksik bildirildi</span>
            ${s.paletSayisi ? `<span>${s.paletSayisi} palet</span>` : ""}
            <span>${tarihBicimle(s.olusturulmaTarihi)}</span>
          </div>
        </div>
        <div class="order-card__progress">
          <div class="progress-bar"><div class="progress-bar__fill" style="width:${yuzde}%"></div></div>
          <div class="progress-label">${kontrolEdilen}/${toplam} kontrol edildi</div>
        </div>
        <div class="order-card__actions">
          <button class="btn btn-primary btn-sm" data-ac="${s.id}">${butonMetni}</button>
          ${s.durum === "sevk_edildi" && s.sistemeAktarildi ? `<button class="btn btn-ghost btn-sm" data-arsivle="${s.id}">🗂 Arşivle</button>` : ""}
        </div>
      </div>`;
  }).join("");

  kapsayici.querySelectorAll("[data-ac]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const siparis = liste.find((s) => s.id === btn.dataset.ac);
      siparisAc(siparis);
    });
  });

  kapsayici.querySelectorAll("[data-arsivle]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const onay = await onayIste({
        baslik: "Arşivle",
        metin: "Bu sipariş arşive taşınacak ve listeden kalkacak. İstediğinizde arşivden tekrar görüntüleyebilirsiniz.",
        onayMetni: "Arşivle"
      });
      if (!onay) return;
      await siparisArsivle(btn.dataset.arsivle);
      toast("Sipariş arşive taşındı.", "success");
    });
  });
}

/* ---------------- Sipariş detayı ---------------- */
function siparisAc(siparis) {
  aktifSiparis = siparis;
  document.getElementById("listeGorunumu").classList.add("u-hidden");
  document.getElementById("detayGorunumu").classList.remove("u-hidden");
  document.getElementById("detaySiparisAdi").textContent = siparis.ad;
  document.getElementById("detaySiparisAdi").insertAdjacentHTML("beforeend",
    `${siparis.paletSayisi ? ` <span class="badge badge-blue">${siparis.paletSayisi} Palet</span>` : ""}` +
    `${siparis.sistemeAktarildi ? ` <span class="badge badge-red">Sisteme Aktarıldı</span>` : ""}`);

  const saltOkunur = siparis.durum === "tamamlandi" || siparis.durum === "sevk_edildi";
  document.getElementById("tamamlaBtn").classList.toggle("u-hidden", siparis.durum !== "toplandi" && siparis.durum !== "kontrol_ediliyor");
  document.getElementById("sevkeCevirBtn").classList.toggle("u-hidden", siparis.durum !== "tamamlandi");
  document.getElementById("sistemeAktarBtn").classList.toggle("u-hidden", siparis.durum !== "sevk_edildi");
  document.getElementById("barkodTaraBtn").classList.toggle("u-hidden", saltOkunur);
  document.getElementById("urunEkleBtn").classList.toggle("u-hidden", saltOkunur);

  if (urunAbonelikIptal) urunAbonelikIptal();
  urunAbonelikIptal = urunleriDinle(siparis.id, (liste) => {
    urunlerCache = liste;
    const kontrolEdilen = liste.filter((u) => u.kontrol || u.eksik).length;
    const toplamKg = kgToplami(liste);
    if (siparis.durum !== "tamamlandi" && siparis.durum !== "sevk_edildi" && (kontrolEdilen !== siparis.kontrolEdilenUrun || toplamKg !== siparis.toplamKg)) {
      siparis.kontrolEdilenUrun = kontrolEdilen;
      siparis.toplamKg = toplamKg;
      clearTimeout(sayacYazimZamanlayici);
      sayacYazimZamanlayici = setTimeout(() => {
        siparisGuncelle(siparis.id, { kontrolEdilenUrun: kontrolEdilen, toplamKg });
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

/* ---------------- Ürün listesi render ---------------- */
document.getElementById("aramaKutusu").addEventListener("input", debounce((e) => {
  aramaMetni = e.target.value.trim().toLowerCase();
  renderUrunler(aktifSiparis && aktifSiparis.durum === "tamamlandi");
}, 200));

function siraliListe() {
  // Toplanan ürünler önce (reyon sırasıyla), eksik bildirilenler en altta —
  // kontrol ekibi önce elindeki ürünleri saysın, eksikleri ayrıca değerlendirsin.
  const toplananlar = urunlerCache.filter((u) => !u.eksik).sort((a, b) => reyonKarsilastir(a.reyon, b.reyon));
  const eksikler = urunlerCache.filter((u) => u.eksik).sort((a, b) => reyonKarsilastir(a.reyon, b.reyon));
  return [...toplananlar, ...eksikler];
}

function renderUrunler(saltOkunur) {
  let liste = siraliListe();
  if (aramaMetni) {
    liste = liste.filter((u) =>
      (u.ad || "").toLowerCase().includes(aramaMetni) ||
      (u.kod || "").toLowerCase().includes(aramaMetni) ||
      (u.reyon || "").toLowerCase().includes(aramaMetni) ||
      (u.barkod || "").toLowerCase().includes(aramaMetni)
    );
  }

  const toplam = urunlerCache.length;
  const kontrolEdilen = urunlerCache.filter((u) => u.kontrol || u.eksik).length;
  const yuzde = toplam ? Math.round((kontrolEdilen / toplam) * 100) : 0;
  document.getElementById("detayIlerlemeYazi").textContent = `${kontrolEdilen}/${toplam} ürün kontrol edildi`;
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

function toplamaDurumRozeti(u) {
  if (u.eksik) return '<span class="badge badge-red">Eksik</span>';
  if (u.toplandi) return '<span class="badge badge-green">Toplandı</span>';
  return '<span class="badge badge-gray">İşaretsiz</span>';
}

function durumSinifi(u) {
  if (u.kontrol) return "row-checked";
  if (u.eksik) return "row-missing";
  if (u.toplandi) return "row-done";
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

function satirHtml(u, saltOkunur) {
  return `
    <tr class="${durumSinifi(u)}" data-uid="${u.id}">
      <td class="cell-code">${kacisEt(u.kod)}</td>
      <td>${kacisEt(u.ad)}</td>
      <td><input type="text" inputmode="decimal" class="cell-qty-input" data-rol="miktar" value="${u.miktar || 0}" ${saltOkunur ? "disabled" : ""} /></td>
      <td>${kacisEt(u.birim || "—")}</td>
      <td>${depoStokHucresi(u.kod)}</td>
      <td><span class="reyon-tag">${kacisEt(u.reyon || "—")}</span></td>
      <td>${kacisEt(u.aciklama || "—")}</td>
      <td class="cell-code">${kacisEt(u.barkod)}</td>
      <td><input type="checkbox" class="checkbox-lg" data-rol="toplandi" ${u.toplandi ? "checked" : ""} ${saltOkunur ? "disabled" : ""} /></td>
      <td><input type="checkbox" class="checkbox-lg" data-rol="eksik" ${u.eksik ? "checked" : ""} ${saltOkunur ? "disabled" : ""} /></td>
      <td class="u-text-soft" style="font-size:12px;">${kacisEt(u.toplayanKullanici || "—")}</td>
      <td><input class="input" data-rol="not" value="${kacisEt(u.kontrolNotu || "")}" placeholder="—" ${saltOkunur ? "disabled" : ""} style="min-width:120px;" /></td>
      <td><input type="checkbox" class="checkbox-lg cb-blue" data-rol="kontrol" ${u.kontrol ? "checked" : ""} ${saltOkunur ? "disabled" : ""} /></td>
      <td class="u-text-soft" style="font-size:12px;">${kacisEt(u.kontrolEdenKullanici || "—")}</td>
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
        <div><div class="row-card__label">Birim</div>${kacisEt(u.birim || "—")}</div>
        <div><div class="row-card__label">Depo Stok</div>${depoStokHucresi(u.kod)}</div>
        <div><div class="row-card__label">Açıklama</div>${kacisEt(u.aciklama || "—")}</div>
      </div>
      <div class="field" style="margin-top:8px;">
        <label class="row-card__label">Not</label>
        <input class="input" data-rol="not" value="${kacisEt(u.kontrolNotu || "")}" placeholder="Varsa not ekleyin" ${saltOkunur ? "disabled" : ""} />
      </div>
      <div class="row-card__actions">
        <label class="row-card__action"><input type="checkbox" class="checkbox-lg" data-rol="toplandi" ${u.toplandi ? "checked" : ""} ${saltOkunur ? "disabled" : ""} /> Toplandı</label>
        <label class="row-card__action"><input type="checkbox" class="checkbox-lg" data-rol="eksik" ${u.eksik ? "checked" : ""} ${saltOkunur ? "disabled" : ""} /> Eksik</label>
        <label class="row-card__action"><input type="checkbox" class="checkbox-lg cb-blue" data-rol="kontrol" ${u.kontrol ? "checked" : ""} ${saltOkunur ? "disabled" : ""} /> Kontrol Edildi</label>
      </div>
      <div class="u-text-soft" style="font-size:11.5px; margin-top:6px; display:flex; gap:12px; flex-wrap:wrap;">
        ${u.toplayanKullanici ? `<span>Toplayan: ${kacisEt(u.toplayanKullanici)}</span>` : ""}
        ${u.kontrolEdenKullanici ? `<span>Kontrol: ${kacisEt(u.kontrolEdenKullanici)}</span>` : ""}
      </div>
    </div>`;
}

function baglaSatirOlaylari(kapsayici, saltOkunur) {
  if (saltOkunur) return;
  kapsayici.querySelectorAll("[data-uid]").forEach((satir) => {
    const uid = satir.dataset.uid;

    const miktarInput = satir.querySelector('[data-rol="miktar"]');
    if (miktarInput) {
      miktarInput.addEventListener("input", debounce(() => {
        const urun = urunlerCache.find((u) => u.id === uid);
        const yeniMiktar = ondalikOku(miktarInput.value);
        const patch = { miktar: yeniMiktar };
        if (urun && urun.miktar !== yeniMiktar && urun.toplayanKullanici) {
          patch.orijinalMiktar = urun.orijinalMiktar ?? urun.miktar;
          patch.miktarDuzeltildi = true;
          patch.miktarDuzeltenKullanici = mevcutKullanici.ad || mevcutKullanici.uid;
        }
        urunGuncelle(aktifSiparis.id, uid, patch);
      }, 400));
    }
    const toplandiCb = satir.querySelector('[data-rol="toplandi"]');
    if (toplandiCb) {
      toplandiCb.addEventListener("change", () => {
        const urun = urunlerCache.find((u) => u.id === uid);
        const eskiEksikti = urun && urun.eksik;
        const patch = toplandiCb.checked ? { toplandi: true, eksik: false } : { toplandi: false };
        if (toplandiCb.checked) {
          patch.toplayanKullanici = mevcutKullanici.ad || mevcutKullanici.uid;
          if (eskiEksikti) {
            patch.duzeltildi = true;
            patch.duzeltenkKullanici = mevcutKullanici.ad || mevcutKullanici.uid;
          }
        } else {
          patch.duzeltildi = false;
        }
        urunGuncelle(aktifSiparis.id, uid, patch);
      });
    }
    const eksikCb = satir.querySelector('[data-rol="eksik"]');
    if (eksikCb) {
      eksikCb.addEventListener("change", () => {
        const urun = urunlerCache.find((u) => u.id === uid);
        const eskiToplandiydi = urun && urun.toplandi;
        const patch = eksikCb.checked ? { eksik: true, toplandi: false } : { eksik: false };
        if (eksikCb.checked) {
          patch.toplayanKullanici = mevcutKullanici.ad || mevcutKullanici.uid;
          if (eskiToplandiydi) {
            // Toplayıcı "toplandı" demişti ama kontrolör "eksik" buldu — kontrolör tespiti
            patch.kontrolorEksikTespiti = true;
            patch.kontrolorEksikTespitiKullanici = mevcutKullanici.ad || mevcutKullanici.uid;
          }
        } else {
          patch.kontrolorEksikTespiti = false;
        }
        urunGuncelle(aktifSiparis.id, uid, patch);
      });
    }
    const kontrolCb = satir.querySelector('[data-rol="kontrol"]');
    if (kontrolCb) {
      kontrolCb.addEventListener("change", async () => {
        const patch = { kontrol: kontrolCb.checked };
        if (kontrolCb.checked) patch.kontrolEdenKullanici = mevcutKullanici.ad || mevcutKullanici.uid;
        await urunGuncelle(aktifSiparis.id, uid, patch);
        if (aktifSiparis.durum === "toplandi") {
          aktifSiparis.durum = "kontrol_ediliyor";
          siparisGuncelle(aktifSiparis.id, { durum: "kontrol_ediliyor", kontrolBaslangic: new Date().toISOString(), kontrolBaşlayan: mevcutKullanici.ad || mevcutKullanici.uid });
        }
      });
    }
    const notInput = satir.querySelector('[data-rol="not"]');
    if (notInput) {
      notInput.addEventListener("input", debounce(() => {
        urunGuncelle(aktifSiparis.id, uid, { kontrolNotu: notInput.value });
      }, 500));
    }
  });
}

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
        <p><span class="reyon-tag">${kacisEt(urun.reyon || "—")}</span> &nbsp; ${toplamaDurumRozeti(urun)}</p>
        <p class="u-text-soft" style="font-size:13px;">Depo Stok: ${depoStokHucresi(urun.kod)}</p>
        <div class="field">
          <label>Not (opsiyonel)</label>
          <input class="input" id="tsNot" value="${kacisEt(urun.kontrolNotu || "")}" placeholder="Uyuşmazlık varsa not girin" />
        </div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="kapat">Kapat</button>
          <button class="btn btn-blue" data-role="onayla">✓ Kontrol Edildi İşaretle</button>
        </div>
      </div>
    </div>`;
  const devamEt = () => { root.innerHTML = ""; barkodModalAcYenidenBaslat(); };
  root.querySelector('[data-role="kapat"]').onclick = devamEt;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") devamEt(); };
  root.querySelector('[data-role="onayla"]').onclick = async () => {
    const not = document.getElementById("tsNot").value.trim();
    await urunGuncelle(aktifSiparis.id, urun.id, { kontrol: true, kontrolNotu: not, kontrolEdenKullanici: mevcutKullanici.ad || mevcutKullanici.uid });
    if (aktifSiparis.durum === "toplandi") {
      aktifSiparis.durum = "kontrol_ediliyor";
      siparisGuncelle(aktifSiparis.id, { durum: "kontrol_ediliyor", kontrolBaslangic: new Date().toISOString(), kontrolBaşlayan: mevcutKullanici.ad || mevcutKullanici.uid });
    }
    toast(`${urun.ad} kontrol edildi.`, "success");
    devamEt();
  };
}

async function barkodModalAcYenidenBaslat() {
  document.getElementById("tarayiciModal").classList.remove("u-hidden");
  tarayici = new BarkodTarayici("scannerView");
  try { await tarayici.baslat(barkodOkundu); } catch (e) { barkodModalKapat(); }
}

/* ---------------- Excel'e aktar ---------------- */
document.getElementById("excelIndirBtn").addEventListener("click", () => {
  const liste = siraliListe();
  const basliklar = ["Ürün Kodu", "Ürün Adı", "Miktar", "Birim", "Reyon", "Barkod", "Toplandı", "Eksik", "Kontrol", "Not"];
  const satirlar = liste.map((u) => [
    u.kod, u.ad, u.miktar || 0, u.birim, u.reyon, u.barkod,
    u.toplandi ? "Evet" : "", u.eksik ? "Evet" : "", u.kontrol ? "Evet" : "", u.kontrolNotu || ""
  ]);
  const dosyaAdi = `${(aktifSiparis.ad || "siparis").replace(/[^\wçğıöşüÇĞİÖŞÜ\- ]/g, "_")}_kontrol_tamam.xlsx`;
  excelOlarakIndir(basliklar, satirlar, dosyaAdi);
});

/* ---------------- Kontrolü tamamla ---------------- */
document.getElementById("tamamlaBtn").addEventListener("click", async () => {
  const kontrolEdilmemis = urunlerCache.filter((u) => !u.kontrol && !u.eksik);
  if (kontrolEdilmemis.length > 0) {
    toast(`${kontrolEdilmemis.length} ürün henüz kontrol edilmedi.`, "error");
    return;
  }
  if (urunlerCache.length === 0) {
    toast("Bu siparişte hiç ürün yok.", "error");
    return;
  }
  const onay = await onayIste({
    baslik: "Kontrol Tamamlansın mı?",
    metin: "Sipariş 'Sevk Bekleyen' kısmına taşınacak. Orada sevke çevirene kadar eksik ürünler için işlem yapabilirsiniz.",
    onayMetni: "Tamamla"
  });
  if (!onay) return;
  await siparisGuncelle(aktifSiparis.id, {
    durum: "tamamlandi",
    kontrolBitis: new Date().toISOString(),
    kontrolTamamlayan: mevcutKullanici.ad || mevcutKullanici.uid
  });
  toast("Kontrol tamamlandı. Sipariş sevk bekleyene taşındı.", "success");
  geriDon();
});

/* ---------------- Kontrol ekranında manuel ürün ekleme ---------------- */
document.getElementById("urunEkleBtn").addEventListener("click", () => {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal">
        <h3>Ürün Ekle</h3>
        <p>Toplama sırasında atlanmış bir ürünü buradan ekleyebilirsiniz.</p>
        <div class="input-row">
          <div class="field"><label>Ürün Kodu</label><input class="input" id="keKod" /></div>
          <div class="field"><label>Ürün Adı</label><input class="input" id="keAd" /></div>
          <div class="field"><label>Miktar</label><input class="input" type="text" inputmode="decimal" id="keMiktar" /></div>
          <div class="field"><label>Birim</label><input class="input" id="keBirim" placeholder="KG, Adet…" /></div>
          <div class="field"><label>Reyon</label><input class="input" id="keReyon" /></div>
          <div class="field"><label>Barkod</label><input class="input" id="keBarkod" /></div>
          <div class="field"><label>Açıklama</label><input class="input" id="keAciklama" /></div>
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
    const kod = document.getElementById("keKod").value.trim();
    const ad = document.getElementById("keAd").value.trim();
    if (!kod && !ad) { toast("Ürün kodu veya adı girin.", "error"); return; }
    try {
      await urunEkle(aktifSiparis.id, {
        kod, ad,
        miktar: ondalikOku(document.getElementById("keMiktar").value),
        birim: document.getElementById("keBirim").value.trim(),
        reyon: document.getElementById("keReyon").value.trim(),
        barkod: document.getElementById("keBarkod").value.trim(),
        aciklama: document.getElementById("keAciklama").value.trim()
      });
      kapat();
      toast("Ürün eklendi.", "success");
    } catch (err) {
      console.error(err);
      toast("Ürün eklenirken hata oluştu: " + (err.message || err), "error");
    }
  };
});

/* ---------------- Sevke çevir (palet sayısı sorar) ---------------- */
document.getElementById("sevkeCevirBtn").addEventListener("click", async () => {
  // Sürücüleri yükle
  let surucular = [];
  try { surucular = await suruculeriGetir(); } catch (e) { console.error(e); }

  const surucuOptions = surucular.length
    ? surucular.map((s) => `<option value="${s.uid}" data-plaka="${kacisEt(s.plaka || "")}" data-ad="${kacisEt(s.ad || "")}">${kacisEt(s.ad)}${s.plaka ? " — " + s.plaka : ""}</option>`).join("")
    : `<option value="">— Sürücü yok, önce admin'den ekleyin —</option>`;

  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal">
        <h3>🚚 Sevke Çevir</h3>
        <p>Sipariş sevk edildi olarak işaretlenecek ve artık düzenlenemeyecek.</p>
        <div class="field">
          <label>Palet Sayısı</label>
          <input class="input" type="number" id="scPalet" placeholder="Örn. 4" min="0" />
        </div>
        <div class="field">
          <label>Sürücü</label>
          <select class="select" id="scSurucu">
            <option value="">— Sürücü seç (isteğe bağlı) —</option>
            ${surucuOptions}
          </select>
        </div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="onayla">Sevke Çevir</button>
        </div>
      </div>
    </div>`;

  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => {
    if (e.target.dataset.role === "backdrop") kapat();
  };
  root.querySelector('[data-role="onayla"]').onclick = async () => {
    const palet = ondalikOku(document.getElementById("scPalet").value) || 0;
    const surucuSec = document.getElementById("scSurucu");
    const surucuUid = surucuSec.value;
    const surucuOpt = surucuSec.options[surucuSec.selectedIndex];
    const surucuAd = surucuOpt?.dataset?.ad || "";
    const plaka = surucuOpt?.dataset?.plaka || "";

    // Şubenin adres/koordinatlarını kullanıcı verisinden al
    let adres = "", telefon = "", lat = null, lng = null;
    if (aktifSiparis.subeId) {
      try {
        const { db } = await import("./firebase.js");
        const { getDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        const snap = await getDoc(fsDoc(db, "kullanicilar", aktifSiparis.subeId));
        if (snap.exists()) {
          const d = snap.data();
          adres = d.adres || ""; telefon = d.telefon || "";
          lat = d.lat || null; lng = d.lng || null;
        }
      } catch (e) { console.warn("Şube verisi alınamadı:", e); }
    }

    await siparisGuncelle(aktifSiparis.id, {
      durum: "sevk_edildi",
      paletSayisi: palet,
      sevkTarihi: serverTimestamp(),
      sevkEden: mevcutKullanici ? (mevcutKullanici.ad || mevcutKullanici.uid) : "",
      ...(surucuUid ? { surucuUid, surucuAd, plaka } : {}),
      ...(adres ? { adres } : {}),
      ...(telefon ? { telefon } : {}),
      ...(lat ? { lat, lng } : {})
    });
    kapat();
    toast("Sipariş sevk edildi olarak işaretlendi.", "success");
    geriDon();
  };
});

/* ---------------- Sisteme aktar (kod,miktar CSV) ---------------- */
document.getElementById("sistemeAktarBtn").addEventListener("click", async () => {
  const toplananlar = urunlerCache
    .filter((u) => u.toplandi && u.kod)
    .slice()
    .sort((a, b) => String(a.kod).localeCompare(String(b.kod)));
  if (toplananlar.length === 0) {
    toast("Aktarılacak toplanmış ürün bulunamadı.", "error");
    return;
  }
  // Not: Türkçe Windows/Excel ayarlarında CSV ayracı virgül değil noktalı
  // virgüldür; ondalık ayracı da nokta değil virgüldür ("12.5" değil "12,5").
  const satirlar = toplananlar.map((u) => {
    const miktarMetni = String(u.miktar || 0).replace(".", ",");
    return `="${u.kod}";${miktarMetni}`;
  });
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + satirlar.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const paletEki = aktifSiparis.paletSayisi ? `_${aktifSiparis.paletSayisi}Palet` : "";
  a.download = `${(aktifSiparis.ad || "siparis").replace(/[^\wçğıöşüÇĞİÖŞÜ\- ]/g, "_")}${paletEki}_sisteme_aktar.csv`;
  a.click();

  await siparisGuncelle(aktifSiparis.id, { sistemeAktarildi: true, sistemeAktarTarihi: serverTimestamp() });
  toast("CSV dosyası indirildi ve sipariş 'Sisteme Aktarıldı' işaretlendi.", "success");
  // Sevk Edildi sekmesinde kal
  document.querySelectorAll("[data-sekme]").forEach((b) => b.classList.remove("is-active"));
  document.querySelector('[data-sekme="sevkedildi"]').classList.add("is-active");
  sekmeYukle("sevkedildi");
  document.getElementById("detayGorunumu").classList.add("u-hidden");
  document.getElementById("listeGorunumu").classList.remove("u-hidden");
  aktifSiparis = null; urunlerCache = [];
});

/* ---------------- Barkod tabancası ---------------- */
document.getElementById("barkodTabancaInput").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const kod = e.target.value.trim();
  e.target.value = "";
  if (!kod || !aktifSiparis) return;
  barkodOkundu(kod);
});
