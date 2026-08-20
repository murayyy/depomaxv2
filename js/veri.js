// ============================================================================
// VERİ KATMANI (Firestore)
// Veri modeli:
//   siparisler/{siparisId}            -> { ad, subeAdi, subeId, durum, olusturulmaTarihi, ... }
//   siparisler/{siparisId}/urunler/{urunId} -> { kod, ad, miktar, birim, reyon, barkod, ... }
//   katalog/{urunKodu}               -> { kod, ad, birim, minMiktar, reyon, aciklama, sira, aktif }
//   kullanicilar/{uid}               -> { ad, eposta, rol, subeAdi?, subeId? }
//   stoklar/{urunKodu}               -> { miktar, birim, durum, ... } (köprü script yazar)
//   durum: "toplaniyor" -> "toplandi" -> "kontrol_ediliyor" -> "tamamlandi" -> "sevk_edildi"
// ============================================================================
import { db } from "./firebase.js";
import { ondalikOku } from "./utils.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, orderBy, serverTimestamp, writeBatch, getDocs,
  setDoc, getDoc, increment, collectionGroup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const SIPARISLER = "siparisler";

/* ---------------- Sipariş listesi ---------------- */
export function siparisleriDinle(durumFiltre, callback) {
  const q = query(
    collection(db, SIPARISLER),
    where("durum", "in", durumFiltre),
    orderBy("olusturulmaTarihi", "desc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => console.error("siparisleriDinle:", err));
}

// Sekme/filtre seçiminden bağımsız, sürekli açık kalan bildirim amaçlı dinleyici.
// Bildirimler için sadece SON GÜNLERİN siparişlerini dinler — tüm geçmişi
// her sayfa açılışında okumak (eski sürüm) gereksiz yere kota tüketiyordu.
export function tumSiparisleriCanliDinle(callback, gunSayisi = 3) {
  const sinirTarihi = new Date(Date.now() - gunSayisi * 24 * 60 * 60 * 1000);
  const q = query(
    collection(db, SIPARISLER),
    where("olusturulmaTarihi", ">=", sinirTarihi),
    orderBy("olusturulmaTarihi", "desc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => console.error("tumSiparisleriCanliDinle:", err));
}

export async function siparisOlustur({ ad, olusturan, aciliyet = "normal" }) {
  const ref = await addDoc(collection(db, SIPARISLER), {
    ad,
    durum: "toplaniyor",
    aciliyet,
    olusturulmaTarihi: serverTimestamp(),
    guncellemeTarihi: serverTimestamp(),
    olusturan,
    toplamUrun: 0,
    toplananUrun: 0,
    eksikUrun: 0,
    kontrolEdilenUrun: 0
  });
  return ref.id;
}

export function siparisGuncelle(siparisId, patch) {
  return updateDoc(doc(db, SIPARISLER, siparisId), { ...patch, guncellemeTarihi: serverTimestamp() });
}

/* ---------------- Ürünler (alt koleksiyon) ---------------- */
export function urunleriDinle(siparisId, callback) {
  const q = collection(db, SIPARISLER, siparisId, "urunler");
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => console.error("urunleriDinle:", err));
}

// Excel'den okunan satırları toplu olarak alt koleksiyona yazar (500'lük gruplar halinde).
export async function urunleriTopluEkle(siparisId, satirlar) {
  const KOLON_ESLESTIRME = {
    kod: ["ürün kodu", "kod", "sipariş kodu", "stok kodu"],
    ad: ["ürün adı", "ad", "isim", "stok adı"],
    miktar: ["miktar", "sipariş miktarı"],
    birim: ["birim"],
    aciklama: ["açıklama"],
    reyon: ["reyon", "reyon kodu"],
    barkod: ["barkod"]
  };
  const deger = (satir, alanlar) => {
    for (const anahtar of Object.keys(satir)) {
      const normalAnahtar = anahtar.trim().toLowerCase();
      if (alanlar.includes(normalAnahtar) && satir[anahtar] !== "") return satir[anahtar];
    }
    return "";
  };

  let toplam = 0;
  for (let i = 0; i < satirlar.length; i += 450) {
    const grup = satirlar.slice(i, i + 450);
    const batch = writeBatch(db);
    grup.forEach((satir) => {
      const kod = deger(satir, KOLON_ESLESTIRME.kod);
      const ad = deger(satir, KOLON_ESLESTIRME.ad);
      if (!kod && !ad) return; // boş satırı atla
      const ref = doc(collection(db, SIPARISLER, siparisId, "urunler"));
      batch.set(ref, {
        kod: String(kod || ""),
        ad: String(ad || ""),
        miktar: ondalikOku(deger(satir, KOLON_ESLESTIRME.miktar)),
        birim: String(deger(satir, KOLON_ESLESTIRME.birim) || ""),
        aciklama: String(deger(satir, KOLON_ESLESTIRME.aciklama) || ""),
        reyon: String(deger(satir, KOLON_ESLESTIRME.reyon) || ""),
        barkod: String(deger(satir, KOLON_ESLESTIRME.barkod) || ""),
        toplandi: false,
        eksik: false,
        kontrol: false,
        kontrolNotu: "",
        guncellemeTarihi: serverTimestamp()
      });
      toplam++;
    });
    await batch.commit();
  }
  await siparisGuncelle(siparisId, { toplamUrun: toplam });
  return toplam;
}

export function urunEkle(siparisId, urun) {
  return addDoc(collection(db, SIPARISLER, siparisId, "urunler"), {
    toplandi: false,
    eksik: false,
    kontrol: false,
    kontrolNotu: "",
    ...urun,
    guncellemeTarihi: serverTimestamp()
  });
}

export function urunGuncelle(siparisId, urunId, patch) {
  return updateDoc(doc(db, SIPARISLER, siparisId, "urunler", urunId), {
    ...patch,
    guncellemeTarihi: serverTimestamp()
  });
}

export function urunSil(siparisId, urunId) {
  return deleteDoc(doc(db, SIPARISLER, siparisId, "urunler", urunId));
}

export async function tumSiparisleriGetir() {
  const snap = await getDocs(collection(db, SIPARISLER));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function urunleriniGetir(siparisId) {
  const snap = await getDocs(collection(db, SIPARISLER, siparisId, "urunler"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ============================================================================
   KATALOG (sabit ürün listesi + minimum miktarlar)
   katalog/{urunKodu} -> { kod, ad, birim, minMiktar, reyon, aciklama, sira, aktif }
   ============================================================================ */
const KATALOG = "katalog";

let _katalogCache = null;
let _katalogSonYukleme = 0;
const KATALOG_CACHE_SURE = 5 * 60 * 1000; // 5 dakika

export function katalogDinle(callback) {
  // Katalog nadiren değişir — 5 dakika cache, sonra yeniden çek
  async function yukle() {
    const simdi = Date.now();
    if (_katalogCache && simdi - _katalogSonYukleme < KATALOG_CACHE_SURE) {
      callback(_katalogCache); return;
    }
    try {
      const snap = await getDocs(query(collection(db, KATALOG), orderBy("sira", "asc")));
      _katalogCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      _katalogSonYukleme = Date.now();
      callback(_katalogCache);
    } catch (err) { console.error("katalogDinle:", err); }
  }
  yukle();
  // unsubscribe fonksiyonu (uyumluluk için)
  return () => {};
}

export async function katalogUrunEkle(urun) {
  return addDoc(collection(db, KATALOG), { ...urun, guncellemeTarihi: serverTimestamp() });
}

export function katalogUrunGuncelle(id, patch) {
  return updateDoc(doc(db, KATALOG, id), { ...patch, guncellemeTarihi: serverTimestamp() });
}

export function katalogUrunSil(id) {
  return deleteDoc(doc(db, KATALOG, id));
}

/* ============================================================================
   ŞUBE SİPARİŞİ OLUŞTURMA
   Katalogdaki aktif ürünleri, şubenin girdiği miktarlarla birleştirip
   "siparisler" koleksiyonuna yazar (miktar > 0 olan ürünler dahil edilir).
   ============================================================================ */
export async function subeSimarisiOlustur({ subeAdi, subeId, olusturan, satirlar }) {
  // satirlar: [{ katalogId, kod, ad, birim, reyon, aciklama, miktar }, ...]
  const gecerli = satirlar.filter((s) => (ondalikOku(s.miktar) || 0) > 0);
  if (gecerli.length === 0) throw new Error("Hiç ürün seçilmedi.");

  const siparisAd = `${subeAdi} — ${new Date().toLocaleDateString("tr-TR")}`;
  const ref = await addDoc(collection(db, SIPARISLER), {
    ad: siparisAd,
    subeAdi,
    subeId,
    durum: "toplaniyor",
    olusturulmaTarihi: serverTimestamp(),
    guncellemeTarihi: serverTimestamp(),
    olusturan,
    toplamUrun: gecerli.length,
    toplananUrun: 0,
    eksikUrun: 0,
    kontrolEdilenUrun: 0
  });

  const batch = writeBatch(db);
  gecerli.forEach((s) => {
    const urunRef = doc(collection(db, SIPARISLER, ref.id, "urunler"));
    batch.set(urunRef, {
      kod: s.stokKodu || s.kod || "",
      ad: s.ad || "",
      miktar: ondalikOku(s.miktar),
      birim: s.birim || "",
      reyon: s.reyon || "",
      aciklama: s.subeNotu || s.aciklama || "",
      barkod: s.barkod || "",
      toplandi: false, eksik: false, kontrol: false, kontrolNotu: "",
      guncellemeTarihi: serverTimestamp()
    });
  });
  await batch.commit();
  return ref.id;
}

export function subeSiparisleriDinle(subeId, callback) {
  const q = query(
    collection(db, SIPARISLER),
    where("subeId", "==", subeId),
    orderBy("olusturulmaTarihi", "desc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => console.error("subeSiparisleriDinle:", err));
}

export function teslimiOnayla(siparisId, onaylayanKullanici) {
  return updateDoc(doc(db, SIPARISLER, siparisId), {
    durum: "teslim_edildi",
    teslimatTarihi: serverTimestamp(),
    teslimiOnaylayan: onaylayanKullanici,
    guncellemeTarihi: serverTimestamp()
  });
}

/* ============================================================================
   TESLİM KONTROL KAYDI
   Sipariş belgesine teslim detaylarını yazar.
   teslimatKalemleri: [{ urunId, ad, kod, birim, siparisMiktari, gelenMiktar, durum, not }]
   durum: "tamam" | "eksik" | "fazla"
   ============================================================================ */
export async function teslimatKaydet(siparisId, { teslimatKalemleri, onaylayanKullanici, subeAdi }) {
  const ozet = {
    tamam: 0, eksik: 0, fazla: 0,
    eksikMiktar: 0, fazlaMiktar: 0
  };
  teslimatKalemleri.forEach((k) => {
    if (k.durum === "tamam") ozet.tamam++;
    else if (k.durum === "eksik") { ozet.eksik++; ozet.eksikMiktar += Number(k.siparisMiktari - k.gelenMiktar) || 0; }
    else if (k.durum === "fazla") { ozet.fazla++; ozet.fazlaMiktar += Number(k.gelenMiktar - k.siparisMiktari) || 0; }
  });

  await updateDoc(doc(db, SIPARISLER, siparisId), {
    durum: "teslim_edildi",
    teslimatTarihi: serverTimestamp(),
    teslimiOnaylayan: onaylayanKullanici,
    subeAdi,
    teslimatKalemleri,
    teslimatOzeti: ozet,
    guncellemeTarihi: serverTimestamp()
  });
  return ozet;
}

/* ============================================================================
   MERKEZİN TESLİMAT DEĞERLENDİRMESİ
   ============================================================================ */
export async function teslimatYenidenOnayla(siparisId, { teslimatKalemleri, onaylayanKullanici, subeAdi }) {
  // Şube tekrar sayım sonrası teslim detaylarını günceller — durum tekrar teslim_edildi kalır
  // ama merkezdegerlendirmesi sıfırlanır (admin tekrar bakacak)
  const ozet = { tamam: 0, eksik: 0, fazla: 0, eksikMiktar: 0, fazlaMiktar: 0 };
  teslimatKalemleri.forEach((k) => {
    if (k.durum === "tamam") ozet.tamam++;
    else if (k.durum === "eksik") { ozet.eksik++; ozet.eksikMiktar += Number(k.siparisMiktari - k.gelenMiktar) || 0; }
    else if (k.durum === "fazla") { ozet.fazla++; ozet.fazlaMiktar += Number(k.gelenMiktar - k.siparisMiktari) || 0; }
  });
  await updateDoc(doc(db, SIPARISLER, siparisId), {
    durum: "teslim_edildi",
    teslimatKalemleri,
    teslimatOzeti: ozet,
    teslimiOnaylayan: onaylayanKullanici,
    subeAdi,
    merkezdegerlendirmesi: null,        // Admin tekrar bakacak
    merkezdegerlendirmeTarihi: null,
    teslimatGuncellenmeTarihi: serverTimestamp(),
    guncellemeTarihi: serverTimestamp()
  });
  return ozet;
}

export async function teslimatDegerlendir(siparisId, { degerlendirme, degerlendiren, not }) {
  // degerlendirme: "onaylandi" | "tekrar_kontrol"
  await updateDoc(doc(db, SIPARISLER, siparisId), {
    merkezdegerlendirmesi: degerlendirme,
    merkezdegerlendirmeNotu: not || "",
    merkezdegerlendirenKisi: degerlendiren,
    merkezdegerlendirmeTarihi: serverTimestamp(),
    guncellemeTarihi: serverTimestamp()
  });
}


export function siparisArsivle(siparisId) {
  return updateDoc(doc(db, SIPARISLER, siparisId), {
    durum: "arsivlendi",
    arsivTarihi: serverTimestamp(),
    guncellemeTarihi: serverTimestamp()
  });
}

/* ============================================================================
   SÜRÜCÜ
   ============================================================================ */
export function suruculeriGetir() {
  return getDocs(query(collection(db, "kullanicilar"), where("rol", "==", "surucu")))
    .then((snap) => snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
}

export function surucuSiparisleriDinle(surucuUid, callback) {
  const q = query(
    collection(db, SIPARISLER),
    where("surucuUid", "==", surucuUid),
    where("durum", "in", ["sevk_edildi", "teslim_edildi"]),
    orderBy("sevkTarihi", "desc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => console.error("surucuSiparisleriDinle:", err));
}

/* ============================================================================
   RAF SİSTEMİ
   ============================================================================ */
const RAFLAR = "raflar";
const RAF_HAREKETLERI = "rafHareketleri";

export function raflariDinle(callback) {
  const q = query(collection(db, RAFLAR), orderBy("ad"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => console.error("raflariDinle:", err));
}

export async function rafOlustur({ ad, kat, bolme, kapasite, aciklama }) {
  return addDoc(collection(db, RAFLAR), {
    ad, kat: Number(kat), bolme: Number(bolme),
    kapasite: Number(kapasite) || 0,
    aciklama: aciklama || "",
    olusturulmaTarihi: serverTimestamp()
  });
}

export async function rafGuncelle(rafId, patch) {
  return updateDoc(doc(db, RAFLAR, rafId), { ...patch, guncellemeTarihi: serverTimestamp() });
}

export async function rafSil(rafId) {
  return deleteDoc(doc(db, RAFLAR, rafId));
}

export function rafKalemleriDinle(rafId, callback) {
  return onSnapshot(
    collection(db, RAFLAR, rafId, "kalemler"),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error("rafKalemleriDinle:", err)
  );
}

export async function rafKalemiEkle(rafId, { stokKodu, ad, miktar, palet, birim, not, kat, bolme, girisTarihi, skt, cari }) {
  return addDoc(collection(db, RAFLAR, rafId, "kalemler"), {
    stokKodu: stokKodu || "", ad, miktar: Number(miktar) || 0,
    palet: Number(palet) || 0, birim: birim || "KG", not: not || "",
    kat: Number(kat) || 1, bolme: Number(bolme) || 1,
    girisTarihi: girisTarihi || "", skt: skt || "", cari: cari || "",
    eklenmeTarihi: serverTimestamp()
  });
}

export async function rafKalemiGuncelle(rafId, kalemId, patch) {
  return updateDoc(doc(db, RAFLAR, rafId, "kalemler", kalemId), patch);
}

export async function rafKalemiSil(rafId, kalemId) {
  return deleteDoc(doc(db, RAFLAR, rafId, "kalemler", kalemId));
}

export async function rafHareketiKaydet({ rafId, rafAd, tip, stokKodu, ad, miktar, palet, birim, yapan, not }) {
  // tip: "giris" | "cikis" | "tasima"
  return addDoc(collection(db, RAF_HAREKETLERI), {
    rafId, rafAd, tip, stokKodu: stokKodu || "", ad,
    miktar: Number(miktar) || 0, palet: Number(palet) || 0,
    birim: birim || "KG", yapan, not: not || "",
    tarih: serverTimestamp()
  });
}

export async function rafHareketleriniGetir(limit = 100) {
  const snap = await getDocs(query(
    collection(db, RAF_HAREKETLERI),
    orderBy("tarih", "desc")
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function tumRaflariGetir() {
  const snap = await getDocs(query(collection(db, RAFLAR), orderBy("ad")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ============================================================================
   ÜRETİM MODÜLܺ — Reçeteler, Kokteyl Üretimi, Paketleme
   ============================================================================ */
const RECETELER = "receteler";
const URETIM = "uretimKayitlari";
const PAKETLEME = "paketlemeKayitlari";

export function receteleriDinle(callback) {
  return onSnapshot(query(collection(db, RECETELER), orderBy("ad")), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => console.error(err));
}

export function receteOlustur(veri) {
  return addDoc(collection(db, RECETELER), { ...veri, olusturulmaTarihi: serverTimestamp() });
}

export function receteGuncelle(id, veri) {
  return updateDoc(doc(db, RECETELER, id), { ...veri, guncellemeTarihi: serverTimestamp() });
}

export function recedeSil(id) {
  return deleteDoc(doc(db, RECETELER, id));
}

export function uretimKaydet(veri) {
  return addDoc(collection(db, URETIM), { ...veri, tarih: serverTimestamp() });
}

export function paketlemeKaydet(veri) {
  return addDoc(collection(db, PAKETLEME), { ...veri, tarih: serverTimestamp() });
}

export async function uretimGecmisGetir() {
  const [ur, pk] = await Promise.all([
    getDocs(query(collection(db, URETIM), orderBy("tarih", "desc"))),
    getDocs(query(collection(db, PAKETLEME), orderBy("tarih", "desc")))
  ]);
  const uretimler = ur.docs.map(d => ({ id: d.id, tip: "uretim", ...d.data() }));
  const paketlemeler = pk.docs.map(d => ({ id: d.id, tip: "paketleme", ...d.data() }));
  return [...uretimler, ...paketlemeler]
    .sort((a, b) => (b.tarih?.toMillis?.() || 0) - (a.tarih?.toMillis?.() || 0));
}

/* ============================================================================
   PALETLEMEر
   ============================================================================ */
const PALETLEMELER = "paletlemeler";

export function paletlemeyiDinle(siparisId, callback) {
  return onSnapshot(doc(db, PALETLEMELER, siparisId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (err) => console.error(err));
}

export function paletlemeKaydet2(siparisId, veri) {
  return updateDoc(doc(db, PALETLEMELER, siparisId), { ...veri, guncellemeTarihi: serverTimestamp() })
    .catch(() => setDoc(doc(db, PALETLEMELER, siparisId), { ...veri, olusturulmaTarihi: serverTimestamp(), guncellemeTarihi: serverTimestamp() }));
}

export async function paletlemeYardimciEkle(siparisId, yardimci) {
  const snap = await getDoc(doc(db, PALETLEMELER, siparisId));
  const mevcutYardimcilar = snap.exists() ? (snap.data().yardimcilar || []) : [];
  if (!mevcutYardimcilar.includes(yardimci)) {
    mevcutYardimcilar.push(yardimci);
  }
  return paletlemeKaydet2(siparisId, { yardimcilar: mevcutYardimcilar });
}

/* ============================================================================
   STOK DÜŞME / GERİ EKLEME
   Toplayıcı "toplandı" işaretlediğinde stoktan düşer.
   İşareti kaldırırsa geri eklenir.
   ============================================================================ */
// ============================================================================
// STOK GÖZETLEME (gözaltı/rezerv sistemi)
// Köprü script miktar alanını her 600s'de Mikro'dan üzerine yazar.
// Bu yüzden miktar alanına dokunmuyoruz — ayrı "gozaltiMiktar" alanı kullanıyoruz.
// Köprü bu alanı yazmadığı için kalıcı kalır.
// Ekranda gösterilen: miktar - gozaltiMiktar
// ============================================================================
export async function stokDusur(stokKodu, miktar) {
  if (!stokKodu || !miktar) return;
  try {
    const ref = doc(db, "stoklar", stokKodu);
    await updateDoc(ref, { gozaltiMiktar: increment(Number(miktar)) });
  } catch (e) {
    // Belge yoksa oluştur
    try {
      await setDoc(doc(db, "stoklar", stokKodu), { gozaltiMiktar: Number(miktar) }, { merge: true });
    } catch (e2) { console.warn("Stok gözaltı başarısız:", stokKodu, e2.message); }
  }
}

export async function stokGeriEkle(stokKodu, miktar) {
  if (!stokKodu || !miktar) return;
  try {
    await updateDoc(doc(db, "stoklar", stokKodu), {
      gozaltiMiktar: increment(-Number(miktar))
    });
  } catch (e) {
    console.warn("Stok gözaltı geri alma başarısız:", stokKodu, e.message);
  }
}

// Sisteme aktarıldıktan sonra gözaltıyı sıfırla
export async function stokGozaltiSifirla(stokKodlari) {
  if (!stokKodlari?.length) return;
  const batch = writeBatch(db);
  stokKodlari.forEach((kod) => {
    if (kod) batch.update(doc(db, "stoklar", kod), { gozaltiMiktar: 0 });
  });
  await batch.commit();
}

/* ============================================================================
   FABRİKA — Stok Girişleri
   ============================================================================ */
const STOK_GIRISLER = "stokGirisleri";

export function stokGirisiKaydet(veri) {
  return addDoc(collection(db, STOK_GIRISLER), { ...veri, tarih: serverTimestamp() });
}

export async function stokGirisleriGetir(limit = 100) {
  const snap = await getDocs(query(collection(db, STOK_GIRISLER), orderBy("tarih", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ============================================================================
   RAF - ÜRÜN ARAMA (eksikler için)
   ============================================================================ */
export async function raflaraGoreUrunBul(stokKodu, ad) {
  // collectionGroup ile tek sorguda tüm kalemler — N+1 yerine 1 okuma
  const kalemSnap = await getDocs(collectionGroup(db, "kalemler"));
  const sonuclar = [];
  for (const kalemDoc of kalemSnap.docs) {
    const k = kalemDoc.data();
    const eslesme = (stokKodu && k.stokKodu && k.stokKodu === stokKodu) ||
                    (ad && k.ad && k.ad.toLowerCase() === (ad || "").toLowerCase());
    if (eslesme && (k.miktar > 0 || k.palet > 0)) {
      // Raf adını parent path'ten çıkar: raflar/{rafId}/kalemler/{kalemId}
      const rafId = kalemDoc.ref.parent.parent?.id || "";
      // Raf adını önbellekten al (fazladan sorgu yapmamak için)
      sonuclar.push({
        rafId, rafAdi: k._rafAdi || rafId,
        kat: k.kat, bolme: k.bolme, miktar: k.miktar,
        palet: k.palet, birim: k.birim, skt: k.skt,
        girisTarihi: k.girisTarihi, cari: k.cari
      });
    }
  }
  // Raf adlarını tek seferde çek (sadece bulunan raflar için)
  const rafIdler = [...new Set(sonuclar.map(s => s.rafId).filter(Boolean))];
  if (rafIdler.length) {
    const raflar = await Promise.all(rafIdler.map(id => getDoc(doc(db, "raflar", id))));
    const rafMap = new Map(raflar.filter(d => d.exists()).map(d => [d.id, d.data().ad]));
    sonuclar.forEach(s => { if (s.rafId) s.rafAdi = rafMap.get(s.rafId) || s.rafId; });
  }
  // FEFO sırala
  sonuclar.sort((a, b) => {
    const sktA = a.skt || "9999";
    const sktB = b.skt || "9999";
    if (sktA !== sktB) return sktA.localeCompare(sktB);
    return (a.girisTarihi || "").localeCompare(b.girisTarihi || "");
  });
  return sonuclar;
}

/* ============================================================================
   TOPLAMA ALANLARI
   ============================================================================ */
const ALANLAR = "alanlar";

export function alanlariDinle(callback) {
  return onSnapshot(query(collection(db, ALANLAR), orderBy("ad")), (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => console.error(err));
}

export function alanOlustur(veri) {
  return addDoc(collection(db, ALANLAR), { ...veri, olusturulmaTarihi: serverTimestamp() });
}

export function alanSil(id) {
  return deleteDoc(doc(db, ALANLAR, id));
}

export function siparisAlanAta(siparisId, alanId, alanAdi) {
  return updateDoc(doc(db, SIPARISLER, siparisId), { alanId, alanAdi });
}

/* ============================================================================
   AKTİF KULLANICI TAKİBİ
   ============================================================================ */
export function kullaniciAktifGuncelle(uid, ekBilgi = {}) {
  return updateDoc(doc(db, "kullanicilar", uid), {
    sonAktif: serverTimestamp(),
    ...ekBilgi
  }).catch(() => {});
}

export async function aktifKullanicilariGetir() {
  const sinir = new Date(Date.now() - 10 * 60 * 1000); // 10 dk
  const snap = await getDocs(collection(db, "kullanicilar"));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => u.sonAktif?.toDate?.() > sinir || u.sonAktif > sinir.toISOString());
}

/* ============================================================================
   GÜNLÜK ÖZET
   ============================================================================ */
export async function gunlukOzetGetir() {
  const bugunBaslangic = new Date();
  bugunBaslangic.setHours(0, 0, 0, 0);

  const snap = await getDocs(query(
    collection(db, SIPARISLER),
    where("olusturulmaTarihi", ">=", bugunBaslangic)
  ));

  const siparisler = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const tamamlanan = siparisler.filter(s => ["tamamlandi", "sevk_edildi", "teslim_edildi"].includes(s.durum));
  const bekleyen = siparisler.filter(s => ["toplaniyor", "toplandi", "kontrol_ediliyor"].includes(s.durum));

  const toplamKg = tamamlanan.reduce((t, s) => t + (Number(s.toplamKg) || 0), 0);
  const toplamEksik = siparisler.reduce((t, s) => t + (Number(s.eksikUrun) || 0), 0);

  return {
    toplamSiparis: siparisler.length,
    tamamlanan: tamamlanan.length,
    bekleyen: bekleyen.length,
    toplamKg,
    toplamEksik,
    tarih: bugunBaslangic.toLocaleDateString("tr-TR")
  };
}
