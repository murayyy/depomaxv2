// ============================================================================
// MİKRO ↔ DEPO STOK KARŞILAŞTIRMA
//   Olması gereken = Mikro depo stoğu (stokOzet) − toplanmış ama Mikro'ya aktarılmamış miktar
//   Depoda sayılan = toplama gözleri (KOD ve KOD@ADA) + raf kalemleri
// Okuma: stokOzet 8 belge + gözler (canlı) ; raflar ve bekleyen siparişler sadece "Yeniden Hesapla"da.
// ============================================================================
import { auth, signOut, sayfaKorumasi, db } from "./firebase.js";
import { tumGozleriDinle, rafKalemHaritasiGetir } from "./veri.js?v=20261118";
import { arayuzHazirla, toast, kacisEt, sayiBicimle, ondalikOku } from "./utils.js";
import { collection, onSnapshot, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

arayuzHazirla();

let mikro = new Map();     // kod -> {ad, miktar, birim}
let goz = new Map();       // kod -> miktar (göz toplamı)
let raf = new Map();       // kod -> miktar
let bekleyen = new Map();  // kod -> toplanmış ama Mikro'ya aktarılmamış miktar
let bekleyenSiparis = 0;
let sonHesap = null;
let satirlar = [];

sayfaKorumasi(["depocu", "admin"], (k) => {
  document.getElementById("kullaniciAdi").textContent = k.ad || k.uid;
  document.getElementById("rolEtiketi").textContent = k.rol;
  onSnapshot(collection(db, "stokOzet"), (snap) => {
    const m = new Map();
    snap.docs.forEach((d) => (d.data().urunler || []).forEach((u) => {
      if (u && u.kod) m.set(String(u.kod).trim(), { ad: u.ad || "", miktar: Number(u.miktar) || 0, birim: u.birim || "" });
    }));
    mikro = m;
    hesapla();
  }, (e) => toast("Mikro stoğu okunamadı: " + e.code, "error"));
  tumGozleriDinle((liste) => {
    const m = new Map();
    liste.forEach((g) => {
      const kod = String(g.kod || g.id.split("@")[0]).trim();
      m.set(kod, (m.get(kod) || 0) + (Number(g.miktar) || 0));
    });
    goz = m;
    hesapla();
  });
  yenidenOku();
});

document.getElementById("cikisBtn").addEventListener("click", async () => { await signOut(auth); location.href = "index.html"; });
document.getElementById("yenileBtn").addEventListener("click", yenidenOku);
["ara", "filtre", "tolerans"].forEach((id) => document.getElementById(id).addEventListener("input", ciz));
document.getElementById("excelBtn").addEventListener("click", excel);

async function yenidenOku() {
  const btn = document.getElementById("yenileBtn");
  btn.disabled = true;
  try {
    // Raflar
    const harita = await rafKalemHaritasiGetir();
    const r = new Map();
    harita.forEach((liste, anahtar) => {
      if (!anahtar.startsWith("kod:")) return;
      const kod = anahtar.slice(4);
      r.set(kod, liste.reduce((t, k) => t + (Number(k.miktar) || 0), 0));
    });
    raf = r;

    // Toplanmış (gözden düşmüş) ama Mikro'ya aktarılmamış siparişler — son 14 gün
    const sinir = Date.now() - 14 * 864e5;
    const snap = await getDocs(query(collection(db, "siparisler"),
      where("durum", "in", ["toplaniyor", "toplandi", "kontrol_ediliyor", "tamamlandi", "sevk_edildi"])));
    const adaylar = snap.docs.filter((d) => {
      const s = d.data();
      const t = s.olusturulmaTarihi?.toMillis?.() || 0;
      return !s.sistemeAktarildi && t >= sinir;
    });
    const b = new Map();
    await Promise.all(adaylar.map(async (d) => {
      const u = await getDocs(collection(db, "siparisler", d.id, "urunler"));
      u.docs.forEach((x) => {
        const k = x.data();
        if (!k.toplandi || k.eksik || !k.kod) return;
        const m = Number(k.gercekMiktar ?? k.miktar) || 0;
        b.set(String(k.kod).trim(), (b.get(String(k.kod).trim()) || 0) + m);
      });
    }));
    bekleyen = b;
    bekleyenSiparis = adaylar.length;
    sonHesap = new Date();
    hesapla();
  } catch (e) {
    console.error(e);
    toast("Okunamadı: " + (e.code || e.message), "error");
  } finally { btn.disabled = false; }
}

const yuv = (n) => Math.round(n * 1000) / 1000;

function hesapla() {
  const kodlar = new Set([...goz.keys(), ...raf.keys()]);
  satirlar = [...new Set([...mikro.keys(), ...kodlar])].map((kod) => {
    const mk = mikro.get(kod);
    const mikroM = mk ? mk.miktar : 0;
    const bek = bekleyen.get(kod) || 0;
    const gozM = goz.get(kod) || 0;
    const rafM = raf.get(kod) || 0;
    const olmali = yuv(mikroM - bek);
    const sayilan = yuv(gozM + rafM);
    return {
      kod, ad: mk?.ad || "", birim: mk?.birim || "",
      mikro: mikroM, bekleyen: bek, olmali, goz: gozM, raf: rafM, sayilan,
      fark: yuv(sayilan - olmali), takip: kodlar.has(kod), mikrodaYok: !mk
    };
  });
  ciz();
}

function ciz() {
  const ara = document.getElementById("ara").value.trim().toLocaleLowerCase("tr");
  const filtre = document.getElementById("filtre").value;
  const tol = Math.abs(ondalikOku(document.getElementById("tolerans").value) || 0);
  const farkli = (s) => Math.abs(s.fark) > tol;
  let l = satirlar.filter((s) => !ara || s.kod.toLocaleLowerCase("tr").includes(ara) || s.ad.toLocaleLowerCase("tr").includes(ara));
  if (filtre === "takipdisi") l = l.filter((s) => !s.takip && s.olmali > 0);
  else {
    l = l.filter((s) => s.takip);
    if (filtre === "farkli") l = l.filter(farkli);
    if (filtre === "eksi") l = l.filter((s) => farkli(s) && s.fark < 0);
    if (filtre === "arti") l = l.filter((s) => farkli(s) && s.fark > 0);
  }
  l.sort((a, b) => filtre === "takipdisi" ? b.olmali - a.olmali : Math.abs(b.fark) - Math.abs(a.fark));

  const takip = satirlar.filter((s) => s.takip);
  const eksi = takip.filter((s) => farkli(s) && s.fark < 0).length;
  const arti = takip.filter((s) => farkli(s) && s.fark > 0).length;
  const disi = satirlar.filter((s) => !s.takip && s.olmali > 0).length;
  document.getElementById("ozetKutular").innerHTML = `
    <div class="ozet-kutu"><small>Takip edilen ürün</small><b>${takip.length}</b></div>
    <div class="ozet-kutu"><small>Depoda eksik</small><b class="fark-eksi">${eksi}</b></div>
    <div class="ozet-kutu"><small>Depoda fazla</small><b class="fark-arti">${arti}</b></div>
    <div class="ozet-kutu"><small>Gözü/rafı tanımsız</small><b>${disi}</b></div>
    <div class="ozet-kutu"><small>Aktarılmamış sipariş</small><b>${bekleyenSiparis}</b></div>`;
  document.getElementById("durumYazi").textContent = sonHesap
    ? `Raflar ve siparişler ${sonHesap.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} itibarıyla · Mikro ve gözler canlı`
    : "Hesaplanıyor…";

  const tablo = document.getElementById("tablo");
  document.getElementById("bos").classList.toggle("u-hidden", l.length > 0);
  const n = (v) => (v ? sayiBicimle(v) : "—");
  tablo.innerHTML = l.slice(0, 500).map((s) => `<tr>
    <td class="cell-code">${kacisEt(s.kod)}</td>
    <td>${kacisEt(s.ad || "—")}${s.mikrodaYok ? ' <span class="badge badge-red">Mikro\'da yok</span>' : ""}<div class="satir-detay">${kacisEt(s.birim)}</div></td>
    <td class="sayi">${n(s.mikro)}</td>
    <td class="sayi">${s.bekleyen ? "−" + sayiBicimle(s.bekleyen) : "—"}</td>
    <td class="sayi"><b>${sayiBicimle(s.olmali)}</b></td>
    <td class="sayi">${n(s.goz)}</td>
    <td class="sayi">${n(s.raf)}</td>
    <td class="sayi"><b>${sayiBicimle(s.sayilan)}</b></td>
    <td class="sayi ${s.fark < 0 ? "fark-eksi" : s.fark > 0 ? "fark-arti" : ""}">${s.fark ? (s.fark > 0 ? "+" : "") + sayiBicimle(s.fark) : "—"}</td>
  </tr>`).join("") + (l.length > 500 ? `<tr><td colspan="9" class="u-text-soft">İlk 500 satır gösteriliyor (${l.length}). Hepsi için Excel.</td></tr>` : "");
}

function excel() {
  const veri = [["Kod", "Ürün", "Birim", "Mikro", "Aktarılmamış", "Olması gereken", "Göz", "Raf", "Depoda sayılan", "Fark", "Takip"]]
    .concat(satirlar.filter((s) => s.takip || s.olmali > 0).sort((a, b) => Math.abs(b.fark) - Math.abs(a.fark))
      .map((s) => [s.kod, s.ad, s.birim, s.mikro, s.bekleyen, s.olmali, s.goz, s.raf, s.sayilan, s.fark, s.takip ? "evet" : "hayır"]));
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(veri), "Karşılaştırma");
  window.XLSX.writeFile(wb, `stok_karsilastirma_${new Date().toLocaleDateString("tr-TR").replace(/\./g, "-")}.xlsx`);
}
