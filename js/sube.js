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

  const gruplar = new Map();
  katalogCache.forEach((u) => {
    const kat = (u.kategori || "").trim() || "Diğer";
    if (!gruplar.has(kat)) gruplar.set(kat, []);
    gruplar.get(kat).push(u);
  });

  let tabloHtml = "";
  gruplar.forEach((urunler, kategori) => {
    tabloHtml += `<tr><td colspan="4" style="background:var(--color-surface-2);font-weight:700;font-size:12.5px;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-ink-soft);padding:8px 12px;">${kategori}</td></tr>`;
    tabloHtml += urunler.map((u) => `
      <tr data-uid="${u.id}">
        <td>
          <div style="font-weight:600;">${kacisEt(u.ad)}</div>
          ${u.aciklama ? `<div class="u-text-soft" style="font-size:12px;">${kacisEt(u.aciklama)}</div>` : ""}
        </td>
        <td>${kacisEt(u.birim || "")}</td>
        <td>${u.minMiktar ? sayiBicimle(u.minMiktar) : "—"}</td>
        <td>
          <input type="text" inputmode="decimal" class="cell-qty-input miktar-input"
            data-id="${u.id}" placeholder="0" style="width:80px;" />
        </td>
        <td>
          <input type="text" class="input aciklama-input" data-id="${u.id}"
            placeholder="Not…" style="min-width:120px;font-size:12.5px;" />
        </td>
      </tr>`).join("");
  });
  tbody.innerHTML = tabloHtml;

  let kartHtml = "";
  gruplar.forEach((urunler, kategori) => {
    kartHtml += `<div style="background:var(--color-surface-2);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-ink-soft);padding:8px 12px;border-radius:var(--radius-sm);margin:14px 0 6px;">${kategori}</div>`;
    kartHtml += urunler.map((u) => `
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
            <input type="text" inputmode="decimal" class="cell-qty-input miktar-input"
              data-id="${u.id}" placeholder="0" style="width:100px;" />
          </div>
          <div>
            <div class="row-card__label">Not / Açıklama</div>
            <input type="text" class="input aciklama-input" data-id="${u.id}"
              placeholder="İsteğe bağlı not…" style="font-size:12.5px;" />
          </div>
        </div>
      </div>`).join("");
  });
  kartlar.innerHTML = kartHtml;

  document.querySelectorAll(".miktar-input").forEach((input) => {
    input.addEventListener("input", miktar_degisti);
  });
  miktar_degisti();
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

function aciklamalariTopla() {
  const map = new Map();
  document.querySelectorAll(".aciklama-input[data-id]").forEach((input) => {
    if (input.value.trim()) map.set(input.dataset.id, input.value.trim());
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

  const aciklamaMap = aciklamalariTopla();
  const satirlar = katalogCache
    .filter((u) => miktarMap.has(u.id))
    .map((u) => ({ ...u, miktar: miktarMap.get(u.id), subeNotu: aciklamaMap.get(u.id) || "" }));

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
