// ============================================================================
// ŞUBE SİPARİŞ EKRANI MANTIĞI
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { katalogDinle, subeSimarisiOlustur } from "./veri.js";
import { arayuzHazirla, toast, onayIste, ondalikOku, sayiBicimle, kacisEt } from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;
let katalogCache = [];

sayfaKorumasi(["sube"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("subeEtiketi").textContent = kullanici.subeAdi || "Şube";
  document.getElementById("altBaslik").textContent =
    `${kullanici.subeAdi || "Şubeniz"} için sipariş oluşturun. Boş bıraktıklarınız eklenmez.`;
  katalogDinle(katalogGuncellendi);
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

function katalogGuncellendi(liste) {
  katalogCache = liste.filter((u) => u.aktif !== false); // pasife alınanları gösterme
  document.getElementById("yukleniyorAlani").classList.add("u-hidden");

  if (katalogCache.length === 0) {
    document.getElementById("bosKatalog").classList.remove("u-hidden");
    document.getElementById("katalogAlani").classList.add("u-hidden");
    return;
  }
  document.getElementById("bosKatalog").classList.add("u-hidden");
  document.getElementById("katalogAlani").classList.remove("u-hidden");
  renderKatalog();
}

function renderKatalog() {
  const tbody = document.getElementById("katalogGovde");
  const kartlar = document.getElementById("katalogKartlar");

  tbody.innerHTML = katalogCache.map((u) => `
    <tr data-uid="${u.id}">
      <td>
        <div style="font-weight:600;">${kacisEt(u.ad)}</div>
        ${u.aciklama ? `<div class="u-text-soft" style="font-size:12px;">${kacisEt(u.aciklama)}</div>` : ""}
      </td>
      <td>${kacisEt(u.birim || "")}</td>
      <td>${u.minMiktar ? sayiBicimle(u.minMiktar) : "—"}</td>
      <td>
        <input type="text" inputmode="decimal"
          class="cell-qty-input miktar-input"
          data-id="${u.id}"
          placeholder="0"
          style="width:80px;"
        />
      </td>
    </tr>`).join("");

  kartlar.innerHTML = katalogCache.map((u) => `
    <div class="row-card" data-uid="${u.id}">
      <div class="row-card__top">
        <div>
          <div class="row-card__name">${kacisEt(u.ad)}</div>
          ${u.aciklama ? `<div class="row-card__code">${kacisEt(u.aciklama)}</div>` : ""}
        </div>
        <span class="badge badge-gray">${kacisEt(u.birim || "")}</span>
      </div>
      <div class="row-card__grid" style="margin-top:8px;">
        ${u.minMiktar ? `<div><div class="row-card__label">Min. Miktar</div>${sayiBicimle(u.minMiktar)} ${kacisEt(u.birim || "")}</div>` : ""}
        <div>
          <div class="row-card__label">Sipariş Miktarı</div>
          <input type="text" inputmode="decimal"
            class="cell-qty-input miktar-input"
            data-id="${u.id}"
            placeholder="0"
            style="width:100px;"
          />
        </div>
      </div>
    </div>`).join("");

  // Herhangi bir miktar girilince butonu aktif et
  document.querySelectorAll(".miktar-input").forEach((input) => {
    input.addEventListener("input", miktar_degisti);
  });
  miktar_degisti();
}

function miktar_degisti() {
  const herhangi = Array.from(document.querySelectorAll(".miktar-input"))
    .some((i) => ondalikOku(i.value) > 0);
  document.getElementById("siparisGonderBtn").disabled = !herhangi;
}

function miktarlariTopla() {
  const map = new Map();
  document.querySelectorAll(".miktar-input[data-id]").forEach((input) => {
    const id = input.dataset.id;
    const miktar = ondalikOku(input.value);
    if (miktar > 0) map.set(id, miktar);
  });
  return map;
}

document.getElementById("siparisGonderBtn").addEventListener("click", async () => {
  const miktarMap = miktarlariTopla();
  if (miktarMap.size === 0) { toast("En az bir üründe miktar girin.", "error"); return; }

  // Minimum miktar kontrolü
  const altindaKalan = katalogCache.filter((u) => {
    const giris = miktarMap.get(u.id) || 0;
    return giris > 0 && u.minMiktar && giris < u.minMiktar;
  });
  if (altindaKalan.length > 0) {
    const uyari = altindaKalan.map((u) => `${u.ad}: min ${sayiBicimle(u.minMiktar)} ${u.birim || ""}`).join(", ");
    const devam = await onayIste({
      baslik: "Minimum Miktar Uyarısı",
      metin: `Şu ürünlerde minimum miktarın altında giriş yaptınız: ${uyari}. Yine de göndermek istiyor musunuz?`,
      onayMetni: "Evet, gönder"
    });
    if (!devam) return;
  }

  const satirlar = katalogCache
    .filter((u) => miktarMap.has(u.id))
    .map((u) => ({ ...u, miktar: miktarMap.get(u.id) }));

  const btn = document.getElementById("siparisGonderBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Gönderiliyor…';

  try {
    await subeSimarisiOlustur({
      subeAdi: mevcutKullanici.subeAdi || mevcutKullanici.ad,
      subeId: mevcutKullanici.uid,
      olusturan: mevcutKullanici.uid,
      satirlar
    });
    // Tüm giriş kutularını sıfırla
    document.querySelectorAll(".miktar-input").forEach((i) => { i.value = ""; });
    btn.disabled = true;
    btn.innerHTML = "Siparişi Gönder";
    toast("✅ Sipariş gönderildi! Depo tarafında hazırlanmaya başlandı.", "success", 5000);
  } catch (err) {
    console.error(err);
    toast("Sipariş gönderilemedi: " + (err.message || err), "error");
    btn.disabled = false;
    btn.innerHTML = "Siparişi Gönder";
  }
});
