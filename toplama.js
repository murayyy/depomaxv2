// ============================================================================
// TOPLAMA EKRANI MANTIĞI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import {
  siparisleriDinle, siparisOlustur, siparisGuncelle,
  urunleriDinle, urunleriTopluEkle, urunEkle, urunGuncelle, urunSil
} from "./veri.js";
import {
  arayuzHazirla, toast, onayIste, yukleniyorGoster, yukleniyorKapat,
  reyonKarsilastir, excelDosyasiniOku, excelOlarakIndir, tarihBicimle,
  debounce, BarkodTarayici, kacisEt
} from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;
let aktifSekme = "aktif";
let siparisAbonelikIptal = null;
let urunAbonelikIptal = null;
let aktifSiparis = null;
let urunlerCache = [];
let aramaMetni = "";
let tarayici = null;
let sonBulunamadiBarkod = null;

/* ---------------- Başlangıç / yetki kontrolü ---------------- */
sayfaKorumasi(["toplayici"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  if (kullanici.rol === "admin") {
    document.getElementById("topNav").insertAdjacentHTML("beforeend",
      `<a class="topbar__link" href="kontrol.html">✅ Kontrol</a>`);
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

function sekmeYukle(sekme) {
  aktifSekme = sekme;
  if (siparisAbonelikIptal) siparisAbonelikIptal();
  const durumlar = sekme === "aktif" ? ["toplaniyor"] : ["toplandi", "kontrol_ediliyor", "tamamlandi"];
  siparisAbonelikIptal = siparisleriDinle(durumlar, renderSiparisListesi);
}

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
      tamamlandi: '<span class="badge badge-green">Tamamlandı</span>'
    }[s.durum] || "";
    return `
      <div class="card order-card" data-id="${s.id}">
        <div class="order-card__main">
          <div class="order-card__name">${kacisEt(s.ad)}</div>
          <div class="order-card__meta">
            ${durumRozeti}
            <span>${toplam} ürün</span>
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
    if (!ad) { toast("Lütfen sipariş için bir ad girin.", "error"); return; }
    kapat();
    yukleniyorGoster("Sipariş oluşturuluyor…");
    try {
      const siparisId = await siparisOlustur({ ad, olusturan: mevcutKullanici.uid });
      let toplamUrun = 0;
      if (dosya) {
        yukleniyorGoster("Excel okunuyor ve yükleniyor…");
        const satirlar = await excelDosyasiniOku(dosya);
        toplamUrun = await urunleriTopluEkle(siparisId, satirlar);
      }
      yukleniyorKapat();
      toast("Sipariş oluşturuldu.", "success");
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
    if (siparis.durum === "toplaniyor" &&
        (toplanan !== siparis.toplananUrun || eksik !== siparis.eksikUrun || liste.length !== siparis.toplamUrun)) {
      siparis.toplananUrun = toplanan;
      siparis.eksikUrun = eksik;
      siparis.toplamUrun = liste.length;
      siparisGuncelle(siparis.id, { toplananUrun: toplanan, eksikUrun: eksik, toplamUrun: liste.length });
    }
    renderUrunler(saltOkunur);
  });
}

document.getElementById("geriBtn").addEventListener("click", geriDon);
function geriDon() {
  if (urunAbonelikIptal) { urunAbonelikIptal(); urunAbonelikIptal = null; }
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

  document.getElementById("detayBosDurum").classList.toggle("u-hidden", urunlerCache.length !== 0);

  const tbody = document.getElementById("urunTabloGovde");
  const kartGovde = document.getElementById("urunKartGovde");

  if (liste.length === 0) { tbody.innerHTML = ""; kartGovde.innerHTML = ""; return; }

  tbody.innerHTML = liste.map((u) => satirHtml(u, saltOkunur)).join("");
  kartGovde.innerHTML = liste.map((u) => kartHtml(u, saltOkunur)).join("");

  baglaSatirOlaylari(tbody, saltOkunur);
  baglaSatirOlaylari(kartGovde, saltOkunur);
}

function durumSinifi(u) {
  if (u.toplandi) return "row-done";
  if (u.eksik) return "row-missing";
  return "";
}

function satirHtml(u, saltOkunur) {
  return `
    <tr class="${durumSinifi(u)}" data-uid="${u.id}">
      <td class="cell-code">${kacisEt(u.kod)}</td>
      <td>${kacisEt(u.ad)}</td>
      <td><input type="number" class="cell-qty-input" data-rol="miktar" value="${u.miktar || 0}" ${saltOkunur ? "disabled" : ""} /></td>
      <td>${kacisEt(u.birim || "—")}</td>
      <td><span class="reyon-tag">${kacisEt(u.reyon || "—")}</span></td>
      <td>${kacisEt(u.aciklama)}</td>
      <td class="cell-code">${kacisEt(u.barkod)}</td>
      <td><input type="checkbox" class="checkbox-lg" data-rol="toplandi" ${u.toplandi ? "checked" : ""} ${saltOkunur ? "disabled" : ""} /></td>
      <td><input type="checkbox" class="checkbox-lg" data-rol="eksik" ${u.eksik ? "checked" : ""} ${saltOkunur ? "disabled" : ""} /></td>
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
        <div><div class="row-card__label">Miktar</div><input type="number" class="cell-qty-input" data-rol="miktar" value="${u.miktar || 0}" ${saltOkunur ? "disabled" : ""} /></div>
        <div><div class="row-card__label">Birim</div>${kacisEt(u.birim || "—")}</div>
        <div><div class="row-card__label">Açıklama</div>${kacisEt(u.aciklama) || "—"}</div>
      </div>
      <div class="row-card__actions">
        <label class="row-card__action"><input type="checkbox" class="checkbox-lg" data-rol="toplandi" ${u.toplandi ? "checked" : ""} ${saltOkunur ? "disabled" : ""} /> Toplandı</label>
        <label class="row-card__action"><input type="checkbox" class="checkbox-lg" data-rol="eksik" ${u.eksik ? "checked" : ""} ${saltOkunur ? "disabled" : ""} /> Eksik</label>
        ${saltOkunur ? "" : `<button class="btn btn-danger btn-sm" data-rol="sil">Sil</button>`}
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
        urunGuncelle(aktifSiparis.id, uid, { miktar: parseInt(miktarInput.value, 10) || 0 });
      }, 400));
    }
    const toplandiCb = satir.querySelector('[data-rol="toplandi"]');
    if (toplandiCb) {
      toplandiCb.addEventListener("change", () => {
        urunGuncelle(aktifSiparis.id, uid, toplandiCb.checked ? { toplandi: true, eksik: false } : { toplandi: false });
      });
    }
    const eksikCb = satir.querySelector('[data-rol="eksik"]');
    if (eksikCb) {
      eksikCb.addEventListener("change", () => {
        urunGuncelle(aktifSiparis.id, uid, eksikCb.checked ? { eksik: true, toplandi: false } : { eksik: false });
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
    const eklenen = await urunleriTopluEkle(aktifSiparis.id, satirlar);
    yukleniyorKapat();
    toast(`${eklenen} ürün siparişe eklendi.`, "success");
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
          <div class="field"><label>Miktar</label><input class="input" type="number" id="ueMiktar" /></div>
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
      miktar: parseInt(document.getElementById("ueMiktar").value, 10) || 0,
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
      toast(`Barkod bulunamadı: ${kod}`, "error");
      setTimeout(() => { if (sonBulunamadiBarkod === kod) sonBulunamadiBarkod = null; }, 2500);
    }
    return;
  }
  sonBulunamadiBarkod = null;
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
        <div class="field">
          <label>Miktar</label>
          <input class="input" type="number" id="tsMiktar" value="${urun.miktar || 0}" />
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
    const miktar = parseInt(document.getElementById("tsMiktar").value, 10) || 0;
    await urunGuncelle(aktifSiparis.id, urun.id, { toplandi: true, eksik: false, miktar });
    toast(`${urun.ad} toplandı olarak işaretlendi.`, "success");
    devamEt();
  };
  root.querySelector('[data-role="eksik"]').onclick = async () => {
    const miktar = parseInt(document.getElementById("tsMiktar").value, 10) || 0;
    await urunGuncelle(aktifSiparis.id, urun.id, { eksik: true, toplandi: false, miktar });
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
  await siparisGuncelle(aktifSiparis.id, { durum: "toplandi" });
  toast("Toplama tamamlandı. Sipariş kontrol ekibine iletildi.", "success");
  geriDon();
});
