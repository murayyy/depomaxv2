// ============================================================================
// GÜNLÜK SAYIM — merkez listeyi hazırlar/onaylar, şube kör sayar
//   sayimlar/{id}      : liste + şubenin saydığı miktarlar (Mikro stoğu YOK)
//   sayimFarklari/{id} : sunucunun hesapladığı Mikro stoğu ve farklar (sadece admin)
// Durumlar: oneri_bekleniyor -> hazirlaniyor -> sayimda -> gonderildi -> inceleme
//           (-> tekrar -> gonderildi -> inceleme) -> onaylandi | iptal
// ============================================================================
import { auth, signOut, sayfaKorumasi, db } from "./firebase.js";
import { katalogDinle } from "./veri.js?v=20261112";
import { arayuzHazirla, toast, onayIste, kacisEt, sayiBicimle, ondalikOku } from "./utils.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

arayuzHazirla();

const SAYIMLAR = "sayimlar";
const FARKLAR = "sayimFarklari";
const DURUM = {
  oneri_bekleniyor:   { etiket: "⏳ Liste öneriliyor", sinif: "badge-gray" },
  oneri_hazirlaniyor: { etiket: "⏳ Liste öneriliyor", sinif: "badge-gray" },
  hazirlaniyor:       { etiket: "✏ Hazırlanıyor", sinif: "badge-amber" },
  sayimda:            { etiket: "📋 Şubede sayılıyor", sinif: "badge-blue" },
  tekrar:             { etiket: "🔁 Tekrar sayılıyor", sinif: "badge-blue" },
  gonderildi:         { etiket: "⏳ Fark hesaplanıyor", sinif: "badge-gray" },
  hesaplaniyor:       { etiket: "⏳ Fark hesaplanıyor", sinif: "badge-gray" },
  inceleme:           { etiket: "🔍 Onay bekliyor", sinif: "badge-amber" },
  onaylandi:          { etiket: "✅ Onaylandı", sinif: "badge-green" },
  iptal:              { etiket: "İptal", sinif: "badge-gray" }
};
const rozet = (d) => { const x = DURUM[d] || { etiket: d, sinif: "badge-gray" }; return `<span class="badge ${x.sinif}">${x.etiket}</span>`; };
const bugunStr = () => { const t = new Date(); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 10); };
const tarihGoster = (s) => (s ? s.split("-").reverse().join(".") : "—");
const sayiYaz = (n) => (n === null || n === undefined || n === "" ? "—" : sayiBicimle(n));
function geciktir(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

let ben = null;
const modalRoot = document.getElementById("modalRoot");
const modalKapat = () => { modalRoot.innerHTML = ""; acikModalIptal?.(); acikModalIptal = null; };
let acikModalIptal = null;

sayfaKorumasi(["sube", "admin"], (k) => {
  ben = k;
  document.getElementById("kullaniciAdi").textContent = k.ad || k.uid;
  document.getElementById("rolEtiketi").textContent = k.rol;
  if (k.rol === "admin") merkezBaslat();
  else { document.getElementById("geriLink").href = "sube.html"; subeBaslat(); }
});
document.getElementById("cikisBtn").addEventListener("click", async () => { await signOut(auth); location.href = "index.html"; });

/* =====================================================================
   MERKEZ
   ===================================================================== */
let gunAbonelik = null;
let gunSayimlari = [];
let katalog = [];

function merkezBaslat() {
  document.getElementById("merkezBloku").classList.remove("u-hidden");
  const gun = document.getElementById("gunSec");
  gun.value = bugunStr();
  gun.addEventListener("change", gunDinle);
  gunDinle();
  katalogDinle((l) => { katalog = l || []; });
  document.getElementById("listeOlusturBtn").addEventListener("click", listeOlusturModal);
  document.querySelectorAll("[data-msekme]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-msekme]").forEach((x) => x.classList.toggle("is-active", x === b));
    document.getElementById("gunBloku").classList.toggle("u-hidden", b.dataset.msekme !== "gun");
    document.getElementById("raporBloku").classList.toggle("u-hidden", b.dataset.msekme !== "rapor");
    if (b.dataset.msekme === "rapor") raporYukle();
  }));
  document.getElementById("raporYenile").addEventListener("click", raporYukle);
  document.getElementById("raporGun").addEventListener("change", raporYukle);
}

function gunDinle() {
  gunAbonelik?.();
  const gun = document.getElementById("gunSec").value || bugunStr();
  gunAbonelik = onSnapshot(query(collection(db, SAYIMLAR), where("tarih", "==", gun)), (snap) => {
    gunSayimlari = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.subeAdi || "").localeCompare(b.subeAdi || "", "tr"));
    gunCiz();
  }, (e) => toast("Sayımlar okunamadı: " + e.code, "error"));
}

function gunCiz() {
  const kutu = document.getElementById("gunListe");
  document.getElementById("gunBos").classList.toggle("u-hidden", gunSayimlari.length > 0);
  const say = (d) => gunSayimlari.filter((s) => d.includes(s.durum)).length;
  document.getElementById("merkezOzet").textContent = gunSayimlari.length
    ? `${gunSayimlari.length} şube · ${say(["sayimda", "tekrar"])} sayılıyor · ${say(["inceleme"])} onay bekliyor · ${say(["onaylandi"])} onaylandı`
    : tarihGoster(document.getElementById("gunSec").value);
  kutu.innerHTML = gunSayimlari.map((s) => {
    const k = s.kalemler || [];
    const sayilan = k.filter((x) => x.sayilan !== null && x.sayilan !== undefined).length;
    const mikro = s.mikroSayim ? (s.mikroSayim.durum === "tamam" ? ` <span class="badge badge-green">Mikro ${kacisEt(s.mikroSayim.evrak || "")}</span>`
      : s.mikroSayim.durum === "hata" ? ` <span class="badge badge-red" title="${kacisEt(s.mikroSayim.mesaj || "")}">⚠ Mikro</span>` : ` <span class="badge badge-amber">⏳ Mikro</span>`) : "";
    return `<div class="say-kart">
      <div>
        <div class="say-kart__ad">${kacisEt(s.subeAdi || "—")} ${rozet(s.durum)}${mikro}</div>
        <div class="say-kart__meta">${k.length} ürün · ${sayilan} sayıldı${s.sunucuMesaj ? ` · <span style="color:#B45309;">⚠ ${kacisEt(s.sunucuMesaj)}</span>` : ""}</div>
      </div>
      <button class="btn btn-ghost btn-sm" data-ac="${s.id}">Aç →</button>
    </div>`;
  }).join("");
  kutu.querySelectorAll("[data-ac]").forEach((b) => b.addEventListener("click", () => sayimModalAc(b.dataset.ac)));
}

async function listeOlusturModal() {
  const gun = document.getElementById("gunSec").value || bugunStr();
  let subeler = [];
  try {
    const snap = await getDocs(query(collection(db, "kullanicilar"), where("rol", "==", "sube")));
    subeler = snap.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => (a.subeAdi || a.ad || "").localeCompare(b.subeAdi || b.ad || "", "tr"));
  } catch (e) { toast("Şubeler okunamadı: " + e.code, "error"); return; }
  const mevcut = new Set(gunSayimlari.filter((s) => s.durum !== "iptal").map((s) => s.subeId));
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop"><div class="modal" style="max-width:480px;">
      <h3>✨ Akıllı Sayım Listesi — ${tarihGoster(gun)}</h3>
      <p style="font-size:13px;color:var(--color-ink-soft);">Sistem her şube için şunları önerir: Mikro'da eksi stoğa düşenler, son 7 günde teslimatta fark çıkanlar ve sırası gelen ürünler (çok satanlar haftada bir, orta satanlar 2 haftada bir, az satanlar ayda bir). Listeyi göndermeden önce düzenleyebilirsiniz.</p>
      <div class="field"><label>Şube başına en fazla ürün</label><input class="input" id="oneriAdet" type="number" min="1" max="200" value="10" /></div>
      <div style="display:flex;gap:8px;margin-bottom:6px;"><button class="btn btn-ghost btn-sm" id="hepsiSec">Tümünü seç</button><button class="btn btn-ghost btn-sm" id="hicbiri">Temizle</button></div>
      <div style="max-height:320px;overflow:auto;border:1px solid var(--color-border);border-radius:8px;padding:6px 10px;">
        ${subeler.map((s) => {
          const var_ = mevcut.has(s.uid);
          return `<label style="display:flex;gap:8px;align-items:center;padding:6px 0;${var_ ? "opacity:.5;" : ""}">
            <input type="checkbox" data-sube="${s.uid}" ${var_ ? "disabled" : s.franchisee ? "" : "checked"} />
            ${kacisEt(s.subeAdi || s.ad || s.uid)} ${s.franchisee ? '<span class="badge badge-gray">Franchise</span>' : ""} ${var_ ? '<span class="badge badge-gray">bugün var</span>' : ""}
          </label>`;
        }).join("") || "<div class='u-text-soft'>Şube kullanıcısı yok.</div>"}
      </div>
      <div class="modal__actions"><button class="btn btn-ghost" data-role="iptal">Vazgeç</button><button class="btn btn-primary" data-role="olustur">Oluştur</button></div>
    </div></div>`;
  modalRoot.querySelector('[data-role="iptal"]').onclick = modalKapat;
  modalRoot.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") modalKapat(); };
  modalRoot.querySelector("#hepsiSec").onclick = () => modalRoot.querySelectorAll("[data-sube]:not(:disabled)").forEach((c) => { c.checked = true; });
  modalRoot.querySelector("#hicbiri").onclick = () => modalRoot.querySelectorAll("[data-sube]").forEach((c) => { c.checked = false; });
  modalRoot.querySelector('[data-role="olustur"]').onclick = async () => {
    const adet = Math.max(1, Math.min(200, parseInt(modalRoot.querySelector("#oneriAdet").value) || 10));
    const secilen = [...modalRoot.querySelectorAll("[data-sube]:checked")].map((c) => subeler.find((s) => s.uid === c.dataset.sube));
    if (!secilen.length) { toast("Şube seçin.", "error"); return; }
    try {
      await Promise.all(secilen.map((s) => addDoc(collection(db, SAYIMLAR), {
        tarih: gun, subeId: s.uid, subeAdi: s.subeAdi || s.ad || "", durum: "oneri_bekleniyor", acik: false,
        oneriAdet: adet, kalemler: [], olusturan: ben.ad || ben.uid, olusturmaTarihi: serverTimestamp()
      })));
      toast(`${secilen.length} şube için liste öneriliyor…`, "success");
      modalKapat();
    } catch (e) { toast("Oluşturulamadı: " + e.code, "error"); }
  };
}

function sayimModalAc(id) {
  modalKapat();
  duzenKalemler = null;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-role="backdrop"><div class="modal genis"><div id="smIcerik">⏳</div></div></div>`;
  modalRoot.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") modalKapat(); };
  let fark = null, farkIptal = null;
  const iptal = onSnapshot(doc(db, SAYIMLAR, id), (snap) => {
    if (!snap.exists()) { modalKapat(); return; }
    const s = { id, ...snap.data() };
    if (["inceleme", "onaylandi"].includes(s.durum) && !farkIptal) {
      farkIptal = onSnapshot(doc(db, FARKLAR, id), (f) => { fark = f.exists() ? f.data() : null; if (document.getElementById("smIcerik")) sayimCiz(s, fark); });
    }
    sayimCiz(s, fark);
  });
  acikModalIptal = () => { iptal(); farkIptal?.(); };
}

function baslikHtml(s) {
  return `<div class="u-flex" style="justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
    <div><h3 style="margin:0;">${kacisEt(s.subeAdi)} — ${tarihGoster(s.tarih)}</h3>
      <div style="margin-top:6px;">${rozet(s.durum)} ${s.depo ? `<span class="u-text-soft" style="font-size:12px;">Mikro depo ${s.depo}</span>` : ""}</div>
      ${s.sunucuMesaj ? `<div style="color:#B45309;font-size:12.5px;margin-top:6px;">⚠ ${kacisEt(s.sunucuMesaj)}</div>` : ""}
    </div>
    <button class="btn btn-ghost btn-sm" data-role="kapat">✕ Kapat</button>
  </div>`;
}

let duzenKalemler = null; // hazırlanırken yerel kopya
function sayimCiz(s, fark) {
  const kutu = document.getElementById("smIcerik");
  if (!kutu) return;
  const kalemler = s.kalemler || [];
  let govde = "";

  if (["oneri_bekleniyor", "oneri_hazirlaniyor"].includes(s.durum)) {
    govde = `<p class="u-text-soft">Listeyi Mikro'ya bağlı sunucu (API) hazırlar; birkaç saniye sürer. Uzun süre bu ekranda kalıyorsa API çalışmıyor ya da yeni dosyalarla yeniden başlatılmamış demektir — API penceresinde "[Sayım]" satırlarına bakın.</p>
      <div class="modal__actions"><button class="btn btn-danger" data-is="sil">Sil</button><button class="btn btn-ghost" data-is="elle">Öneriyi bekleme, elle hazırla</button></div>`;
  } else if (s.durum === "hazirlaniyor") {
    if (!duzenKalemler || duzenKalemler.id !== s.id) duzenKalemler = { id: s.id, liste: kalemler.map((k) => ({ ...k })) };
    const l = duzenKalemler.liste;
    govde = `
      <div class="u-text-soft" style="font-size:12.5px;margin:10px 0;">${l.length} ürün. Şube Mikro stoğunu görmeyecek, sadece ürünü sayacak.</div>
      <datalist id="smKatalog">${katalog.map((u) => `<option value="${kacisEt(u.kod || u.stokKodu || u.id)}">${kacisEt(u.ad || "")}</option>`).join("")}</datalist>
      <div class="u-flex" style="gap:6px;margin-bottom:8px;flex-wrap:wrap;">
        <input class="input" id="smEkleKod" list="smKatalog" placeholder="Stok kodu ekle" style="max-width:220px;" autocomplete="off" />
        <button class="btn btn-ghost btn-sm" id="smEkle">+ Ekle</button>
      </div>
      <div style="max-height:52vh;overflow:auto;">
        ${l.map((k, i) => `<div class="liste-satir">
          <span class="u-mono" style="font-size:12px;">${kacisEt(k.kod)}</span>
          <span>${kacisEt(k.ad)} <span class="sebep">· ${kacisEt(k.sebep || "")}</span></span>
          <span class="u-text-soft" style="font-size:12px;">${kacisEt(k.birim || "")}</span>
          <button class="btn btn-ghost btn-sm" data-cikar="${i}">✕</button>
        </div>`).join("") || "<div class='u-text-soft' style='padding:10px 0;'>Liste boş. Ürün ekleyin.</div>"}
      </div>
      <div class="modal__actions">
        <button class="btn btn-danger" data-is="sil">Sil</button>
        <button class="btn btn-ghost" data-is="kaydet">Kaydet</button>
        <button class="btn btn-primary" data-is="gonder">📤 Şubeye Gönder</button>
      </div>`;
  } else if (["sayimda", "tekrar"].includes(s.durum)) {
    const hedef = s.durum === "tekrar" ? kalemler.filter((k) => k.tekrar) : kalemler;
    const sayilan = hedef.filter((k) => k.sayilan !== null && k.sayilan !== undefined).length;
    govde = `<p style="margin:12px 0;">Şube sayıyor: <b>${sayilan} / ${hedef.length}</b> ürün girildi.</p>
      <div class="modal__actions"><button class="btn btn-ghost" data-is="gericek">↩ Geri çek (düzenle)</button></div>`;
  } else if (["gonderildi", "hesaplaniyor"].includes(s.durum)) {
    govde = `<p class="u-text-soft" style="margin:12px 0;">Şube sayımı gönderdi. Sunucu Mikro'daki şube stoğunu okuyup farkları hesaplıyor…</p>`;
  } else if (["inceleme", "onaylandi"].includes(s.durum)) {
    govde = fark ? farkTablosu(s, fark) : `<p class="u-text-soft">Farklar yükleniyor…</p>`;
  } else {
    govde = `<p class="u-text-soft">Bu sayım iptal edildi.</p>`;
  }
  kutu.innerHTML = baslikHtml(s) + govde;
  kutu.querySelector('[data-role="kapat"]').onclick = modalKapat;
  sayimOlaylari(s, fark);
}

function farkTablosu(s, f) {
  const sadeceFark = kutuDurumu.sadeceFark;
  const satirlar = (f.kalemler || []).map((k, i) => ({ ...k, i })).filter((k) => !sadeceFark || k.fark);
  const mikro = s.mikroSayim;
  return `
    <div class="u-flex" style="gap:14px;flex-wrap:wrap;margin:12px 0;font-size:13px;">
      <span>Farklı ürün: <b>${f.farkliKalem || 0}</b> / ${(f.kalemler || []).length}</span>
      <span>Fark tutarı: <b class="${(f.toplamTutar || 0) < 0 ? "fark-eksi" : "fark-arti"}">${sayiBicimle(f.toplamTutar || 0)} TL</b></span>
      <span class="u-text-soft">Mikro stoğu ${tarihGoster(f.stokTarihi || s.tarih)} gün sonu itibarıyla${f.hesapZamani?.toDate ? ` · hesap: ${f.hesapZamani.toDate().toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</span>
      <label style="margin-left:auto;"><input type="checkbox" id="sadeceFark" ${sadeceFark ? "checked" : ""} /> Sadece farklılar</label>
    </div>
    <div class="table-wrap" style="max-height:50vh;overflow:auto;"><table class="data-table">
      <thead><tr>${s.durum === "inceleme" ? "<th></th>" : ""}<th>Kod</th><th>Ürün</th><th class="sayi">Sayılan</th><th class="sayi">Mikro</th><th class="sayi">Fark</th><th class="sayi">Tutar</th></tr></thead>
      <tbody>${satirlar.map((k) => `<tr>
        ${s.durum === "inceleme" ? `<td><input type="checkbox" data-tekrar="${k.i}" ${k.fark ? "" : ""}/></td>` : ""}
        <td class="cell-code">${kacisEt(k.kod)}</td><td>${kacisEt(k.ad)}${(s.kalemler || [])[k.i]?.sayilanOnceki !== undefined ? ` <span class="sebep">(ilk sayım ${sayiYaz(s.kalemler[k.i].sayilanOnceki)})</span>` : ""}</td>
        <td class="sayi">${sayiYaz(k.sayilan)} ${kacisEt(k.birim || "")}</td><td class="sayi">${sayiYaz(k.mikro)}</td>
        <td class="sayi ${k.fark > 0 ? "fark-arti" : k.fark < 0 ? "fark-eksi" : ""}">${k.fark ? (k.fark > 0 ? "+" : "") + sayiBicimle(k.fark) : "—"}</td>
        <td class="sayi">${k.tutar ? sayiBicimle(k.tutar) : "—"}</td></tr>`).join("") || `<tr><td colspan="7" class="u-text-soft">Fark yok.</td></tr>`}</tbody>
    </table></div>
    ${s.durum === "inceleme" ? `
      <div class="modal__actions" style="flex-wrap:wrap;">
        <button class="btn btn-danger" data-is="iptal">İptal Et</button>
        <button class="btn btn-ghost" data-is="yeniden" title="Şubenin satışları Mikro'ya sonradan aktarıldıysa farkı yeniden hesaplatır">↻ Farkı Yeniden Hesapla</button>
        <button class="btn btn-ghost" data-is="tekrar">🔁 Seçilenleri Tekrar Saydır</button>
        <button class="btn btn-green" data-is="onayla">✅ Onayla — Mikro'ya sayım fişi yaz</button>
      </div>` : `
      <div style="margin-top:12px;font-size:13px;">
        ${mikro?.durum === "tamam" ? `✅ Mikro'ya yazıldı: <b>${kacisEt(mikro.evrak || "")}</b>`
          : mikro?.durum === "hata" ? `<span style="color:#DC2626;">⚠ Mikro'ya yazılamadı: ${kacisEt(mikro.mesaj || "")}</span> <button class="btn btn-ghost btn-sm" data-is="mikrotekrar">Tekrar dene</button>`
          : "⏳ Mikro'ya yazılıyor…"}
      </div>`}`;
}
const kutuDurumu = { sadeceFark: true };

function sayimOlaylari(s, fark) {
  const kutu = document.getElementById("smIcerik");
  const is = (ad) => kutu.querySelector(`[data-is="${ad}"]`);
  const guncelle = async (patch, mesaj) => {
    try { await updateDoc(doc(db, SAYIMLAR, s.id), { ...patch, guncelleyen: ben.ad || ben.uid, guncellemeTarihi: serverTimestamp() }); if (mesaj) toast(mesaj, "success"); }
    catch (e) { toast("Kaydedilemedi: " + (e.code || e.message), "error"); }
  };

  is("sil") && (is("sil").onclick = async () => {
    if (!(await onayIste({ baslik: "Sayımı sil", metin: `${s.subeAdi} sayımı silinecek.`, onayMetni: "Sil", tehlikeli: true }))) return;
    try { await deleteDoc(doc(db, SAYIMLAR, s.id)); toast("Silindi.", "info"); } catch (e) { toast("Silinemedi: " + e.code, "error"); }
  });

  if (s.durum === "hazirlaniyor") {
    const l = duzenKalemler.liste;
    kutu.querySelectorAll("[data-cikar]").forEach((b) => b.onclick = () => { l.splice(Number(b.dataset.cikar), 1); sayimCiz({ ...s, kalemler: l }, fark); });
    const ekle = () => {
      const kod = kutu.querySelector("#smEkleKod").value.trim();
      if (!kod) return;
      if (l.some((k) => k.kod === kod)) { toast("Bu ürün listede var.", "info"); return; }
      const u = katalog.find((x) => String(x.kod || x.stokKodu || x.id) === kod);
      if (!u) { toast("Katalogda bu kod yok.", "error"); return; }
      l.push({ kod, ad: u.ad || "", birim: u.birim || "", barkod: u.barkod || "", sebep: "Merkez ekledi", sayilan: null });
      sayimCiz({ ...s, kalemler: l }, fark);
      document.getElementById("smEkleKod")?.focus();
    };
    is("kaydet").onclick = () => guncelle({ kalemler: l }, "Liste kaydedildi.");
    kutu.querySelector("#smEkle").onclick = ekle;
    kutu.querySelector("#smEkleKod").addEventListener("keydown", (e) => { if (e.key === "Enter") ekle(); });
    is("gonder").onclick = async () => {
      if (!l.length) { toast("Liste boş.", "error"); return; }
      await guncelle({ kalemler: l.map((k) => ({ ...k, sayilan: null, tekrar: false })), durum: "sayimda", acik: true, gonderimMerkez: serverTimestamp() }, "Şubeye gönderildi.");
      duzenKalemler = null;
    };
  }
  is("elle") && (is("elle").onclick = () => guncelle({ durum: "hazirlaniyor", sunucuMesaj: "" }, "Listeyi elle hazırlayabilirsiniz."));
  is("gericek") && (is("gericek").onclick = async () => {
    if (!(await onayIste({ baslik: "Geri çek", metin: "Liste şubeden geri alınacak; şubenin girdiği miktarlar silinmez.", onayMetni: "Geri çek" }))) return;
    guncelle({ durum: "hazirlaniyor", acik: false }, "Geri çekildi.");
  });

  const sf = kutu.querySelector("#sadeceFark");
  sf && (sf.onchange = () => { kutuDurumu.sadeceFark = sf.checked; sayimCiz(s, fark); });

  is("tekrar") && (is("tekrar").onclick = async () => {
    const sec = [...kutu.querySelectorAll("[data-tekrar]:checked")].map((c) => Number(c.dataset.tekrar));
    if (!sec.length) { toast("Tekrar sayılacak ürünleri işaretleyin.", "error"); return; }
    const kalemler = (s.kalemler || []).map((k, i) => sec.includes(i)
      ? { ...k, tekrar: true, sayilanOnceki: k.sayilan, sayilan: null }
      : { ...k, tekrar: false });
    await guncelle({ kalemler, durum: "tekrar", acik: true }, `${sec.length} ürün tekrar sayılmak üzere şubeye gönderildi.`);
  });
  is("onayla") && (is("onayla").onclick = async () => {
    if (!(await onayIste({ baslik: "Sayımı onayla", metin: `${s.subeAdi} sayımı onaylanacak ve şubenin saydığı miktarlar Mikro'ya sayım sonuçları fişi olarak yazılacak.`, onayMetni: "Onayla" }))) return;
    guncelle({ durum: "onaylandi", acik: false, onaylayan: ben.ad || ben.uid, onayTarihi: serverTimestamp(),
      mikroSayim: { durum: "bekliyor", istekTarihi: new Date() } }, "Onaylandı.");
  });
  is("iptal") && (is("iptal").onclick = async () => {
    if (!(await onayIste({ baslik: "Sayımı iptal et", metin: "Sayım iptal edilecek, Mikro'ya yazılmayacak.", onayMetni: "İptal et", tehlikeli: true }))) return;
    guncelle({ durum: "iptal", acik: false }, "İptal edildi.");
  });
  is("yeniden") && (is("yeniden").onclick = () => guncelle({ durum: "gonderildi" }, "Fark yeniden hesaplanıyor…"));
  is("mikrotekrar") && (is("mikrotekrar").onclick = () => guncelle({ mikroSayim: { durum: "bekliyor", istekTarihi: new Date() } }, "Tekrar deneniyor."));
}

async function raporYukle() {
  const kutu = document.getElementById("raporIcerik");
  kutu.innerHTML = "⏳";
  const gunSayisi = parseInt(document.getElementById("raporGun").value) || 30;
  const sinir = new Date(Date.now() - gunSayisi * 864e5);
  sinir.setMinutes(sinir.getMinutes() - sinir.getTimezoneOffset());
  try {
    const snap = await getDocs(query(collection(db, FARKLAR), where("tarih", ">=", sinir.toISOString().slice(0, 10))));
    const kayitlar = snap.docs.map((d) => d.data());
    if (!kayitlar.length) { kutu.innerHTML = `<div class="empty-state"><div class="empty-state__title">Bu aralıkta sayım yok</div></div>`; return; }
    const sube = new Map(), urun = new Map();
    kayitlar.forEach((f) => {
      const s = sube.get(f.subeAdi) || { ad: f.subeAdi, sayim: 0, kalem: 0, farkli: 0, tutar: 0 };
      s.sayim++; s.kalem += (f.kalemler || []).length; s.farkli += f.farkliKalem || 0; s.tutar += f.toplamTutar || 0;
      sube.set(f.subeAdi, s);
      (f.kalemler || []).forEach((k) => {
        if (!k.fark) return;
        const u = urun.get(k.kod) || { kod: k.kod, ad: k.ad, kez: 0, tutar: 0, subeler: new Set() };
        u.kez++; u.tutar += k.tutar || 0; u.subeler.add(f.subeAdi);
        urun.set(k.kod, u);
      });
    });
    const subeler = [...sube.values()].sort((a, b) => a.tutar - b.tutar);
    const urunler = [...urun.values()].sort((a, b) => a.tutar - b.tutar).slice(0, 30);
    kutu.innerHTML = `
      <h3 style="margin:6px 0 10px;">Şubeler</h3>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Şube</th><th class="sayi">Sayım</th><th class="sayi">Sayılan ürün</th><th class="sayi">Farklı</th><th class="sayi">Fark oranı</th><th class="sayi">Fark tutarı</th></tr></thead>
      <tbody>${subeler.map((s) => `<tr><td>${kacisEt(s.ad)}</td><td class="sayi">${s.sayim}</td><td class="sayi">${s.kalem}</td><td class="sayi">${s.farkli}</td>
        <td class="sayi">${s.kalem ? Math.round((s.farkli / s.kalem) * 100) : 0}%</td><td class="sayi ${s.tutar < 0 ? "fark-eksi" : "fark-arti"}">${sayiBicimle(Math.round(s.tutar * 100) / 100)}</td></tr>`).join("")}</tbody></table></div>
      <h3 style="margin:18px 0 10px;">En çok fark veren ürünler</h3>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Kod</th><th>Ürün</th><th class="sayi">Kaç kez</th><th>Şubeler</th><th class="sayi">Toplam tutar</th></tr></thead>
      <tbody>${urunler.map((u) => `<tr><td class="cell-code">${kacisEt(u.kod)}</td><td>${kacisEt(u.ad)}</td><td class="sayi">${u.kez}</td>
        <td style="font-size:12px;">${kacisEt([...u.subeler].join(", "))}</td><td class="sayi ${u.tutar < 0 ? "fark-eksi" : "fark-arti"}">${sayiBicimle(Math.round(u.tutar * 100) / 100)}</td></tr>`).join("") || `<tr><td colspan="5" class="u-text-soft">Fark yok.</td></tr>`}</tbody></table></div>`;
  } catch (e) { kutu.innerHTML = ""; toast("Rapor okunamadı: " + (e.code || e.message), "error"); }
}

/* =====================================================================
   ŞUBE — kör sayım
   ===================================================================== */
let subeSayimlari = [];
let aktif = null;          // açık sayım (yerel kopya)
let aktifIptal = null;

function subeBaslat() {
  document.getElementById("subeBloku").classList.remove("u-hidden");
  onSnapshot(query(collection(db, SAYIMLAR), where("subeId", "==", ben.uid), where("acik", "==", true)), (snap) => {
    subeSayimlari = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.tarih || "").localeCompare(a.tarih || ""));
    subeListeCiz();
    if (aktif && !subeSayimlari.some((s) => s.id === aktif.id)) { toast("Bu sayım merkez tarafından geri alındı.", "info"); subeKapat(); }
  }, (e) => toast("Sayımlar okunamadı: " + e.code, "error"));
  document.getElementById("subeGeriBtn").addEventListener("click", async () => { await kaydetSimdi(); subeKapat(); });
  document.getElementById("sayimGonderBtn").addEventListener("click", sayimGonder);
  document.getElementById("subeAra").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); araVeGit(true); } });
  document.getElementById("subeAra").addEventListener("input", geciktir(() => araVeGit(false), 250));
}

function hedefKalemler(s) { return s.durum === "tekrar" ? (s.kalemler || []).filter((k) => k.tekrar) : (s.kalemler || []); }

function subeListeCiz() {
  const kutu = document.getElementById("subeListe");
  document.getElementById("subeBos").classList.toggle("u-hidden", subeSayimlari.length > 0);
  kutu.innerHTML = subeSayimlari.map((s) => {
    const h = hedefKalemler(s);
    const say = h.filter((k) => k.sayilan !== null && k.sayilan !== undefined).length;
    return `<div class="say-kart">
      <div><div class="say-kart__ad">📋 ${tarihGoster(s.tarih)} sayımı ${s.durum === "tekrar" ? '<span class="badge badge-amber">Tekrar sayım</span>' : ""}</div>
        <div class="say-kart__meta">${h.length} ürün · ${say} girildi</div></div>
      <button class="btn btn-primary btn-sm" data-say="${s.id}">${say ? "Devam et" : "Saymaya başla"} →</button>
    </div>`;
  }).join("");
  kutu.querySelectorAll("[data-say]").forEach((b) => b.addEventListener("click", () => subeAc(b.dataset.say)));
}

function subeAc(id) {
  const s = subeSayimlari.find((x) => x.id === id);
  if (!s) return;
  aktif = { id, durum: s.durum, tarih: s.tarih, kalemler: (s.kalemler || []).map((k) => ({ ...k })) };
  document.getElementById("subeListeGorunumu").classList.add("u-hidden");
  document.getElementById("subeSayimGorunumu").classList.remove("u-hidden");
  document.getElementById("sayimBaslik").textContent = `${tarihGoster(s.tarih)} sayımı`;
  document.getElementById("sayimAltBaslik").textContent = s.durum === "tekrar"
    ? "Merkez bu ürünlerin tekrar sayılmasını istedi. Dikkatle sayın."
    : "Raftaki miktarı sayıp yazın. Yoksa 0 yazın.";
  document.getElementById("subeAra").value = "";
  subeSatirCiz();
  window.scrollTo(0, 0);
}

function subeKapat() {
  aktif = null;
  document.getElementById("subeSayimGorunumu").classList.add("u-hidden");
  document.getElementById("subeListeGorunumu").classList.remove("u-hidden");
}

function subeSatirCiz() {
  const tekrar = aktif.durum === "tekrar";
  const kutu = document.getElementById("sayimSatirlar");
  kutu.innerHTML = aktif.kalemler.map((k, i) => (tekrar && !k.tekrar) ? "" : `
    <div class="say-satir ${k.sayilan !== null && k.sayilan !== undefined ? "dolu" : ""}" data-i="${i}">
      <div><div class="say-satir__ad">${kacisEt(k.ad)}</div>
        <div class="say-satir__alt">${kacisEt(k.kod)}${k.barkod ? " · " + kacisEt(k.barkod) : ""}</div></div>
      <div class="u-flex" style="gap:6px;align-items:center;">
        <input class="input" type="text" inputmode="decimal" data-miktar="${i}" value="${k.sayilan ?? ""}" placeholder="?" />
        <span style="font-size:12px;color:var(--color-ink-soft);min-width:28px;">${kacisEt(k.birim || "")}</span>
      </div>
    </div>`).join("");
  kutu.querySelectorAll("[data-miktar]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const i = Number(inp.dataset.miktar);
      const v = inp.value.trim();
      aktif.kalemler[i].sayilan = v === "" ? null : (ondalikOku(v) || 0);
      inp.closest(".say-satir").classList.toggle("dolu", v !== "");
      ilerlemeYaz();
      otomatikKaydet();
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const hepsi = [...kutu.querySelectorAll("[data-miktar]")];
        const sonraki = hepsi[hepsi.indexOf(inp) + 1];
        if (sonraki) sonraki.focus(); else document.getElementById("subeAra").focus();
      }
    });
  });
  ilerlemeYaz();
}

function ilerlemeYaz() {
  const h = hedefKalemler(aktif);
  const say = h.filter((k) => k.sayilan !== null && k.sayilan !== undefined).length;
  document.getElementById("sayimIlerleme").textContent = `${say} / ${h.length} ürün girildi`;
}

function araVeGit(odakla) {
  const q = document.getElementById("subeAra").value.trim().toLocaleLowerCase("tr");
  document.querySelectorAll(".say-satir.vurgu").forEach((x) => x.classList.remove("vurgu"));
  if (!q || !aktif) return;
  const tekrar = aktif.durum === "tekrar";
  const i = aktif.kalemler.findIndex((k) => (!tekrar || k.tekrar) && (
    (k.barkod && k.barkod.toLocaleLowerCase("tr") === q) || (k.kod || "").toLocaleLowerCase("tr") === q));
  const j = i >= 0 ? i : aktif.kalemler.findIndex((k) => (!tekrar || k.tekrar) && (
    (k.ad || "").toLocaleLowerCase("tr").includes(q) || (k.kod || "").toLocaleLowerCase("tr").includes(q)));
  if (j < 0) { if (odakla) toast("Bu ürün sayım listesinde yok.", "error"); return; }
  const satir = document.querySelector(`.say-satir[data-i="${j}"]`);
  if (!satir) return;
  satir.classList.add("vurgu");
  satir.scrollIntoView({ block: "center", behavior: "smooth" });
  if (odakla) {
    const inp = satir.querySelector("input");
    inp.focus(); inp.select();
    document.getElementById("subeAra").value = "";
  }
}

let kaydetZamanlayici = null;
let kaydetBekliyor = false;
function otomatikKaydet() {
  kaydetBekliyor = true;
  document.getElementById("kayitDurum").textContent = "…";
  clearTimeout(kaydetZamanlayici);
  kaydetZamanlayici = setTimeout(kaydetSimdi, 1500);
}
async function kaydetSimdi() {
  clearTimeout(kaydetZamanlayici);
  if (!aktif || !kaydetBekliyor) return;
  kaydetBekliyor = false;
  try {
    await updateDoc(doc(db, SAYIMLAR, aktif.id), { kalemler: aktif.kalemler, sonKayit: serverTimestamp() });
    document.getElementById("kayitDurum").textContent = "✓ kaydedildi";
  } catch (e) {
    kaydetBekliyor = true;
    document.getElementById("kayitDurum").textContent = "⚠ kaydedilemedi";
    console.error(e);
  }
}

async function sayimGonder() {
  if (!aktif) return;
  const h = hedefKalemler(aktif);
  const bos = h.filter((k) => k.sayilan === null || k.sayilan === undefined);
  if (bos.length) {
    toast(`${bos.length} ürün girilmedi. Olmayanlara 0 yazın.`, "error");
    const i = aktif.kalemler.indexOf(bos[0]);
    const inp = document.querySelector(`[data-miktar="${i}"]`);
    inp?.scrollIntoView({ block: "center" }); inp?.focus();
    return;
  }
  if (!(await onayIste({ baslik: "Sayımı gönder", metin: `${h.length} ürünün sayımı merkeze gönderilecek. Gönderdikten sonra değiştiremezsiniz.`, onayMetni: "Gönder" }))) return;
  const btn = document.getElementById("sayimGonderBtn");
  btn.disabled = true;
  try {
    clearTimeout(kaydetZamanlayici); kaydetBekliyor = false;
    await updateDoc(doc(db, SAYIMLAR, aktif.id), {
      kalemler: aktif.kalemler, durum: "gonderildi", acik: false,
      gonderimTarihi: serverTimestamp(), sayan: ben.ad || ben.uid
    });
    toast("✅ Sayım gönderildi.", "success");
    subeKapat();
  } catch (e) {
    toast("Gönderilemedi: " + (e.code || e.message), "error");
  } finally { btn.disabled = false; }
}

window.addEventListener("beforeunload", (e) => { if (kaydetBekliyor) { kaydetSimdi(); e.preventDefault(); e.returnValue = ""; } });
