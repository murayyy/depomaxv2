// ============================================================================
// STOK GÖRÜNTÜLEME (salt okunur)
// ----------------------------------------------------------------------------
// Bu veriler Depomax'tan YAZILMIYOR — "stok_kopru.py" scripti, depodaki
// bilgisayardan Mikro tabanlı "Stok Komuta Merkezi" backend'ini okuyup
// buraya (Firestore) senkronize ediyor. Depomax sadece gösterim için okur.
// ============================================================================
import { db } from "./firebase.js";
import { collection, doc, updateDoc, onSnapshot, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { toast, sesCal, sayiBicimle, kacisEt } from "./utils.js";

const STOKLAR = "stoklar";

/**
 * "Yeni ürün" / "stoğa geldi" bildirim bayrağını temizler — kullanıcı
 * ürünü bir siparişe eklediğinde veya "Gördüm" dediğinde çağrılır.
 */
export function stokBildirimGoruldu(kod) {
  return updateDoc(doc(db, STOKLAR, kod), { durumDegisimi: null });
}

// Bildirim takibi için modül seviyesinde tutulan durum (kod -> son bilinen miktar).
let _oncekiStokMiktarlari = new Map();
let _stokIlkYukleme = true;

/**
 * Tüm stok kayıtlarını dinler ve kod -> kayıt eşlemesi olan bir Map döner.
 * callback(map, dizi) şeklinde çağrılır. Ayrıca yeni eklenen ürünleri ve
 * stoğu sıfırdan/eksiden pozitife dönen ürünleri otomatik olarak bildirir.
 *
 * KOTA: Eskiden "stoklar" koleksiyonunun tamamı (ürün başına 1 okuma) 2 dakikada
 * bir okunuyordu. Artık:
 *   - stokOzet/parca_* (8 belge): köprünün yazdığı tüm ürünlerin özeti. Sadece
 *     değişen parça yeniden okunur.
 *   - stoklar içinde sadece gözaltı miktarı olan ya da bildirim bayrağı taşıyan
 *     belgeler canlı dinlenir (ekranların yazdığı alanlar buradan gelir).
 * Köprü henüz özet yazmıyorsa eski yönteme (tam okuma) 10 dakikada bir döner.
 */
export function stoklariDinle(callback) {
  let aktif = true;
  const ozet = new Map();       // kod -> köprü verisi
  const gozalti = new Map();    // kod -> stoklar belgesi (gozaltiMiktar != 0)
  const bildirim = new Map();   // kod -> stoklar belgesi (durumDegisimi dolu)
  let ozetGeldi = false;
  let yedekZamanlayici = null;
  let yaymaZamanlayici = null;
  const iptaller = [];

  function yay() {
    clearTimeout(yaymaZamanlayici);
    yaymaZamanlayici = setTimeout(() => {
      if (!aktif || !ozetGeldi) return;
      const map = new Map();
      ozet.forEach((v, kod) => map.set(kod, { ...v, kod }));
      [gozalti, bildirim].forEach((kaynak) => kaynak.forEach((v, kod) => {
        map.set(kod, { ...(map.get(kod) || {}), ...v, kod });
      }));
      sonucuIsle(map);
    }, 250);
  }

  function sonucuIsle(map) {
    const dizi = [...map.values()];
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
  }

  // --- Yedek: köprü özet yazmıyorsa eski tam okuma (10 dakikada bir) ---
  async function tamOku() {
    if (!aktif) return;
    try {
      const snap = await getDocs(collection(db, STOKLAR));
      const map = new Map();
      snap.docs.forEach((d) => map.set(d.id, { kod: d.id, ...d.data() }));
      sonucuIsle(map);
    } catch (err) {
      console.error("stoklariDinle (yedek):", err);
    }
  }
  function yedegeGec() {
    if (yedekZamanlayici || !aktif) return;
    console.warn("stokOzet bulunamadı, stoklar tam okunuyor (köprü güncel mi?).");
    tamOku();
    yedekZamanlayici = setInterval(tamOku, 10 * 60 * 1000);
  }

  // --- 1) Özet ---
  iptaller.push(onSnapshot(collection(db, "stokOzet"), (snap) => {
    if (snap.empty) { yedegeGec(); return; }
    if (yedekZamanlayici) { clearInterval(yedekZamanlayici); yedekZamanlayici = null; }
    ozet.clear();
    snap.docs.forEach((d) => (d.data().urunler || []).forEach((u) => { if (u && u.kod) ozet.set(String(u.kod), u); }));
    ozetGeldi = true;
    yay();
  }, (err) => { console.error("stokOzet:", err); yedegeGec(); }));

  // --- 2) Ekranların yazdığı alanlar: gözaltı ve bildirim bayrağı ---
  const dinle = (q, hedef, ad) => iptaller.push(onSnapshot(q, (snap) => {
    hedef.clear();
    snap.docs.forEach((d) => hedef.set(d.id, { kod: d.id, ...d.data() }));
    yay();
  }, (err) => console.error(ad, err)));
  dinle(query(collection(db, STOKLAR), where("gozaltiMiktar", "!=", 0)), gozalti, "stoklar(gozalti):");
  dinle(query(collection(db, STOKLAR), where("durumDegisimi", "in", ["yeni", "stoga_geldi"])), bildirim, "stoklar(bildirim):");

  // unsubscribe fonksiyonu döndür (eski kullanım ile aynı)
  return () => {
    aktif = false;
    clearInterval(yedekZamanlayici);
    clearTimeout(yaymaZamanlayici);
    iptaller.forEach((f) => { try { f(); } catch (e) {} });
  };
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
  const miktar = Number(stokKaydi.miktar) || 0;
  const gozalti = Number(stokKaydi.gozaltiMiktar) || 0;
  const kullanilabilir = miktar - gozalti;
  const gozaltiEtiketi = gozalti > 0
    ? ` <span class="badge badge-amber" title="Toplama alanında">-${gozalti} toplmda</span>`
    : "";
  return `<span class="badge ${sinif}">${stokKaydi.durum || "—"} · ${kullanilabilir} ${stokKaydi.birim || ""}</span>${gozaltiEtiketi}`;
}
