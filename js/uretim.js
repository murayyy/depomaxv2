// ============================================================================
// ÜRETİM & PAKETLEME MODÜLܺ
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import {
  receteleriDinle, receteOlustur, receteGuncelle, recedeSil,
  uretimKaydet, paketlemeKaydet, uretimGecmisGetir
} from "./veri.js";
import { arayuzHazirla, toast, onayIste, kacisEt, sayiBicimle, ondalikOku } from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;
let receteListesi = [];
let kokYardimcilar = [];
let pkYardimcilar = [];

function yardimciChip(ad, index, tip) {
  return `<span style="display:inline-flex;align-items:center;gap:5px;background:var(--color-surface-2);border-radius:99px;padding:3px 10px;font-size:12.5px;">
    👤 ${kacisEt(ad)}
    <button onclick="kaldir${tip}Yardimci(${index})" style="background:none;border:none;cursor:pointer;color:#999;font-size:14px;line-height:1;">✕</button>
  </span>`;
}

function renderKokYardimcilar() {
  const div = document.getElementById("kokYardimcilar");
  if (!div) return;
  div.innerHTML = kokYardimcilar.map((ad, i) => yardimciChip(ad, i, "Kok")).join("") +
    '<button class="btn btn-ghost btn-sm" id="kokYardimciEkleBtn">+ Yardımcı Ekle</button>';
  document.getElementById("kokYardimciEkleBtn")?.addEventListener("click", yardimciEkleModal.bind(null, "kok"));
}

function renderPkYardimcilar() {
  const div = document.getElementById("pkYardimcilar");
  if (!div) return;
  div.innerHTML = pkYardimcilar.map((ad, i) => yardimciChip(ad, i, "Pk")).join("") +
    '<button class="btn btn-ghost btn-sm" id="pkYardimciEkleBtn">+ Yardımcı Ekle</button>';
  document.getElementById("pkYardimciEkleBtn")?.addEventListener("click", yardimciEkleModal.bind(null, "pk"));
}

window.kaldirKokYardimci = (i) => { kokYardimcilar.splice(i, 1); renderKokYardimcilar(); };
window.kaldirPkYardimci = (i) => { pkYardimcilar.splice(i, 1); renderPkYardimcilar(); };

function yardimciEkleModal(tip) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal" style="max-width:360px;">
        <h3>👤 Yardımcı Ekle</h3>
        <div class="field"><label>Ad Soyad</label><input class="input" id="yardimciAdInput" placeholder="Ad Soyad" /></div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="ekle">Ekle</button>
        </div>
      </div>
    </div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
  root.querySelector('[data-role="ekle"]').onclick = () => {
    const ad = document.getElementById("yardimciAdInput").value.trim();
    if (!ad) { toast("Ad girin.", "error"); return; }
    if (tip === "kok") { kokYardimcilar.push(ad); renderKokYardimcilar(); }
    else { pkYardimcilar.push(ad); renderPkYardimcilar(); }
    kapat();
  };
  document.getElementById("yardimciAdInput").focus();
}
let aktifSekme = "kokteyl";

// Bugünün tarihini giriş alanlarına yaz
const bugun = new Date().toISOString().slice(0, 10);
document.getElementById("kokTarih").value = bugun;
document.getElementById("pkTarih").value = bugun;

sayfaKorumasi(["uretici", "admin"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  document.getElementById("pkYapan").value = kullanici.ad || "";
  renderKokYardimcilar();
  renderPkYardimcilar();
  receteleriDinle((liste) => {
    receteListesi = liste;
    renderReceteler();
    receteSelectGuncelle();
  });
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// Sekme
const bloklar = { kokteyl: "kokteylBloku", paketleme: "paketlemeBloku", recete: "receteBloku", gecmis: "gecmisBloku" };
document.querySelectorAll("[data-sekme]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-sekme]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    aktifSekme = btn.dataset.sekme;
    Object.entries(bloklar).forEach(([k, id]) => {
      document.getElementById(id).classList.toggle("u-hidden", k !== aktifSekme);
    });
    if (aktifSekme === "gecmis") gecmisYukle();
  });
});

/* ---- Reçete Select Güncelle ---- */
function receteSelectGuncelle() {
  const sel = document.getElementById("kokRecete");
  const mevcut = sel.value;
  sel.innerHTML = '<option value="">— Reçete seç —</option>' +
    receteListesi.map((r) => `<option value="${r.id}">${kacisEt(r.ad)}</option>`).join("");
  if (mevcut) sel.value = mevcut;
  receteIcerikGoster();
}

function receteIcerikGoster() {
  const id = document.getElementById("kokRecete").value;
  const div = document.getElementById("kokReceteIcerik");
  if (!id) { div.classList.add("u-hidden"); return; }
  const r = receteListesi.find((x) => x.id === id);
  if (!r) { div.classList.add("u-hidden"); return; }
  div.classList.remove("u-hidden");
  div.innerHTML = `<b>📋 ${kacisEt(r.ad)}</b><br>` +
    (r.malzemeler || []).map((m) => `· ${kacisEt(m.ad)}: ${sayiBicimle(m.miktar)} ${kacisEt(m.birim || "KG")}`).join("<br>") +
    (r.aciklama ? `<br><span style="color:var(--color-ink-soft);font-size:12px;">📝 ${kacisEt(r.aciklama)}</span>` : "");
}
document.getElementById("kokRecete").addEventListener("change", receteIcerikGoster);

/* ---- Kokteyl Üretim Kaydet ---- */
document.getElementById("kokKaydetBtn").addEventListener("click", async () => {
  const receteId = document.getElementById("kokRecete").value;
  const recete = receteListesi.find((r) => r.id === receteId);
  if (!recete) { toast("Reçete seçiniz.", "error"); return; }
  const miktar = ondalikOku(document.getElementById("kokMiktar").value);
  if (!miktar) { toast("Miktar giriniz.", "error"); return; }
  await uretimKaydet({
    receteId, receteAd: recete.ad,
    malzemeler: recete.malzemeler || [],
    urunAd: recete.ciktiAdi || recete.ad,
    miktar,
    palet: parseInt(document.getElementById("kokPalet").value) || 0,
    tarihStr: document.getElementById("kokTarih").value,
    parti: document.getElementById("kokParti").value.trim(),
    not: document.getElementById("kokNot").value.trim(),
    yapan: mevcutKullanici.ad || mevcutKullanici.uid,
    yardimcilar: [...kokYardimcilar]
  });
  toast(`✅ ${recete.ad} — ${sayiBicimle(miktar)} KG üretim kaydedildi.`, "success");
  document.getElementById("kokMiktar").value = "";
  document.getElementById("kokPalet").value = "";
  document.getElementById("kokParti").value = "";
  document.getElementById("kokNot").value = "";
  kokYardimcilar = [];
  renderKokYardimcilar();
});

/* ---- Paketleme Kaydet ---- */
document.getElementById("pkKaydetBtn").addEventListener("click", async () => {
  const urun = document.getElementById("pkUrun").value.trim();
  if (!urun) { toast("Ürün adı giriniz.", "error"); return; }
  const cuval = parseInt(document.getElementById("pkCuval").value) || 0;
  const poset = parseInt(document.getElementById("pkPoset").value) || 0;
  const kg = ondalikOku(document.getElementById("pkKg").value) || 0;
  if (!cuval && !poset) { toast("Çuval veya poşet sayısı giriniz.", "error"); return; }
  await paketlemeKaydet({
    urunAd: urun,
    acılanCuval: cuval,
    cikaPoset: poset,
    miktar: kg,
    tarihStr: document.getElementById("pkTarih").value,
    not: document.getElementById("pkNot").value.trim(),
    yapan: document.getElementById("pkYapan").value.trim() || mevcutKullanici.ad || mevcutKullanici.uid,
    yardimcilar: [...pkYardimcilar]
  });
  toast(`✅ ${urun} — paketleme kaydedildi.`, "success");
  document.getElementById("pkUrun").value = "";
  document.getElementById("pkCuval").value = "";
  document.getElementById("pkPoset").value = "";
  document.getElementById("pkKg").value = "";
  document.getElementById("pkNot").value = "";
  pkYardimcilar = [];
  renderPkYardimcilar();
});

/* ---- Reçeteler ---- */
function renderReceteler() {
  const grid = document.getElementById("receteGrid");
  const bos = document.getElementById("receteBosDurum");
  if (!receteListesi.length) { grid.innerHTML = ""; bos.classList.remove("u-hidden"); return; }
  bos.classList.add("u-hidden");
  grid.innerHTML = receteListesi.map((r) => `
    <div class="card order-card">
      <div class="order-card__main">
        <div class="order-card__name">🧪 ${kacisEt(r.ad)}</div>
        ${r.ciktiAdi ? `<div style="font-size:12px;color:var(--color-ink-soft);">Çıktı: ${kacisEt(r.ciktiAdi)}</div>` : ""}
        <div style="font-size:12.5px;margin-top:6px;">
          ${(r.malzemeler || []).map((m) => `<span class="badge badge-gray" style="margin-right:4px;margin-bottom:4px;">${kacisEt(m.ad)} ${sayiBicimle(m.miktar)} ${kacisEt(m.birim || "KG")}</span>`).join("")}
        </div>
        ${r.aciklama ? `<div style="font-size:12px;color:var(--color-ink-soft);margin-top:4px;">📝 ${kacisEt(r.aciklama)}</div>` : ""}
      </div>
      <div class="order-card__actions">
        <button class="btn btn-ghost btn-sm" data-duzenle="${r.id}">✏ Düzenle</button>
        <button class="btn btn-danger btn-sm" data-sil="${r.id}">Sil</button>
      </div>
    </div>`).join("");

  grid.querySelectorAll("[data-duzenle]").forEach((btn) => {
    btn.addEventListener("click", () => receteModalAc(btn.dataset.duzenle));
  });
  grid.querySelectorAll("[data-sil]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const r = receteListesi.find(x => x.id === btn.dataset.sil);
      const onay = await onayIste({ baslik: "Reçeteyi Sil", metin: `"${r?.ad}" silinecek.`, onayMetni: "Sil" });
      if (onay) { await recedeSil(btn.dataset.sil); toast("Reçete silindi.", "success"); }
    });
  });
}

document.getElementById("yeniReceteBtn").addEventListener("click", () => receteModalAc(null));

function receteModalAc(receteId) {
  const mevcut = receteId ? receteListesi.find((r) => r.id === receteId) : null;
  const malzemeler = mevcut?.malzemeler || [{ ad: "", miktar: 0, birim: "KG" }];
  const root = document.getElementById("modalRoot");

  function modalIcerik(mls) {
    return `
      <div class="modal-backdrop" data-role="backdrop">
        <div class="modal" style="max-width:500px;">
          <h3>${mevcut ? "Reçete Düzenle" : "Yeni Reçete"}</h3>
          <div class="field"><label>Reçete Adı</label><input class="input" id="rcAd" value="${kacisEt(mevcut?.ad || "")}" placeholder="Örn. Karma Kokteyl" /></div>
          <div class="field"><label>Çıktı Ürün Adı</label><input class="input" id="rcCikti" value="${kacisEt(mevcut?.ciktiAdi || "")}" placeholder="Örn. Kokteyl 5 KG Poşet" /></div>
          <div style="margin-bottom:8px;font-weight:600;font-size:13px;">Malzemeler</div>
          <div id="rcMalzemeler">
            ${mls.map((m, i) => `
              <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:6px;margin-bottom:6px;" data-mi="${i}">
                <input class="input" id="rcMad${i}" value="${kacisEt(m.ad)}" placeholder="Ürün adı" style="font-size:12.5px;" />
                <input class="input" type="text" inputmode="decimal" id="rcMmk${i}" value="${m.miktar || ""}" placeholder="Miktar" style="width:70px;font-size:12.5px;" />
                <input class="input" id="rcMbr${i}" value="${kacisEt(m.birim || "KG")}" placeholder="Birim" style="width:50px;font-size:12.5px;" />
                <button class="btn btn-danger btn-sm" data-mkal="${i}">✕</button>
              </div>`).join("")}
          </div>
          <button class="btn btn-ghost btn-sm" id="rcMalzemeEkle">+ Malzeme Ekle</button>
          <div class="field" style="margin-top:10px;"><label>Not</label><input class="input" id="rcNot" value="${kacisEt(mevcut?.aciklama || "")}" placeholder="İsteğe bağlı…" /></div>
          <div class="modal__actions">
            <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
            <button class="btn btn-primary" data-role="kaydet">${mevcut ? "Güncelle" : "Oluştur"}</button>
          </div>
        </div>
      </div>`;
  }

  let mlsCopy = malzemeler.map(m => ({ ...m }));
  root.innerHTML = modalIcerik(mlsCopy);

  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };

  root.querySelector("#rcMalzemeEkle").onclick = () => {
    mlsCopy.push({ ad: "", miktar: 0, birim: "KG" });
    root.innerHTML = modalIcerik(mlsCopy);
    rebind();
  };

  function rebind() {
    kapat; // ref
    root.querySelector('[data-role="iptal"]').onclick = kapat;
    root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
    root.querySelector("#rcMalzemeEkle").onclick = () => {
      mlsCopy.push({ ad: "", miktar: 0, birim: "KG" });
      root.innerHTML = modalIcerik(mlsCopy);
      rebind();
    };
    root.querySelectorAll("[data-mkal]").forEach((btn) => {
      btn.onclick = () => {
        mlsCopy.splice(Number(btn.dataset.mkal), 1);
        root.innerHTML = modalIcerik(mlsCopy);
        rebind();
      };
    });
    root.querySelector('[data-role="kaydet"]').onclick = kaydet;
  }

  async function kaydet() {
    const ad = document.getElementById("rcAd").value.trim();
    if (!ad) { toast("Reçete adı zorunlu.", "error"); return; }
    const malzemelerGun = mlsCopy.map((_, i) => ({
      ad: document.getElementById(`rcMad${i}`)?.value?.trim() || "",
      miktar: ondalikOku(document.getElementById(`rcMmk${i}`)?.value || "0"),
      birim: document.getElementById(`rcMbr${i}`)?.value?.trim() || "KG"
    })).filter(m => m.ad);
    const veri = {
      ad, ciktiAdi: document.getElementById("rcCikti").value.trim(),
      malzemeler: malzemelerGun,
      aciklama: document.getElementById("rcNot").value.trim()
    };
    if (mevcut) { await receteGuncelle(receteId, veri); toast("Reçete güncellendi.", "success"); }
    else { await receteOlustur(veri); toast("Reçete oluşturuldu.", "success"); }
    kapat();
  }

  root.querySelectorAll("[data-mkal]").forEach((btn) => {
    btn.onclick = () => {
      mlsCopy.splice(Number(btn.dataset.mkal), 1);
      root.innerHTML = modalIcerik(mlsCopy);
      rebind();
    };
  });
  root.querySelector('[data-role="kaydet"]').onclick = kaydet;
}

/* ---- Geçmiş ---- */
async function gecmisYukle() {
  const tbody = document.getElementById("gecmisTablosu");
  const kartlar = document.getElementById("gecmisKartlar");
  const bos = document.getElementById("gecmisBosDurum");
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">⏳</td></tr>';
  try {
    const kayitlar = await uretimGecmisGetir();
    if (!kayitlar.length) {
      tbody.innerHTML = ""; kartlar.innerHTML = "";
      bos.classList.remove("u-hidden"); return;
    }
    bos.classList.add("u-hidden");
    tbody.innerHTML = kayitlar.map((k) => {
      const tarih = k.tarih?.toDate?.()?.toLocaleString("tr-TR") || k.tarihStr || "—";
      const tipRozet = k.tip === "uretim"
        ? '<span class="badge badge-blue">🧪 Üretim</span>'
        : '<span class="badge badge-amber">📦 Paketleme</span>';
      const urunAd = k.tip === "uretim" ? (k.receteAd || k.urunAd) : k.urunAd;
      const miktar = k.tip === "uretim"
        ? `${sayiBicimle(k.miktar)} KG`
        : `${k.acılanCuval || 0} çuval → ${k.cikaPoset || 0} poşet${k.miktar ? " (" + sayiBicimle(k.miktar) + " KG)" : ""}`;
      return `<tr>
        <td style="font-size:12px;">${tarih}</td>
        <td>${tipRozet}</td>
        <td>${kacisEt(urunAd || "—")}</td>
        <td>${miktar}</td>
        <td>${k.palet || "—"}</td>
        <td>${kacisEt(k.yapan || "—")}</td>
        <td class="u-text-soft" style="font-size:12px;">${kacisEt(k.not || k.parti || "—")}</td>
      </tr>`;
    }).join("");

    kartlar.innerHTML = kayitlar.map((k) => {
      const tarih = k.tarih?.toDate?.()?.toLocaleString("tr-TR") || k.tarihStr || "—";
      const tipRozet = k.tip === "uretim"
        ? '<span class="badge badge-blue">🧪 Üretim</span>'
        : '<span class="badge badge-amber">📦 Paketleme</span>';
      const urunAd = k.tip === "uretim" ? (k.receteAd || k.urunAd) : k.urunAd;
      const miktar = k.tip === "uretim"
        ? `${sayiBicimle(k.miktar)} KG${k.palet ? " · " + k.palet + " palet" : ""}`
        : `${k.acılanCuval || 0} çuval → ${k.cikaPoset || 0} poşet${k.miktar ? " (" + sayiBicimle(k.miktar) + " KG)" : ""}`;
      return `
        <div class="row-card">
          <div class="row-card__top">
            <div>
              <div class="row-card__name">${kacisEt(urunAd || "—")}</div>
              <div class="row-card__code">${miktar}</div>
            </div>
            ${tipRozet}
          </div>
          <div class="u-text-soft" style="font-size:12px;margin-top:4px;">
            👤 ${kacisEt(k.yapan || "—")}${k.yardimcilar?.length ? " + " + k.yardimcilar.map(y => kacisEt(y)).join(", ") : ""} · 🕐 ${tarih}
            ${k.not ? " · " + kacisEt(k.not) : ""}
            ${k.parti ? " · LOT: " + kacisEt(k.parti) : ""}
          </div>
        </div>`;
    }).join("");
  } catch (err) {
    console.error(err);
    toast("Geçmiş yüklenemedi.", "error");
  }
}

document.getElementById("gecmisYenileBtn").addEventListener("click", gecmisYukle);

/* ---- Excel ---- */
document.getElementById("excelBtn").addEventListener("click", async () => {
  try {
    const kayitlar = await uretimGecmisGetir();
    const wb = window.XLSX.utils.book_new();
    const satirlar = [["Tarih", "Tip", "Ürün / Reçete", "Miktar (KG)", "Palet", "Çuval", "Poşet", "Yapan", "Not", "Parti"]];
    kayitlar.forEach((k) => {
      const tarih = k.tarih?.toDate?.()?.toLocaleString("tr-TR") || k.tarihStr || "";
      satirlar.push([
        tarih,
        k.tip === "uretim" ? "Üretim" : "Paketleme",
        k.tip === "uretim" ? (k.receteAd || k.urunAd) : k.urunAd,
        k.miktar || "",
        k.palet || "",
        k.acılanCuval || "",
        k.cikaPoset || "",
        k.yapan || "",
        k.not || "",
        k.parti || ""
      ]);
    });
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(satirlar), "Üretim & Paketleme");

    // Reçeteler sayfası
    const recSatirlar = [["Reçete Adı", "Çıktı", "Malzemeler", "Not"]];
    receteListesi.forEach((r) => {
      recSatirlar.push([
        r.ad, r.ciktiAdi || "",
        (r.malzemeler || []).map(m => `${m.ad}: ${m.miktar} ${m.birim || "KG"}`).join(", "),
        r.aciklama || ""
      ]);
    });
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(recSatirlar), "Reçeteler");

    const tarih = new Date().toLocaleDateString("tr-TR").replace(/\./g, "-");
    window.XLSX.writeFile(wb, `uretim_paketleme_${tarih}.xlsx`);
    toast("Excel indirildi.", "success");
  } catch (err) {
    console.error(err);
    toast("Excel oluşturulamadı.", "error");
  }
});
