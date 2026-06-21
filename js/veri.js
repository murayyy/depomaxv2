// ============================================================================
// VERİ KATMANI (Firestore)
// Veri modeli:
//   siparisler/{siparisId}            -> { ad, durum, olusturulmaTarihi, olusturan,
//                                           toplamUrun, toplananUrun, eksikUrun, kontrolEdilenUrun }
//   siparisler/{siparisId}/urunler/{urunId} -> { kod, ad, miktar, aciklama, reyon, barkod,
//                                                toplandi, eksik, kontrol, kontrolNotu,
//                                                guncelleyen, guncellemeTarihi }
//   durum: "toplaniyor" -> "toplandi" -> "kontrol_ediliyor" -> "tamamlandi"
// ============================================================================
import { db } from "./firebase.js";
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
    kod: ["Ürün Kodu", "ürün kodu", "Kod", "kod"],
    ad: ["Ürün Adı", "ürün adı", "Ad", "ad", "İsim"],
    miktar: ["Miktar", "miktar"],
    aciklama: ["Açıklama", "açıklama"],
    reyon: ["Reyon", "reyon"],
    barkod: ["Barkod", "barkod"]
  };
  const deger = (satir, alanlar) => {
    for (const a of alanlar) if (satir[a] !== undefined) return satir[a];
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
        miktar: parseInt(deger(satir, KOLON_ESLESTIRME.miktar), 10) || 0,
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
    ...urun,
    toplandi: false,
    eksik: false,
    kontrol: false,
    kontrolNotu: "",
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

export async function urunleriniGetir(siparisId) {
  const snap = await getDocs(collection(db, SIPARISLER, siparisId, "urunler"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
