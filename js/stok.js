// ============================================================================
// STOK GÖRÜNTÜLEME (salt okunur)
// ----------------------------------------------------------------------------
// Bu veriler Depomax'tan YAZILMIYOR — "stok_kopru.py" scripti, depodaki
// bilgisayardan Mikro tabanlı "Stok Komuta Merkezi" backend'ini okuyup
// buraya (Firestore) senkronize ediyor. Depomax sadece gösterim için okur.
// ============================================================================
import { db } from "./firebase.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { toast, sesCal, sayiBicimle, kacisEt } from "./utils.js";

const STOKLAR = "stoklar";

// Bildirim takibi için modül seviyesinde tutulan durum (kod -> son bilinen miktar).
let _oncekiStokMiktarlari = new Map();
let _stokIlkYukleme = true;

/**
 * Tüm stok kayıtlarını dinler ve kod -> kayıt eşlemesi olan bir Map döner.
 * callback(map, dizi) şeklinde çağrılır. Ayrıca yeni eklenen ürünleri ve
 * stoğu sıfırdan/eksiden pozitife dönen ürünleri otomatik olarak bildirir.
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

    dizi.forEach((veri) => {
      const eskiMiktar = _oncekiStokMiktarlari.get(veri.kod);
      const yeniMiktar = Number(veri.miktar) || 0;
      if (!_stokIlkYukleme) {
        if (eskiMiktar === undefined) {
          sesCal("basari");
          toast(`🆕 Yeni ürün stoğa açıldı: ${kacisEt(veri.ad || veri.kod)}`, "info", 5000);
        } else if (eskiMiktar <= 0 && yeniMiktar > 0) {
          sesCal("basari");
          toast(`📦 Stoğa geldi: ${kacisEt(veri.ad || veri.kod)} (${sayiBicimle(yeniMiktar)} ${kacisEt(veri.birim || "")})`, "success", 6000);
        }
      }
      _oncekiStokMiktarlari.set(veri.kod, yeniMiktar);
    });
    _stokIlkYukleme = false;

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
