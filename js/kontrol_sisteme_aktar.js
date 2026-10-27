// =====================================================================
// js/kontrol.js  —  "⬆ Sisteme Aktar" butonu: Mikro'ya otomatik aktarım
// ---------------------------------------------------------------------
// KURULUM: kontrol.js içinde şu satırla başlayan bloğun TAMAMINI silin:
//     document.getElementById("sistemeAktarBtn").addEventListener("click", async () => {
// ve bitişindeki  });  dahil, yerine bu dosyadaki kodun tamamını yapıştırın.
// (Import satırına dokunmanız gerekmiyor; kullanılanlar zaten import ediliyor:
//  siparisGuncelle, tumSiparisleriCanliDinle, stokGozaltiSifirla, serverTimestamp)
//
// AKIŞ:
//  1. Butona basılınca siparişe  mikroAktarim.durum = "bekliyor"  yazılır.
//  2. Sunucudaki API (mikro_aktar.py) siparişi alıp Mikro'ya fiş olarak yazar.
//  3. Sonuç bu ekrana canlı düşer: evrak no ile "tamam" ya da hata mesajı.
//  4. Hata olursa eskisi gibi CSV indirme seçeneği sunulur.
// =====================================================================

function sistemeAktarCsvIndir(toplananlar) {
  // Eski yöntem (yedek): Türkçe Excel için ; ayraç, virgüllü ondalık, baştaki sıfırlar korunur.
  const satirlar = toplananlar.map((u) => {
    const miktar = u.gercekMiktar !== undefined && u.gercekMiktar !== null ? u.gercekMiktar : u.miktar;
    return `="${u.kod}";${String(miktar || 0).replace(".", ",")}`;
  });
  const blob = new Blob(["﻿" + satirlar.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const paletEki = aktifSiparis.paletSayisi ? `_${aktifSiparis.paletSayisi}Palet` : "";
  a.download = `${(aktifSiparis.ad || "siparis").replace(/[^\wçğıöşüÇĞİÖŞÜ\- ]/g, "_")}${paletEki}_sisteme_aktar.csv`;
  a.click();
}

let mikroAktarimBekleniyor = false;

document.getElementById("sistemeAktarBtn").addEventListener("click", async () => {
  if (mikroAktarimBekleniyor) {
    toast("Aktarım sürüyor, lütfen bekleyin.", "error");
    return;
  }
  if (aktifSiparis.sistemeAktarildi) {
    const evrak = aktifSiparis.mikroAktarim && aktifSiparis.mikroAktarim.evrak;
    toast(`Bu sipariş zaten Mikro'ya aktarılmış${evrak ? " (evrak " + evrak + ")" : ""}.`, "error");
    return;
  }

  const toplananlar = urunlerCache
    .filter((u) => u.toplandi && !u.eksik && u.kod)
    .slice()
    .sort((a, b) => String(a.kod).localeCompare(String(b.kod)));
  if (toplananlar.length === 0) {
    toast("Aktarılacak toplanmış ürün bulunamadı.", "error");
    return;
  }

  const btn = document.getElementById("sistemeAktarBtn");
  const eskiYazi = btn.textContent;
  const siparisId = aktifSiparis.id;
  const siparisAdi = aktifSiparis.ad || "Sipariş";
  mikroAktarimBekleniyor = true;
  btn.disabled = true;
  btn.textContent = "⏳ Mikro'ya yazılıyor…";

  try {
    await siparisGuncelle(siparisId, {
      mikroAktarim: { durum: "bekliyor", istekTarihi: serverTimestamp(), satirSayisi: toplananlar.length },
    });
  } catch (e) {
    mikroAktarimBekleniyor = false;
    btn.disabled = false;
    btn.textContent = eskiYazi;
    toast("Aktarım isteği kaydedilemedi: " + e.message, "error");
    return;
  }

  let bitti = false;
  let dinleyiciKapat = null;

  const bitir = () => {
    bitti = true;
    mikroAktarimBekleniyor = false;
    btn.disabled = false;
    btn.textContent = eskiYazi;
    clearTimeout(zamanAsimi);
    if (typeof dinleyiciKapat === "function") dinleyiciKapat();
  };

  // 2 dakika içinde sonuç gelmezse: API kapalı olabilir.
  const zamanAsimi = setTimeout(() => {
    if (bitti) return;
    bitir();
    toast(
      "Sunucudan yanıt gelmedi, API kapalı olabilir. İstek sırada bekliyor; API açılınca aktarılır. " +
        "Beklemeden elle aktarmak isterseniz butona Shift tuşuyla basın (CSV iner, istek iptal edilir).",
      "error"
    );
  }, 120000);

  dinleyiciKapat = tumSiparisleriCanliDinle(async (liste) => {
    if (bitti) return;
    const s = liste.find((x) => x.id === siparisId);
    const durum = s && s.mikroAktarim && s.mikroAktarim.durum;
    if (durum === "tamam") {
      bitir();
      const toplamananKodlar = toplananlar.map((u) => u.kod);
      try {
        if (toplamananKodlar.length) await stokGozaltiSifirla(toplamananKodlar);
      } catch (e) {
        console.error("Gözaltı sıfırlanamadı", e);
      }
      const uyari = (s.mikroAktarim.uyarilar || []).length;
      toast(
        `${siparisAdi}: Mikro'da evrak ${s.mikroAktarim.evrak} oluştu (${s.mikroAktarim.satir} satır).` +
          (uyari ? ` ${uyari} ürün fiyatsız yazıldı, Mikro'da kontrol edin.` : ""),
        "success"
      );
      if (aktifSiparis && aktifSiparis.id === siparisId) geriDon();
    } else if (durum === "hata") {
      bitir();
      const mesaj = s.mikroAktarim.mesaj || "Bilinmeyen hata";
      // Tekrar denenebilmesi için durumu temizle
      try {
        await siparisGuncelle(siparisId, { "mikroAktarim.durum": "hata_goruldu" });
      } catch (e) {}
      toast(`Mikro'ya aktarılamadı: ${mesaj}. Düzeltip tekrar deneyin ya da Shift + tık ile CSV indirip elle aktarın.`, "error");
    }
  }, 7);
});

// Shift + tık: eski yöntem. CSV iner, sipariş "aktarıldı" işaretlenir ve bekleyen
// otomatik aktarım isteği iptal edilir (aynı sipariş Mikro'ya iki kez girmesin diye).
document.getElementById("sistemeAktarBtn").addEventListener(
  "click",
  async (e) => {
    if (!e.shiftKey) return;
    e.stopImmediatePropagation();
    if (aktifSiparis.sistemeAktarildi) return toast("Bu sipariş zaten aktarılmış.", "error");
    const durum = aktifSiparis.mikroAktarim && aktifSiparis.mikroAktarim.durum;
    if (durum === "isleniyor") return toast("Sunucu şu an bu siparişi Mikro'ya yazıyor, bekleyin.", "error");
    const toplananlar = urunlerCache
      .filter((u) => u.toplandi && !u.eksik && u.kod)
      .slice()
      .sort((a, b) => String(a.kod).localeCompare(String(b.kod)));
    if (!toplananlar.length) return toast("Aktarılacak toplanmış ürün bulunamadı.", "error");
    sistemeAktarCsvIndir(toplananlar);
    await siparisGuncelle(aktifSiparis.id, {
      sistemeAktarildi: true,
      sistemeAktarTarihi: serverTimestamp(),
      mikroAktarim: { durum: "csv", istekTarihi: serverTimestamp() },
    });
    try {
      await stokGozaltiSifirla(toplananlar.map((u) => u.kod));
    } catch (err) {
      console.error("Gözaltı sıfırlanamadı", err);
    }
    toast("CSV indirildi, sipariş 'Sisteme Aktarıldı' işaretlendi. Mikro'ya elle aktarın.", "success");
    geriDon();
  },
  true
);
