// ============================================================================
// STOK GÖRÜNTÜLEME (salt okunur)
// ----------------------------------------------------------------------------
// Bu veriler Depomax'tan YAZILMIYOR — "stok_kopru.py" scripti, depodaki
// bilgisayardan Mikro tabanlı "Stok Komuta Merkezi" backend'ini okuyup
// buraya (Firestore) senkronize ediyor. Depomax sadece gösterim için okur.
// ============================================================================
import { db } from "./firebase.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const STOKLAR = "stoklar";

/**
 * Tüm stok kayıtlarını dinler ve kod -> kayıt eşlemesi olan bir Map döner.
 * callback(map, dizi) şeklinde çağrılır.
 */
export function stoklariDinle(callback) {
  return onSnapshot(collection(db, STOKLAR), (snap) => {
    const map = new Map();
    const dizi = [];
    snap.docs.forEach((d) => {
      const veri = { kod: d.id, ...d.data() };
      map.set(d.id, veri);
      dizi.push(veri);
    });
    callback(map, dizi);
  }, (err) => console.error("stoklariDinle:", err));
}

export const DURUM_RENK = {
  "Tükendi": "badge-red",
  "Kritik": "badge-amber",
  "Uyarı": "badge-amber",
  "Normal": "badge-green"
};

export function stokRozetiHtml(stokKaydi) {
  if (!stokKaydi) return '<span class="badge badge-gray">Stok verisi yok</span>';
  const sinif = DURUM_RENK[stokKaydi.durum] || "badge-gray";
  return `<span class="badge ${sinif}">${stokKaydi.durum || "—"}</span>`;
}
