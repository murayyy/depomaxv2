// ============================================================================
// YÖNETİM PANELİ MANTIĞI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { kullanicilariDinle, kullaniciOlustur, kullaniciRolGuncelle, kullaniciSil } from "./kullanici-yonetimi.js";
import { katalogDinle, katalogUrunEkle, katalogUrunGuncelle, katalogUrunSil, tumSiparisleriGetir, teslimatDegerlendir } from "./veri.js";
import { arayuzHazirla, toast, onayIste, kacisEt, tarihBicimle, ondalikOku, sayiBicimle } from "./utils.js";

arayuzHazirla();

const ROL_ETIKETI = { toplayici: "Toplayıcı", kontrolor: "Kontrolör", admin: "Admin", sube: "Şube", surucu: "Sürücü" };
const HATA_MESAJLARI = {
  "auth/email-already-in-use": "Bu e-posta adresiyle zaten bir hesap var.",
  "auth/invalid-email": "E-posta adresi geçerli değil.",
  "auth/weak-password": "Şifre en az 6 karakter olmalı."
};

let mevcutKullanici = null;
let kullaniciListesi = [];
let katalogListesi = [];

sayfaKorumasi(["admin"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  kullanicilariDinle((liste) => {
    kullaniciListesi = liste.sort((a, b) => (a.ad || "").localeCompare(b.ad || ""));
    renderKullanicilar();
    gunlukOzetGoster(liste);
  });
  katalogDinle((liste) => {
    katalogListesi = liste;
    renderKatalog();
  });
});

/* ---------------- Sekme geçişi ---------------- */
document.querySelectorAll("[data-sekme]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-sekme]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    const aktif = btn.dataset.sekme;
    document.getElementById("kullaniciBloku").classList.toggle("u-hidden", aktif !== "kullanici");
    document.getElementById("katalogBloku").classList.toggle("u-hidden", aktif !== "katalog");
    document.getElementById("teslimatBloku").classList.toggle("u-hidden", aktif !== "teslimat");
    document.getElementById("aracBloku").classList.toggle("u-hidden", aktif !== "arac");
  });
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

function renderKullanicilar() {
  const tbody = document.getElementById("kullaniciTabloGovde");
  const kartGovde = document.getElementById("kullaniciKartGovde");
  const bos = document.getElementById("bosDurum");

  if (kullaniciListesi.length === 0) {
    tbody.innerHTML = "";
    kartGovde.innerHTML = "";
    bos.classList.remove("u-hidden");
    return;
  }
  bos.classList.add("u-hidden");

  tbody.innerHTML = kullaniciListesi.map(satirHtml).join("");
  kartGovde.innerHTML = kullaniciListesi.map(kartHtml).join("");
  baglaOlaylar(tbody);
  baglaOlaylar(kartGovde);
}

function rolSelectHtml(k) {
  const kendisi = k.uid === mevcutKullanici.uid;
  return `
    <select class="select" data-rol="rolSec" style="min-width:120px;" ${kendisi ? "disabled title=\"Kendi rolünüzü buradan değiştiremezsiniz\"" : ""}>
      ${Object.entries(ROL_ETIKETI).map(([deger, etiket]) =>
        `<option value="${deger}" ${k.rol === deger ? "selected" : ""}>${etiket}</option>`).join("")}
    </select>`;
}

function satirHtml(k) {
  const subeAdiGoster = k.rol === "sube";
  return `
    <tr data-uid="${k.uid}">
      <td>${kacisEt(k.ad)}</td>
      <td class="cell-code">${kacisEt(k.eposta)}</td>
      <td>
        ${rolSelectHtml(k)}
        ${subeAdiGoster ? `
          <input class="input" data-rol="subeAdi" value="${kacisEt(k.subeAdi || "")}" placeholder="Şube adı…" style="margin-top:4px;font-size:12.5px;" />
          <input class="input" data-rol="adres" value="${kacisEt(k.adres || "")}" placeholder="Adres…" style="margin-top:4px;font-size:12.5px;" />
          <input class="input" data-rol="telefon" value="${kacisEt(k.telefon || "")}" placeholder="Telefon…" style="margin-top:4px;font-size:12.5px;" />
          <div style="display:flex;gap:4px;margin-top:4px;">
            <input class="input" data-rol="lat" value="${k.lat || ""}" placeholder="Enlem (örn. 39.9)" style="font-size:12.5px;" />
            <input class="input" data-rol="lng" value="${k.lng || ""}" placeholder="Boylam (örn. 32.8)" style="font-size:12.5px;" />
          </div>` : ""}
      </td>
      <td>${tarihBicimle(k.olusturulmaTarihi)}</td>
      <td>${k.uid === mevcutKullanici.uid ? "" : `<button class="btn btn-danger btn-sm" data-rol="sil">Sil</button>`}</td>
    </tr>`;
}

function kartHtml(k) {
  return `
    <div class="row-card" data-uid="${k.uid}">
      <div class="row-card__top">
        <div>
          <div class="row-card__name">${kacisEt(k.ad)}</div>
          <div class="row-card__code">${kacisEt(k.eposta)}</div>
        </div>
        <span class="badge badge-gray">${ROL_ETIKETI[k.rol] || k.rol}</span>
      </div>
      <div class="field" style="margin-top:10px;">
        <label class="row-card__label">Rol</label>
        ${rolSelectHtml(k)}
      </div>
      ${k.rol === "sube" ? `
      <div class="field">
        <label class="row-card__label">Şube Adı</label>
        <input class="input" data-rol="subeAdi" value="${kacisEt(k.subeAdi || "")}" placeholder="Şube adı…" style="font-size:12.5px;" />
      </div>` : ""}
      <div class="row-card__actions">
        ${k.uid === mevcutKullanici.uid ? "" : `<button class="btn btn-danger btn-sm" data-rol="sil">Sil</button>`}
      </div>
    </div>`;
}

function baglaOlaylar(kapsayici) {
  kapsayici.querySelectorAll("[data-uid]").forEach((satir) => {
    const uid = satir.dataset.uid;
    const rolSec = satir.querySelector('[data-rol="rolSec"]');
    if (rolSec) {
      rolSec.addEventListener("change", async () => {
        const subeAdi = satir.querySelector('[data-rol="subeAdi"]')?.value?.trim() || "";
        await kullaniciRolGuncelle(uid, rolSec.value, rolSec.value === "sube" && subeAdi ? { subeAdi } : {});
        toast("Rol güncellendi.", "success");
      });
    }
    const subeAdiInput = satir.querySelector('[data-rol="subeAdi"]');
    if (subeAdiInput) {
      const saveSubeFields = async () => {
        const patch = {
          subeAdi: satir.querySelector('[data-rol="subeAdi"]')?.value?.trim() || "",
          adres: satir.querySelector('[data-rol="adres"]')?.value?.trim() || "",
          telefon: satir.querySelector('[data-rol="telefon"]')?.value?.trim() || "",
          lat: parseFloat(satir.querySelector('[data-rol="lat"]')?.value) || null,
          lng: parseFloat(satir.querySelector('[data-rol="lng"]')?.value) || null,
        };
        await kullaniciRolGuncelle(uid, "sube", patch);
        toast("Şube bilgileri güncellendi.", "success");
      };
      satir.querySelectorAll('[data-rol="subeAdi"],[data-rol="adres"],[data-rol="telefon"],[data-rol="lat"],[data-rol="lng"]')
        .forEach((inp) => inp.addEventListener("change", saveSubeFields));
    }
    const silBtn = satir.querySelector('[data-rol="sil"]');
    if (silBtn) {
      silBtn.addEventListener("click", async () => {
        const k = kullaniciListesi.find((x) => x.uid === uid);
        const onay = await onayIste({
          baslik: "Kullanıcı Erişimi Kaldırılsın mı?",
          metin: `${k ? k.ad : "Bu kullanıcının"} uygulamaya giriş yetkisi kaldırılacak. (Not: Authentication hesabı silinmez, sadece rol kaldırılır — tamamen silmek için Firebase konsolu gerekir.)`,
          onayMetni: "Erişimi Kaldır",
          tehlikeli: true
        });
        if (!onay) return;
        await kullaniciSil(uid);
        toast("Kullanıcının erişimi kaldırıldı.", "success");
      });
    }
  });
}

/* ---------------- Yeni kullanıcı oluşturma ---------------- */
function yeniKullaniciModalAc() {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal">
        <h3>Yeni Kullanıcı Ekle</h3>
        <div class="field"><label>Ad Soyad</label><input class="input" id="ykAd" /></div>
        <div class="field"><label>E-posta</label><input class="input" type="email" id="ykEposta" /></div>
        <div class="field"><label>Geçici Şifre (en az 6 karakter)</label><input class="input" type="text" id="ykSifre" /></div>
        <div class="field">
          <label>Rol</label>
          <select class="select" id="ykRol">
            <option value="toplayici">Toplayıcı</option>
            <option value="kontrolor">Kontrolör</option>
            <option value="sube">Şube</option>
            <option value="surucu">Sürücü</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="field" id="ykSubeAdiAlani">
          <label>Şube Adı</label>
          <input class="input" id="ykSubeAdi" placeholder="Örn. Bozüyük Şubesi" />
        </div>
        <div class="field u-hidden" id="ykPlakaAlani">
          <label>Araç Plakası</label>
          <input class="input" id="ykPlaka" placeholder="Örn. 34 ABC 123" />
        </div>
        <p style="font-size:12px;">Bu e-posta ve şifreyi ilgili kişiye siz iletmeniz gerekiyor.</p>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="onay">Oluştur</button>
        </div>
      </div>
    </div>`;
  const rolSec = root.querySelector("#ykRol");
  const subeAdiAlani = root.querySelector("#ykSubeAdiAlani");
  const guncelle = () => {
    subeAdiAlani.classList.toggle("u-hidden", rolSec.value !== "sube");
    root.querySelector("#ykPlakaAlani").classList.toggle("u-hidden", rolSec.value !== "surucu");
  };
  rolSec.addEventListener("change", guncelle);
  guncelle();
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
  root.querySelector('[data-role="onay"]').onclick = async () => {
    const ad = document.getElementById("ykAd").value.trim();
    const eposta = document.getElementById("ykEposta").value.trim();
    const sifre = document.getElementById("ykSifre").value;
    const rol = document.getElementById("ykRol").value;
    const subeAdi = document.getElementById("ykSubeAdi").value.trim();
    if (!ad || !eposta || sifre.length < 6) {
      toast("Lütfen ad, e-posta girin ve en az 6 karakterli bir şifre belirleyin.", "error");
      return;
    }
    const plaka = document.getElementById("ykPlaka")?.value?.trim() || "";
    if (rol === "sube" && !subeAdi) { toast("Şube rolü için şube adı girilmeli.", "error"); return; }
    if (rol === "surucu" && !plaka) { toast("Sürücü rolü için plaka girilmeli.", "error"); return; }
    try {
      const ekstraAlanlar = rol === "sube" ? { subeAdi } : rol === "surucu" ? { plaka } : {};
      await kullaniciOlustur({ ad, eposta, sifre, rol, ...ekstraAlanlar });
      kapat();
      toast(`${ad} eklendi.`, "success");
    } catch (err) {
      console.error(err);
      toast(HATA_MESAJLARI[err.code] || "Kullanıcı oluşturulurken hata oluştu.", "error");
    }
  };
}

document.getElementById("yeniKullaniciBtn2").addEventListener("click", yeniKullaniciModalAc);

/* ============================================================================
   KATALOG YÖNETİMİ
   ============================================================================ */
function renderKatalog() {
  const tbody = document.getElementById("katalogTabloGovde");
  const kartGovde = document.getElementById("katalogKartGovde");
  const bos = document.getElementById("katalogBosDurum");
  if (!tbody) return;

  if (katalogListesi.length === 0) {
    tbody.innerHTML = "";
    kartGovde.innerHTML = "";
    bos.classList.remove("u-hidden");
    return;
  }
  bos.classList.add("u-hidden");

  tbody.innerHTML = katalogListesi.map((u) => `
    <tr data-uid="${u.id}">
      <td class="cell-code">${u.sira || "—"}</td>
      <td class="cell-code">${kacisEt(u.stokKodu || "—")}</td>
      <td>${kacisEt(u.kategori || "—")}</td>
      <td>${kacisEt(u.ad)}</td>
      <td>${kacisEt(u.birim || "")}</td>
      <td>${u.minMiktar ? sayiBicimle(u.minMiktar) : "—"}</td>
      <td>${kacisEt(u.reyon || "")}</td>
      <td><span class="badge ${u.aktif === false ? "badge-gray" : "badge-green"}">${u.aktif === false ? "Pasif" : "Aktif"}</span></td>
      <td style="display:flex;gap:6px;">
        <button class="btn btn-ghost btn-sm" data-duzenle="${u.id}">Düzenle</button>
        <button class="btn btn-danger btn-sm" data-sil="${u.id}">Sil</button>
      </td>
    </tr>`).join("");

  kartGovde.innerHTML = katalogListesi.map((u) => `
    <div class="row-card" data-uid="${u.id}">
      <div class="row-card__top">
        <div>
          <div class="row-card__name">${kacisEt(u.ad)}</div>
          <div class="row-card__code">${kacisEt(u.birim || "")} · Min: ${u.minMiktar ? sayiBicimle(u.minMiktar) : "—"}</div>
        </div>
        <span class="badge ${u.aktif === false ? "badge-gray" : "badge-green"}">${u.aktif === false ? "Pasif" : "Aktif"}</span>
      </div>
      <div class="row-card__actions">
        <button class="btn btn-ghost btn-sm" data-duzenle="${u.id}">Düzenle</button>
        <button class="btn btn-danger btn-sm" data-sil="${u.id}">Sil</button>
      </div>
    </div>`).join("");

  document.querySelectorAll("[data-duzenle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const u = katalogListesi.find((x) => x.id === btn.dataset.duzenle);
      katalogModalAc(u);
    });
  });
  document.querySelectorAll("[data-sil]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const u = katalogListesi.find((x) => x.id === btn.dataset.sil);
      const onay = await onayIste({ baslik: "Ürünü Sil", metin: `"${u ? u.ad : ""}" kataloğdan silinecek.`, tehlikeli: true, onayMetni: "Sil" });
      if (!onay) return;
      await katalogUrunSil(btn.dataset.sil);
      toast("Ürün silindi.", "success");
    });
  });
}

function katalogModalAc(mevcut) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal">
        <h3>${mevcut ? "Ürünü Düzenle" : "Kataloga Ürün Ekle"}</h3>
        <div class="input-row">
          <div class="field"><label>Stok Kodu</label><input class="input" id="kuStokKodu" placeholder="Mikro stok kodu" value="${kacisEt(mevcut?.stokKodu || "")}" /></div>
          <div class="field"><label>Ürün Adı</label><input class="input" id="kuAd" value="${kacisEt(mevcut?.ad || "")}" /></div>
          <div class="field"><label>Birim</label><input class="input" id="kuBirim" placeholder="KG, Adet…" value="${kacisEt(mevcut?.birim || "")}" /></div>
          <div class="field"><label>Min. Miktar</label><input class="input" type="text" inputmode="decimal" id="kuMin" value="${mevcut?.minMiktar || ""}" /></div>
          <div class="field"><label>Reyon</label><input class="input" id="kuReyon" value="${kacisEt(mevcut?.reyon || "")}" /></div>
          <div class="field"><label>Sıra No</label><input class="input" type="number" id="kuSira" value="${mevcut?.sira || ""}" placeholder="1, 2, 3…" /></div>
          <div class="field"><label>Kategori</label><input class="input" id="kuKategori" placeholder="Kuruyemiş, Baharat…" value="${kacisEt(mevcut?.kategori || "")}" /></div>
          <div class="field"><label>Açıklama</label><input class="input" id="kuAciklama" value="${kacisEt(mevcut?.aciklama || "")}" /></div>
        </div>
        <div class="field">
          <label>Durum</label>
          <select class="select" id="kuAktif">
            <option value="true" ${mevcut?.aktif !== false ? "selected" : ""}>Aktif (şubelerde görünür)</option>
            <option value="false" ${mevcut?.aktif === false ? "selected" : ""}>Pasif (şubelerde gizli)</option>
          </select>
        </div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="onay">${mevcut ? "Kaydet" : "Ekle"}</button>
        </div>
      </div>
    </div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
  root.querySelector('[data-role="onay"]').onclick = async () => {
    const ad = document.getElementById("kuAd").value.trim();
    if (!ad) { toast("Ürün adı zorunlu.", "error"); return; }
    const veri = {
      ad,
      stokKodu: document.getElementById("kuStokKodu").value.trim(),
      kategori: document.getElementById("kuKategori").value.trim(),
      birim: document.getElementById("kuBirim").value.trim(),
      minMiktar: parseFloat(document.getElementById("kuMin").value.replace(",", ".")) || 0,
      reyon: document.getElementById("kuReyon").value.trim(),
      sira: parseInt(document.getElementById("kuSira").value, 10) || 0,
      aciklama: document.getElementById("kuAciklama").value.trim(),
      aktif: document.getElementById("kuAktif").value === "true"
    };
    try {
      if (mevcut) {
        await katalogUrunGuncelle(mevcut.id, veri);
        toast("Güncellendi.", "success");
      } else {
        await katalogUrunEkle(veri);
        toast("Ürün kataloğa eklendi.", "success");
      }
      kapat();
    } catch (err) {
      console.error(err);
      toast("Kaydedilemedi: " + (err.message || err), "error");
    }
  };
}

document.getElementById("yeniKatalogBtn2").addEventListener("click", () => katalogModalAc(null));

/* ============================================================================
   EXCEL'DEN TOPLU KATALOG EKLEMESİ
   Beklenen sütunlar (büyük/küçük harf fark etmez):
     Stok Kodu | Ürün Adı | Birim | Min. Miktar | Kategori | Reyon | Açıklama | Sıra
   Sadece "Ürün Adı" zorunlu, geri kalanlar isteğe bağlı.
   ============================================================================ */
document.getElementById("katalogExcelInput").addEventListener("change", async (e) => {
  const dosya = e.target.files[0];
  e.target.value = "";
  if (!dosya) return;

  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-backdrop"><div class="modal u-flex" style="justify-content:center;"><span class="spinner spinner-dark"></span><span>&nbsp;Excel okunuyor…</span></div></div>`;

  try {
    const { excelDosyasiniOku } = await import("./utils.js");
    const satirlar = await excelDosyasiniOku(dosya);
    root.innerHTML = "";

    if (satirlar.length === 0) { toast("Excel'de ürün bulunamadı.", "error"); return; }

    const norm = (s) => String(s || "").trim().toLowerCase();
    const bul = (satir, adaylar) => {
      for (const anahtar of Object.keys(satir)) {
        if (adaylar.includes(norm(anahtar))) return satir[anahtar];
      }
      return "";
    };

    const urunler = satirlar.map((satir, i) => ({
      stokKodu: String(bul(satir, ["stok kodu", "kod"]) || "").trim(),
      ad: String(bul(satir, ["ürün adı", "urun adi", "ad", "isim", "stok adı"]) || "").trim(),
      birim: String(bul(satir, ["birim"]) || "").trim(),
      minMiktar: parseFloat(String(bul(satir, ["min. miktar", "min miktar", "minimum miktar", "minimum"]) || "0").replace(",", ".")) || 0,
      kategori: String(bul(satir, ["kategori"]) || "").trim(),
      reyon: String(bul(satir, ["reyon"]) || "").trim(),
      aciklama: String(bul(satir, ["açıklama", "aciklama"]) || "").trim(),
      sira: parseInt(bul(satir, ["sıra", "sira", "sıra no", "sira no"]) || String(i + 1), 10) || (i + 1),
      aktif: true
    })).filter((u) => u.ad);

    if (urunler.length === 0) { toast("Ürün Adı sütunu bulunamadı veya tüm satırlar boş.", "error"); return; }

    // Önizleme modalı
    root.innerHTML = `
      <div class="modal-backdrop" data-role="backdrop">
        <div class="modal" style="max-width:560px;">
          <h3>Toplu Katalog Ekleme Önizlemesi</h3>
          <p>${urunler.length} ürün eklenecek. Mevcut katalog ürünleri <strong>silinmez</strong>, bunlar eklenir.</p>
          <div style="max-height:260px;overflow-y:auto;border:1px solid var(--color-border);border-radius:var(--radius-sm);margin-bottom:12px;">
            <table class="data-table">
              <thead><tr><th>Stok Kodu</th><th>Ürün Adı</th><th>Birim</th><th>Min.</th><th>Kategori</th></tr></thead>
              <tbody>
                ${urunler.map((u) => `<tr>
                  <td class="cell-code">${kacisEt(u.stokKodu || "—")}</td>
                  <td>${kacisEt(u.ad)}</td>
                  <td>${kacisEt(u.birim || "—")}</td>
                  <td>${u.minMiktar || "—"}</td>
                  <td>${kacisEt(u.kategori || "—")}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
          <div class="modal__actions">
            <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
            <button class="btn btn-primary" data-role="onay">✅ ${urunler.length} Ürünü Ekle</button>
          </div>
        </div>
      </div>`;

    const kapat = () => { root.innerHTML = ""; };
    root.querySelector('[data-role="iptal"]').onclick = kapat;
    root.querySelector('[data-role="backdrop"]').onclick = (ev) => { if (ev.target.dataset.role === "backdrop") kapat(); };
    root.querySelector('[data-role="onay"]').onclick = async () => {
      root.innerHTML = `<div class="modal-backdrop"><div class="modal u-flex" style="justify-content:center;"><span class="spinner spinner-dark"></span><span>&nbsp;Ekleniyor…</span></div></div>`;
      try {
        // 450'lik batch'ler halinde ekle
        const { db } = await import("./firebase.js");
        const { writeBatch, collection, doc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        for (let i = 0; i < urunler.length; i += 450) {
          const grup = urunler.slice(i, i + 450);
          const batch = writeBatch(db);
          grup.forEach((u) => {
            const ref = doc(collection(db, "katalog"));
            batch.set(ref, { ...u, guncellemeTarihi: serverTimestamp() });
          });
          await batch.commit();
        }
        root.innerHTML = "";
        toast(`✅ ${urunler.length} ürün kataloğa eklendi.`, "success");
      } catch (err) {
        root.innerHTML = "";
        console.error(err);
        toast("Eklenirken hata: " + (err.message || err), "error");
      }
    };
  } catch (err) {
    root.innerHTML = "";
    console.error(err);
    toast("Excel okunurken hata oluştu.", "error");
  }
});

/* ============================================================================
   TESLİMAT UYUŞMAZLIK RAPORU
   ============================================================================ */

document.getElementById("teslimatHesaplaBtn").addEventListener("click", async () => {
  const liste = document.getElementById("teslimatRaporListesi");
  const bos = document.getElementById("teslimatBosDurum");
  liste.innerHTML = '<div class="empty-state"><div class="empty-state__icon">⏳</div></div>';
  bos.classList.add("u-hidden");

  try {
    let siparisler = await tumSiparisleriGetir();
    siparisler = siparisler.filter((s) => s.durum === "teslim_edildi" && s.teslimatKalemleri);

    const baslangic = document.getElementById("teslimatBaslangic").value;
    const bitis = document.getElementById("teslimatBitis").value;
    if (baslangic) {
      const s = new Date(baslangic + "T00:00:00").getTime();
      siparisler = siparisler.filter((x) => !x.teslimatTarihi || x.teslimatTarihi.toMillis() >= s);
    }
    if (bitis) {
      const s = new Date(bitis + "T23:59:59").getTime();
      siparisler = siparisler.filter((x) => !x.teslimatTarihi || x.teslimatTarihi.toMillis() <= s);
    }

    if (siparisler.length === 0) {
      liste.innerHTML = "";
      bos.classList.remove("u-hidden");
      return;
    }

    const sadeceFarklilar = document.getElementById("sadeceFarklilar")?.checked;
    const gosterilecekler = sadeceFarklilar
      ? siparisler.filter((s) => (s.teslimatOzeti?.eksik || 0) + (s.teslimatOzeti?.fazla || 0) > 0)
      : siparisler;

    if (gosterilecekler.length === 0) {
      liste.innerHTML = `<div class="empty-state__text" style="padding:20px;">Seçili tarih aralığında uyuşmazlık bulunamadı. <a href="#" id="tumunuGoster" style="color:var(--color-blue);">Tümünü göster</a></div>`;
      document.getElementById("tumunuGoster")?.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("sadeceFarklilar").checked = false;
        document.getElementById("teslimatHesaplaBtn").click();
      });
      return;
    }

    liste.innerHTML = gosterilecekler.map((s) => {
      const oz = s.teslimatOzeti || {};
      const uyusmazlik = (oz.eksik || 0) + (oz.fazla || 0);
      const rozet = uyusmazlik > 0
        ? `<span class="badge badge-red">⚠ ${uyusmazlik} uyuşmazlık</span>`
        : `<span class="badge badge-green">✅ Sorunsuz</span>`;
      const tarih = s.teslimatTarihi?.toDate ? s.teslimatTarihi.toDate().toLocaleString("tr-TR") : "—";
      return `
        <div class="card order-card" data-sid="${s.id}">
          <div class="order-card__main">
            <div class="order-card__name">${kacisEt(s.ad)}</div>
            <div class="order-card__meta">
              ${rozet}
              <span>${kacisEt(s.teslimiOnaylayan || s.subeAdi || "—")}</span>
              ${oz.eksik ? `<span class="u-text-soft">Eksik: ${oz.eksik} kalem (${sayiBicimle(oz.eksikMiktar || 0)})</span>` : ""}
              ${oz.fazla ? `<span class="u-text-soft">Fazla: ${oz.fazla} kalem (${sayiBicimle(oz.fazlaMiktar || 0)})</span>` : ""}
              <span>${tarih}</span>
            </div>
          </div>
          <div class="order-card__actions">
            ${(oz.eksik || oz.fazla) && s.merkezdegerlendirmesi !== "onaylandi" ? `<button class="btn btn-primary btn-sm" data-degerlendir="${s.id}">Değerlendir</button>` : ""}
            ${s.merkezdegerlendirmesi === "onaylandi" ? `<span class="badge badge-green">✅ Onaylandı</span>` : ""}
            ${s.merkezdegerlendirmesi === "tekrar_kontrol" ? `<span class="badge badge-red">🔄 Tekrar Gönderildi</span>` : ""}
            <button class="btn btn-ghost btn-sm" data-detay="${s.id}">Detay →</button>
          </div>
        </div>`;
    }).join("");

    // Detay modali
    // Değerlendirme butonu
    liste.querySelectorAll("[data-degerlendir]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const s = gosterilecekler.find((x) => x.id === btn.dataset.degerlendir);
        if (!s) return;
        const eksikKalemler = (s.teslimatKalemleri || []).filter((k) => k.durum === "eksik");
        const fazlaKalemler = (s.teslimatKalemleri || []).filter((k) => k.durum === "fazla");
        const root = document.getElementById("modalRoot");
        root.innerHTML = `
          <div class="modal-backdrop" data-role="backdrop">
            <div class="modal" style="max-width:500px;">
              <h3>📋 Teslimat Değerlendirmesi</h3>
              <p><b>${kacisEt(s.ad)}</b></p>
              ${eksikKalemler.length ? `
                <div style="margin-bottom:10px;">
                  <div class="row-card__label" style="margin-bottom:4px;">Eksik Gelen (${eksikKalemler.length} kalem)</div>
                  ${eksikKalemler.map((k) => `<div class="row-card" style="margin-bottom:6px;">
                    <span class="badge badge-red">⚠ Eksik</span>
                    <b>${kacisEt(k.ad)}</b> —
                    Sipariş: ${sayiBicimle(k.siparisMiktari)} · Gelen: ${sayiBicimle(k.gelenMiktar || 0)} ${kacisEt(k.birim)}
                    ${k.not ? `<div class="u-text-soft" style="font-size:12px;">${kacisEt(k.not)}</div>` : ""}
                  </div>`).join("")}
                </div>` : ""}
              ${fazlaKalemler.length ? `
                <div style="margin-bottom:10px;">
                  <div class="row-card__label" style="margin-bottom:4px;">Fazla Gelen (${fazlaKalemler.length} kalem)</div>
                  ${fazlaKalemler.map((k) => `<div class="row-card" style="margin-bottom:6px;">
                    <span class="badge badge-blue">➕ Fazla</span>
                    <b>${kacisEt(k.ad)}</b> —
                    Sipariş: ${sayiBicimle(k.siparisMiktari)} · Gelen: ${sayiBicimle(k.gelenMiktar || 0)} ${kacisEt(k.birim)}
                  </div>`).join("")}
                </div>` : ""}
              <div class="field">
                <label>Not (isteğe bağlı)</label>
                <input class="input" id="degerlendirmeNot" placeholder="Neden tekrar gönderiliyor, ne yapılmalı…" />
              </div>
              <div class="modal__actions" style="flex-wrap:wrap;gap:8px;">
                <button class="btn btn-ghost" data-role="kapat">Kapat</button>
                <button class="btn btn-green" data-role="onayla">✅ Onayla (Kabul Et)</button>
                ${eksikKalemler.length ? `<button class="btn btn-primary" data-role="tekrar">🔄 Tekrar Kontrol İşaretle</button>` : ""}
              </div>
            </div>
          </div>`;
        const kapat = () => { root.innerHTML = ""; };
        root.querySelector('[data-role="kapat"]').onclick = kapat;
        root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
        root.querySelector('[data-role="onayla"]').onclick = async () => {
          const not = document.getElementById("degerlendirmeNot").value.trim();
          await teslimatDegerlendir(s.id, { degerlendirme: "onaylandi", degerlendiren: mevcutKullanici.uid, not });
          toast("Teslimat onaylandı.", "success");
          kapat();
          document.getElementById("teslimatHesaplaBtn").click();
        };
        const tekrarBtn = root.querySelector('[data-role="tekrar"]');
        if (tekrarBtn) {
          tekrarBtn.onclick = async () => {
            const not = document.getElementById("degerlendirmeNot").value.trim();
            tekrarBtn.disabled = true; tekrarBtn.innerHTML = "⏳ Kaydediliyor…";
            try {
              await teslimatDegerlendir(s.id, { degerlendirme: "tekrar_kontrol", degerlendiren: mevcutKullanici.uid, not });
              toast(`✅ Kaydedildi. Eksik ${eksikKalemler.length} ürün "📋 Eksikler" sayfasında görünecek.`, "success", 6000);
              kapat();
              document.getElementById("teslimatHesaplaBtn").click();
            } catch (err) {
              console.error(err);
              toast("Hata oluştu: " + (err.message || err), "error");
              tekrarBtn.disabled = false; tekrarBtn.innerHTML = "🔄 Tekrar Kontrol İşaretle";
            }
          };
        }
      });
    });

    liste.querySelectorAll("[data-detay]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const s = gosterilecekler.find((x) => x.id === btn.dataset.detay);
        if (!s) return;
        const root = document.getElementById("modalRoot");
        const kalemler = s.teslimatKalemleri || [];
        root.innerHTML = `
          <div class="modal-backdrop" data-role="backdrop">
            <div class="modal" style="max-width:700px;">
              <h3>🚚 Teslim Detayı — ${kacisEt(s.ad)}</h3>
              <p>Teslim alan: <b>${kacisEt(s.teslimiOnaylayan || s.subeAdi || "—")}</b></p>
              <div class="table-wrap" style="max-height:400px;overflow-y:auto;">
                <table class="data-table">
                  <thead><tr><th>Kod</th><th>Ürün</th><th>Sipariş</th><th>Gelen</th><th>Fark</th><th>Durum</th><th>Not</th></tr></thead>
                  <tbody>
                    ${kalemler.map((k) => {
                      const fark = (Number(k.gelenMiktar) || 0) - (Number(k.siparisMiktari) || 0);
                      const farkHtml = fark === 0 ? "—" : fark > 0
                        ? `<span class="badge badge-blue">+${sayiBicimle(fark)}</span>`
                        : `<span class="badge badge-red">${sayiBicimle(fark)}</span>`;
                      const durumHtml = k.durum === "tamam"
                        ? '<span class="badge badge-green">✅ Tamam</span>'
                        : k.durum === "eksik"
                        ? '<span class="badge badge-red">⚠ Eksik</span>'
                        : '<span class="badge badge-blue">➕ Fazla</span>';
                      return `<tr>
                        <td class="cell-code">${kacisEt(k.kod || "—")}</td>
                        <td>${kacisEt(k.ad)}</td>
                        <td>${sayiBicimle(k.siparisMiktari)} ${kacisEt(k.birim)}</td>
                        <td>${sayiBicimle(k.gelenMiktar)} ${kacisEt(k.birim)}</td>
                        <td>${farkHtml}</td>
                        <td>${durumHtml}</td>
                        <td class="u-text-soft" style="font-size:12px;">${kacisEt(k.not || "—")}</td>
                      </tr>`;
                    }).join("")}
                  </tbody>
                </table>
              </div>
              <div class="modal__actions">
                <button class="btn btn-primary" data-role="kapat">Kapat</button>
              </div>
            </div>
          </div>`;
        root.querySelector('[data-role="kapat"]').onclick = () => { root.innerHTML = ""; };
        root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") root.innerHTML = ""; };
      });
    });
  } catch (err) {
    console.error(err);
    toast("Teslim raporu yüklenemedi.", "error");
    liste.innerHTML = "";
  }
});

/* ============================================================================
   ARAÇ BAZLI RAPOR
   ============================================================================ */
document.getElementById("aracHesaplaBtn").addEventListener("click", async () => {
  const tbody = document.getElementById("aracRaporTablosu");
  const bos = document.getElementById("aracBosDurum");
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">⏳ Yükleniyor…</td></tr>';
  bos.classList.add("u-hidden");

  try {
    let siparisler = await tumSiparisleriGetir();
    siparisler = siparisler.filter((s) => s.surucuUid); // sadece sürücü atanmış olanlar

    const baslangic = document.getElementById("aracBaslangic").value;
    const bitis = document.getElementById("aracBitis").value;
    if (baslangic) {
      const s = new Date(baslangic + "T00:00:00").getTime();
      siparisler = siparisler.filter((x) => !x.sevkTarihi || x.sevkTarihi.toMillis() >= s);
    }
    if (bitis) {
      const s = new Date(bitis + "T23:59:59").getTime();
      siparisler = siparisler.filter((x) => !x.sevkTarihi || x.sevkTarihi.toMillis() <= s);
    }

    if (siparisler.length === 0) {
      tbody.innerHTML = "";
      bos.classList.remove("u-hidden");
      return;
    }

    // Sürücü bazında grupla
    const map = new Map();
    siparisler.forEach((s) => {
      const uid = s.surucuUid;
      if (!map.has(uid)) map.set(uid, { ad: s.surucuAd || uid, plaka: s.plaka || "—", siparis: 0, palet: 0, kg: 0, teslim: 0 });
      const k = map.get(uid);
      k.siparis++;
      k.palet += Number(s.paletSayisi) || 0;
      k.kg += Number(s.toplamKg) || 0;
      if (s.durum === "teslim_edildi") k.teslim++;
    });

    tbody.innerHTML = Array.from(map.values())
      .sort((a, b) => b.siparis - a.siparis)
      .map((k) => `<tr>
        <td>${kacisEt(k.ad)}</td>
        <td class="cell-code">${kacisEt(k.plaka)}</td>
        <td>${k.siparis}</td>
        <td>${k.palet}</td>
        <td>${k.kg ? sayiBicimle(k.kg) + " KG" : "—"}</td>
        <td>${k.teslim > 0 ? `<span class="badge badge-green">${k.teslim}</span>` : "—"}</td>
      </tr>`).join("");
  } catch (err) {
    console.error(err);
    toast("Araç raporu yüklenemedi.", "error");
    tbody.innerHTML = "";
  }
});

/* ============================================================================
   GÜNLÜK ÖZET BANNER
   ============================================================================ */
async function gunlukOzetGoster(kullanicilar) {
  try {
    const siparisler = await tumSiparisleriGetir();
    const bekleyen = siparisler.filter((s) => s.durum === "toplaniyor").length;
    const kontrolde = siparisler.filter((s) => ["toplandi","kontrol_ediliyor"].includes(s.durum)).length;
    const sevkte = siparisler.filter((s) => s.durum === "sevk_edildi").length;
    const surucular = kullanicilar.filter((k) => k.rol === "surucu");
    const aktifSurucular = surucular.filter((k) =>
      siparisler.some((s) => s.surucuUid === k.uid && s.durum === "sevk_edildi")
    );

    const bugun = new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
    const banner = document.getElementById("gunlukOzetBanner");
    if (!banner) return;
    banner.classList.remove("u-hidden");
    banner.innerHTML = `
      <div style="font-size:13px;font-weight:700;margin-bottom:8px;">📋 Günlük Özet — ${bugun}</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px;">
        <span>⏳ Bekleyen: <b>${bekleyen}</b></span>
        <span>🔍 Kontrolde: <b>${kontrolde}</b></span>
        <span>🚚 Sevkte: <b>${sevkte}</b></span>
        <span>🚛 Aktif sürücü: <b>${aktifSurucular.length}/${surucular.length}</b>${aktifSurucular.length ? " (" + aktifSurucular.map(s => kacisEt(s.ad || s.plaka)).join(", ") + ")" : ""}</span>
      </div>`;
  } catch (err) { console.error("Günlük özet:", err); }
}

/* ============================================================================
   ROTA OPTİMİZASYONU (surucu.js'de kullanılır — burada yardımcı fonksiyonlar)
   ============================================================================ */
