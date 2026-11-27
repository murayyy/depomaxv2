// ============================================================================
// PALETLEME (paletçi ekranı)
//   paletlemeler/{siparisId} -> {
//     siparisId, siparisAd, subeAdi, durum: "devam" | "bitti",
//     paletci, paletciUid, baslangic, bitis, bitiren,
//     toplamPalet, darPalet, genisPalet, not,
//     yardimcilar: [{ ad, giris (ISO), cikis (ISO|null), ekleyen }]
//   }
//   Başlanabilir: kontrolüne başlanmış (kontrol_ediliyor) ya da kontrolü bitmiş (tamamlandi) şube siparişi.
// ============================================================================
import { auth, signOut, sayfaKorumasi, db } from "./firebase.js";
import { tumSiparisleriCanliDinle } from "./veri.js?v=20261127";
import { arayuzHazirla, toast, onayIste, kacisEt } from "./utils.js";
import {
  collection, doc, onSnapshot, query, where, getDocs, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

arayuzHazirla();

const PALETLEMELER = "paletlemeler";
const $ = (id) => document.getElementById(id);
let ben = null;            // { uid, ad, rol }
let siparisler = [];
let paletlemeler = new Map();   // siparisId -> paletleme
let kisiler = null;        // yardımcı listesi (önbellek)

const tarih = (v) => {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d) ? null : d;
};
const bugunBas = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const subeAd = (s) => s.subeAdi || String(s.ad || "").split(" — ")[0] || "—";
const benimAdim = () => ben?.ad || ben?.uid || "";
const bitti = (p) => p && (p.durum === "bitti" || (p.tamamlandi && p.durum !== "devam"));
const sure = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sn = t % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(sn).padStart(2, "0");
};
// Eski kayıtlarda yardımcılar düz metin listesiydi
const yardimcilar = (p) => (p?.yardimcilar || []).map((y) => typeof y === "string" ? { ad: y, giris: null, cikis: null } : y);

/* ---------------- Başlat ---------------- */
let basladi = false;
sayfaKorumasi(["paletci", "toplayici", "kontrolor", "depocu"], (k) => {
  if (basladi) return; basladi = true;
  ben = { uid: auth.currentUser?.uid || "", ad: k.ad || "", rol: k.rol };
  $("kullaniciAdi").textContent = k.ad || "";
  $("rolEtiketi").textContent = k.rol;
  tumSiparisleriCanliDinle((liste) => { siparisler = liste; ciz(); }, 4);
  const sinir = new Date(Date.now() - 4 * 864e5);
  onSnapshot(query(collection(db, PALETLEMELER), where("guncellemeTarihi", ">=", sinir)), (snap) => {
    paletlemeler = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    ciz();
  }, (err) => { console.error(err); toast("Paletleme kayıtları okunamadı: " + (err.code || err.message), "error", 8000); });
  setInterval(() => document.querySelectorAll("[data-bas]").forEach((el) => { el.textContent = sure(Date.now() - Number(el.dataset.bas)); }), 1000);
});
$("cikisBtn").addEventListener("click", async () => { await signOut(auth); location.href = "index.html"; });

/* ---------------- Listeler ---------------- */
function ciz() {
  const sipMap = new Map(siparisler.map((s) => [s.id, s]));
  const devam = [...paletlemeler.values()].filter((p) => p.durum === "devam")
    .sort((a, b) => (tarih(a.baslangic) || 0) - (tarih(b.baslangic) || 0));
  const hazir = siparisler.filter((s) => ["kontrol_ediliyor", "tamamlandi"].includes(s.durum) && !paletlemeler.get(s.id)?.durum && !bitti(paletlemeler.get(s.id)))
    .sort((a, b) => (tarih(a.olusturulmaTarihi) || 0) - (tarih(b.olusturulmaTarihi) || 0));
  const biten = [...paletlemeler.values()].filter((p) => bitti(p) && (tarih(p.bitis) || tarih(p.guncellemeTarihi) || 0) >= bugunBas())
    .sort((a, b) => (tarih(b.bitis) || 0) - (tarih(a.bitis) || 0));

  $("sayDevam").textContent = devam.length; $("sayHazir").textContent = hazir.length; $("sayBitti").textContent = biten.length;

  $("listeDevam").innerHTML = devam.map((p) => {
    const s = sipMap.get(p.siparisId || p.id);
    const bas = tarih(p.baslangic);
    const ys = yardimcilar(p);
    const benimMi = p.paletci === benimAdim();
    return `<div class="pl-kart devam">
      <div class="pl-sube">${kacisEt(p.subeAdi || (s && subeAd(s)) || p.siparisAd || "—")}${kontrolEtiketi(s)}</div>
      <div class="pl-alt"><span>Paletçi: <b>${kacisEt(p.paletci || "—")}</b>${benimMi ? " (siz)" : ""}</span>
        <span class="pl-sure" ${bas ? `data-bas="${bas.getTime()}"` : ""}>${bas ? sure(Date.now() - bas) : "—"}</span></div>
      <div class="pl-yard">
        ${ys.map((y, i) => `<div class="pl-yard-satir ${y.cikis ? "cikti" : ""}">
          <span>👤 ${kacisEt(y.ad)} <span style="font-size:12px;color:var(--color-ink-soft)">${y.giris ? saat(y.giris) : ""}${y.cikis ? " – " + saat(y.cikis) : ""}</span></span>
          ${y.cikis ? '<span style="font-size:12px;">çıktı</span>' : `<button class="btn btn-ghost btn-sm" data-cikar="${kacisEt(p.id)}" data-i="${i}">Çıkar</button>`}
        </div>`).join("") || '<div class="pl-bos">Yardımcı yok.</div>'}
      </div>
      <div class="pl-btnlar">
        <button class="btn btn-ghost" data-yardim="${kacisEt(p.id)}">👤 Yardımcı ekle</button>
        <button class="btn btn-primary" data-bitir="${kacisEt(p.id)}">✅ Bitirdim</button>
      </div>
    </div>`;
  }).join("") || '<div class="pl-bos">Şu an süren paletleme yok.</div>';

  $("listeHazir").innerHTML = hazir.map((s) => `<div class="pl-kart hazir">
      <div class="pl-sube">${kacisEt(subeAd(s))}${kontrolEtiketi(s)}${s.kaynak === "fabrika" ? '<span class="etiket" style="background:#f26a1b">FABRİKA</span>' : ""}</div>
      <div class="pl-alt"><span>${Number(s.toplamUrun) || 0} kalem${s.toplamKg ? ` · ${Math.round(s.toplamKg)} kg` : ""}</span><span>${kacisEt(s.kontrolBaşlayan || "")}</span></div>
      <div class="pl-btnlar"><button class="btn btn-primary" data-basla="${kacisEt(s.id)}">▶ Başladım</button></div>
    </div>`).join("") || '<div class="pl-bos">Kontrolüne başlanmış, paletlemesi başlamamış sipariş yok.</div>';

  $("listeBitti").innerHTML = biten.map((p) => {
    const bas = tarih(p.baslangic), bit = tarih(p.bitis);
    return `<div class="pl-kart bitti">
      <div class="pl-sube">${kacisEt(p.subeAdi || p.siparisAd || "—")}</div>
      <div class="pl-alt"><span><b>${Number(p.toplamPalet) || 0} palet</b>${p.darPalet != null ? ` · ${p.darPalet} dar · ${p.genisPalet || 0} geniş` : ""}</span>
        <span>${bas && bit ? sure(bit - bas) : ""}</span></div>
      <div class="pl-alt"><span>${kacisEt(p.paletci || p.yapan || "")}${yardimcilar(p).length ? " + " + yardimcilar(p).map((y) => kacisEt(y.ad)).join(", ") : ""}</span><span>${bit ? saat(bit) : ""}</span></div>
      ${p.not ? `<div class="pl-alt"><span>Not: ${kacisEt(p.not)}</span></div>` : ""}
      <div class="pl-btnlar"><button class="btn btn-ghost btn-sm" data-duzelt="${kacisEt(p.id)}">✏️ Sayıyı düzelt</button></div>
    </div>`;
  }).join("") || '<div class="pl-bos">Bugün biten paletleme yok.</div>';
}
const saat = (v) => { const d = tarih(v); return d ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : ""; };
function kontrolEtiketi(s) {
  if (!s) return "";
  if (s.durum === "tamamlandi") return '<span class="etiket" style="background:#22b066">KONTROL BİTTİ</span>';
  if (s.durum === "kontrol_ediliyor") return '<span class="etiket" style="background:#a259d9">KONTROLDE</span>';
  return "";
}

/* ---------------- Olaylar ---------------- */
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  try {
    if (b.dataset.basla) await basla(b.dataset.basla, b);
    else if (b.dataset.yardim) await yardimciModal(b.dataset.yardim);
    else if (b.dataset.cikar) await yardimciCikar(b.dataset.cikar, Number(b.dataset.i));
    else if (b.dataset.bitir) bitirModal(b.dataset.bitir, false);
    else if (b.dataset.duzelt) bitirModal(b.dataset.duzelt, true);
  } catch (err) {
    console.error(err);
    toast(err.message || String(err), "error", 6000);
  }
});

async function basla(siparisId, btn) {
  const s = siparisler.find((x) => x.id === siparisId);
  if (!s) return;
  btn.disabled = true;
  const ref = doc(db, PALETLEMELER, siparisId);
  try {
    const sonuc = await runTransaction(db, async (tx) => {
      const mevcut = await tx.get(ref);
      const d = mevcut.exists() ? mevcut.data() : null;
      if (d && d.durum === "devam") return { baskasi: d.paletci || "başka biri" };
      if (d && bitti(d)) return { bitmis: true };
      tx.set(ref, {
        siparisId, siparisAd: s.ad || "", subeAdi: subeAd(s), durum: "devam",
        paletci: benimAdim(), paletciUid: ben.uid, baslangic: serverTimestamp(),
        yardimcilar: [], olusturulmaTarihi: serverTimestamp(), guncellemeTarihi: serverTimestamp()
      }, { merge: true });
      return { tamam: true };
    });
    if (sonuc.baskasi) {
      if (await onayIste({ baslik: "Paletleme zaten başlamış", metin: `${sonuc.baskasi} bu siparişin paletlemesine başlamış. Yardımcı olarak katılmak ister misiniz?`, onayMetni: "Yardımcı olarak katıl" })) {
        await yardimciEkle(siparisId, benimAdim());
      }
    } else if (sonuc.bitmis) toast("Bu siparişin paletlemesi zaten bitmiş.", "info");
    else toast(`▶ ${subeAd(s)} paletlemesi başladı.`, "success");
  } finally { btn.disabled = false; }
}

async function yardimciEkle(id, ad) {
  ad = String(ad || "").trim();
  if (!ad) return;
  const ref = doc(db, PALETLEMELER, id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Paletleme kaydı bulunamadı.");
    const p = snap.data();
    if (p.durum !== "devam") throw new Error("Bu paletleme bitmiş.");
    if (p.paletci === ad) throw new Error(`${ad} zaten bu paletlemenin paletçisi.`);
    const ys = yardimcilar(p);
    if (ys.some((y) => y.ad === ad && !y.cikis)) throw new Error(`${ad} zaten yardımcı.`);
    ys.push({ ad, giris: new Date().toISOString(), cikis: null, ekleyen: benimAdim() });
    tx.update(ref, { yardimcilar: ys, guncellemeTarihi: serverTimestamp() });
  });
  toast(`👤 ${ad} yardımcı olarak eklendi.`, "success");
}

async function yardimciCikar(id, i) {
  const p = paletlemeler.get(id);
  const y = yardimcilar(p)[i];
  if (!y) return;
  if (!(await onayIste({ baslik: "Yardımcıyı çıkar", metin: `${y.ad} bu paletlemeden çıkarılacak. Paletleme devam eder.`, onayMetni: "Çıkar" }))) return;
  const ref = doc(db, PALETLEMELER, id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const ys = yardimcilar(snap.data());
    const j = ys[i] && ys[i].ad === y.ad && !ys[i].cikis ? i : ys.findIndex((x) => x.ad === y.ad && !x.cikis);
    if (j < 0) return;
    ys[j] = { ...ys[j], cikis: new Date().toISOString() };
    tx.update(ref, { yardimcilar: ys, guncellemeTarihi: serverTimestamp() });
  });
  toast(`${y.ad} çıkarıldı.`, "info");
}

async function yardimciModal(id) {
  const p = paletlemeler.get(id);
  if (!kisiler) {
    try {
      const snap = await getDocs(query(collection(db, "kullanicilar"), where("rol", "in", ["toplayici", "kontrolor", "paletci", "depocu"])));
      kisiler = snap.docs.map((d) => ({ ad: d.data().ad || "", rol: d.data().rol })).filter((k) => k.ad).sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
    } catch { kisiler = []; }
  }
  const aktif = new Set([p?.paletci, ...yardimcilar(p).filter((y) => !y.cikis).map((y) => y.ad)]);
  const ROL = { toplayici: "Toplayıcı", kontrolor: "Kontrolör", paletci: "Paletçi", depocu: "Depocu" };
  const root = $("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal" style="max-width:420px;">
        <h3>👤 Yardımcı ekle — ${kacisEt(p?.subeAdi || "")}</h3>
        <div class="field"><label>Kişi seç</label>
          <select class="select" id="ydSec"><option value="">— Seç —</option>
            ${kisiler.filter((k) => !aktif.has(k.ad)).map((k) => `<option value="${kacisEt(k.ad)}">${kacisEt(k.ad)} · ${ROL[k.rol] || k.rol}</option>`).join("")}
          </select></div>
        <div class="field"><label>Listede yoksa adını yazın</label><input class="input" id="ydElle" placeholder="Ad Soyad" /></div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="ekle">Ekle</button>
        </div>
      </div>
    </div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
  root.querySelector('[data-role="ekle"]').onclick = async () => {
    const ad = $("ydSec").value || $("ydElle").value.trim();
    if (!ad) { toast("Kişi seçin ya da yazın.", "error"); return; }
    try { await yardimciEkle(id, ad); kapat(); } catch (err) { toast(err.message, "error"); }
  };
}

function bitirModal(id, duzelt) {
  const p = paletlemeler.get(id);
  if (!p) return;
  const root = $("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal" style="max-width:420px;">
        <h3>${duzelt ? "✏️ Palet sayısını düzelt" : "✅ Paletleme bitti"} — ${kacisEt(p.subeAdi || "")}</h3>
        <div class="pl-sayi">
          <div class="field"><label>Dar palet</label><input class="input" type="number" inputmode="numeric" min="0" id="btDar" value="${duzelt ? (p.darPalet ?? "") : ""}" placeholder="0" /></div>
          <div class="field"><label>Geniş palet</label><input class="input" type="number" inputmode="numeric" min="0" id="btGenis" value="${duzelt ? (p.genisPalet ?? "") : ""}" placeholder="0" /></div>
        </div>
        <div class="pl-toplam" id="btToplam">Toplam: <b>0</b> palet</div>
        <div class="field"><label>Not (isteğe bağlı)</label><input class="input" id="btNot" value="${duzelt ? kacisEt(p.not || "") : ""}" placeholder="Örn. 1 palet yarım" /></div>
        ${!duzelt && yardimcilar(p).some((y) => !y.cikis) ? '<div class="u-text-soft" style="font-size:12px;margin-bottom:8px;">Hâlâ ekli yardımcılar da bu saatle çıkmış sayılır.</div>' : ""}
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="kaydet">${duzelt ? "Kaydet" : "Bitirdim"}</button>
        </div>
      </div>
    </div>`;
  const oku = () => ({ dar: Math.max(0, parseInt($("btDar").value, 10) || 0), genis: Math.max(0, parseInt($("btGenis").value, 10) || 0) });
  const toplamYaz = () => { const { dar, genis } = oku(); $("btToplam").innerHTML = `Toplam: <b>${dar + genis}</b> palet`; };
  ["btDar", "btGenis"].forEach((x) => $(x).addEventListener("input", toplamYaz));
  toplamYaz();
  $("btDar").focus();
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
  root.querySelector('[data-role="kaydet"]').onclick = async (ev) => {
    const { dar, genis } = oku();
    if (dar + genis <= 0) { toast("Palet sayısını girin.", "error"); return; }
    ev.target.disabled = true;
    try {
      const ref = doc(db, PALETLEMELER, id);
      const simdi = new Date().toISOString();
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Paletleme kaydı bulunamadı.");
        const d = snap.data();
        const patch = { darPalet: dar, genisPalet: genis, toplamPalet: dar + genis, not: $("btNot").value.trim(), guncellemeTarihi: serverTimestamp() };
        if (!duzelt) {
          if (d.durum !== "devam") throw new Error("Bu paletleme zaten bitmiş.");
          Object.assign(patch, {
            durum: "bitti", tamamlandi: true, bitis: serverTimestamp(), bitiren: benimAdim(),
            yardimcilar: yardimcilar(d).map((y) => (y.cikis ? y : { ...y, cikis: simdi }))
          });
        } else {
          patch.duzelten = benimAdim(); patch.duzeltmeTarihi = serverTimestamp();
        }
        tx.update(ref, patch);
      });
      toast(duzelt ? "Palet sayısı güncellendi." : `✅ ${p.subeAdi || ""}: ${dar + genis} palet (${dar} dar, ${genis} geniş).`, "success");
      kapat();
    } catch (err) {
      ev.target.disabled = false;
      toast(err.message || String(err), "error");
    }
  };
}
