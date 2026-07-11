// ============================================================================
// YÖNETİM PANELİ MANTIĞI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { kullanicilariDinle, kullaniciOlustur, kullaniciRolGuncelle, kullaniciSil } from "./kullanici-yonetimi.js";
import { katalogDinle, katalogUrunEkle, katalogUrunGuncelle, katalogUrunSil } from "./veri.js";
import { arayuzHazirla, toast, onayIste, kacisEt, tarihBicimle, ondalikOku, sayiBicimle } from "./utils.js";

arayuzHazirla();

const ROL_ETIKETI = { toplayici: "Toplayıcı", kontrolor: "Kontrolör", admin: "Admin", sube: "Şube" };
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
  return `
    <tr data-uid="${k.uid}">
      <td>${kacisEt(k.ad)}</td>
      <td class="cell-code">${kacisEt(k.eposta)}</td>
      <td>${rolSelectHtml(k)}</td>
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
        await kullaniciRolGuncelle(uid, rolSec.value);
        toast("Rol güncellendi.", "success");
      });
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
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="field" id="ykSubeAdiAlani">
          <label>Şube Adı</label>
          <input class="input" id="ykSubeAdi" placeholder="Örn. Bozüyük Şubesi" />
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
  const guncelle = () => { subeAdiAlani.classList.toggle("u-hidden", rolSec.value !== "sube"); };
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
    if (rol === "sube" && !subeAdi) {
      toast("Şube rolü için şube adı girilmeli.", "error");
      return;
    }
    try {
      const ekstraAlanlar = rol === "sube" ? { subeAdi } : {};
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
