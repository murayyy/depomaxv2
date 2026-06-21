// ============================================================================
// KONTROL EKRANI MANTIĞI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { siparisleriDinle, siparisGuncelle, urunleriDinle, urunGuncelle } from "./veri.js";
import {
  arayuzHazirla, toast, onayIste,
  reyonKarsilastir, excelOlarakIndir, tarihBicimle,
  debounce, BarkodTarayici, kacisEt, kgToplami, sayiBicimle
} from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;
let siparisAbonelikIptal = null;
let urunAbonelikIptal = null;
let aktifSiparis = null;
let urunlerCache = [];
let aramaMetni = "";
let tarayici = null;
let sonBulunamadiBarkod = null;

/* ---------------- Başlangıç / yetki kontrolü ---------------- */
sayfaKorumasi(["kontrolor"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  if (kullanici.rol === "admin") {
    document.getElementById("topNav").insertAdjacentHTML("beforeend",
      `<a class="topbar__link" href="toplama.html">📦 Toplama</a><a class="topbar__link" href="admin.html">👥 Yönetim</a>`);
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
  const durumlar = sekme === "aktif" ? ["toplandi", "kontrol_ediliyor"] : ["tamamlandi"];
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
    const durumRozeti = s.durum === "tamamlandi"
      ? '<span class="badge badge-green">Tamamlandı</span>'
      : '<span class="badge badge-blue">Kontrol Bekliyor</span>';
    return `
      <div class="card order-card" data-id="${s.id}">
        <div class="order-card__main">
          <div class="order-card__name">${kacisEt(s.ad)}</div>
          <div class="order-card__meta">
            ${durumRozeti}
            <span>${toplam} ürün</span>
            ${s.toplamKg ? `<span>${sayiBicimle(s.toplamKg)} KG</span>` : ""}
            <span>${s.eksikUrun || 0} eksik bildirildi</span>
            <span>${tarihBicimle(s.olusturulmaTarihi)}</span>
          </div>
        </div>
        <div class="order-card__progress">
          <div class="progress-bar"><div class="progress-bar__fill" style="width:${yuzde}%"></div></div>
          <div class="progress-label">${kontrolEdilen}/${toplam} kontrol edildi</div>
        </div>
        <div class="order-card__actions">
          <button class="btn btn-primary btn-sm" data-ac="${s.id}">${s.durum === "tamamlandi" ? "Görüntüle →" : "Kontrol Et →"}</button>
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

/* ---------------- Sipariş detayı ---------------- */
function siparisAc(siparis) {
  aktifSiparis = siparis;
  document.getElementById("listeGorunumu").classList.add("u-hidden");
  document.getElementById("detayGorunumu").classList.remove("u-hidden");
  document.getElementById("detaySiparisAdi").textContent = siparis.ad;

  const saltOkunur = siparis.durum === "tamamlandi";
  document.getElementById("tamamlaBtn").classList.toggle("u-hidden", saltOkunur);
  document.getElementById("barkodTaraBtn").classList.toggle("u-hidden", saltOkunur);

  if (urunAbonelikIptal) urunAbonelikIptal();
  urunAbonelikIptal = urunleriDinle(siparis.id, (liste) => {
    urunlerCache = liste;
    const kontrolEdilen = liste.filter((u) => u.kontrol || u.eksik).length;
    const toplamKg = kgToplami(liste);
    if (siparis.durum !== "tamamlandi" && (kontrolEdilen !== siparis.kontrolEdilenUrun || toplamKg !== siparis.toplamKg)) {
      siparis.kontrolEdilenUrun = kontrolEdilen;
      siparis.toplamKg = toplamKg;
      siparisGuncelle(siparis.id, { kontrolEdilenUrun: kontrolEdilen, toplamKg });
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

  tbody.innerHTML = liste.map((u) => satirHtml(u, saltOkunur)).join("");
  kartGovde.innerHTML = liste.map((u) => kartHtml(u, saltOkunur)).join("");
  baglaSatirOlaylari(tbody, saltOkunur);
  baglaSatirOlaylari(kartGovde, saltOkunur);
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

function satirHtml(u, saltOkunur) {
  return `
    <tr class="${durumSinifi(u)}" data-uid="${u.id}">
      <td class="cell-code">${kacisEt(u.kod)}</td>
      <td>${kacisEt(u.ad)}</td>
      <td><input type="number" class="cell-qty-input" data-rol="miktar" value="${u.miktar || 0}" ${saltOkunur ? "disabled" : ""} /></td>
      <td>${kacisEt(u.birim || "—")}</td>
      <td><span class="reyon-tag">${kacisEt(u.reyon || "—")}</span></td>
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
        <div><div class="row-card__label">Miktar</div><input type="number" class="cell-qty-input" data-rol="miktar" value="${u.miktar || 0}" ${saltOkunur ? "disabled" : ""} /></div>
        <div><div class="row-card__label">Birim</div>${kacisEt(u.birim || "—")}</div>
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
        urunGuncelle(aktifSiparis.id, uid, { miktar: parseInt(miktarInput.value, 10) || 0 });
      }, 400));
    }
    const toplandiCb = satir.querySelector('[data-rol="toplandi"]');
    if (toplandiCb) {
      toplandiCb.addEventListener("change", () => {
        const patch = toplandiCb.checked ? { toplandi: true, eksik: false } : { toplandi: false };
        if (toplandiCb.checked) patch.toplayanKullanici = mevcutKullanici.ad || mevcutKullanici.uid;
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
    const kontrolCb = satir.querySelector('[data-rol="kontrol"]');
    if (kontrolCb) {
      kontrolCb.addEventListener("change", async () => {
        const patch = { kontrol: kontrolCb.checked };
        if (kontrolCb.checked) patch.kontrolEdenKullanici = mevcutKullanici.ad || mevcutKullanici.uid;
        await urunGuncelle(aktifSiparis.id, uid, patch);
        if (aktifSiparis.durum === "toplandi") {
          aktifSiparis.durum = "kontrol_ediliyor";
          siparisGuncelle(aktifSiparis.id, { durum: "kontrol_ediliyor" });
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
        <p><span class="reyon-tag">${kacisEt(urun.reyon || "—")}</span> &nbsp; ${toplamaDurumRozeti(urun)}</p>
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
      siparisGuncelle(aktifSiparis.id, { durum: "kontrol_ediliyor" });
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
    metin: "Tamamlandıktan sonra bu sipariş arşivlenecek ve düzenlenemeyecek.",
    onayMetni: "Tamamla"
  });
  if (!onay) return;
  await siparisGuncelle(aktifSiparis.id, { durum: "tamamlandi" });
  toast("Kontrol tamamlandı. Sipariş arşivlendi.", "success");
  geriDon();
});
