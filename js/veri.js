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
  query, where, orderBy, serverTimestamp, writeBatch, getDocs
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

export async function siparisOlustur({ ad, olusturan }) {
  const ref = await addDoc(collection(db, SIPARISLER), {
    ad,
    durum: "toplaniyor",
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

export function katalogDinle(callback) {
  const q = query(collection(db, KATALOG), orderBy("sira", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => console.error("katalogDinle:", err));
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
      kod: s.kod || "",
      ad: s.ad || "",
      miktar: ondalikOku(s.miktar),
      birim: s.birim || "",
      reyon: s.reyon || "",
      aciklama: s.aciklama || "",
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
