// ============================================================================
// YÖNETİM PANELİ MANTIĞI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { kullanicilariDinle, kullaniciOlustur, kullaniciRolGuncelle, kullaniciSil } from "./kullanici-yonetimi.js";
import { arayuzHazirla, toast, onayIste, kacisEt, tarihBicimle } from "./utils.js";

arayuzHazirla();

const ROL_ETIKETI = { toplayici: "Toplayıcı", kontrolor: "Kontrolör", admin: "Admin" };
const HATA_MESAJLARI = {
  "auth/email-already-in-use": "Bu e-posta adresiyle zaten bir hesap var.",
  "auth/invalid-email": "E-posta adresi geçerli değil.",
  "auth/weak-password": "Şifre en az 6 karakter olmalı."
};

let mevcutKullanici = null;
let kullaniciListesi = [];

sayfaKorumasi(["admin"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  kullanicilariDinle((liste) => {
    kullaniciListesi = liste.sort((a, b) => (a.ad || "").localeCompare(b.ad || ""));
    render();
  });
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

function render() {
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
document.getElementById("yeniKullaniciBtn").addEventListener("click", () => {
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
            <option value="admin">Admin</option>
          </select>
        </div>
        <p style="font-size:12px;">Bu e-posta ve şifreyi personele siz iletmeniz gerekiyor.</p>
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
    const ad = document.getElementById("ykAd").value.trim();
    const eposta = document.getElementById("ykEposta").value.trim();
    const sifre = document.getElementById("ykSifre").value;
    const rol = document.getElementById("ykRol").value;
    if (!ad || !eposta || sifre.length < 6) {
      toast("Lütfen ad, e-posta girin ve en az 6 karakterli bir şifre belirleyin.", "error");
      return;
    }
    try {
      await kullaniciOlustur({ ad, eposta, sifre, rol });
      kapat();
      toast(`${ad} eklendi.`, "success");
    } catch (err) {
      console.error(err);
      toast(HATA_MESAJLARI[err.code] || "Kullanıcı oluşturulurken hata oluştu.", "error");
    }
  };
});
