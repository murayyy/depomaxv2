// ============================================================================
// CANLI TAKİP — polling ile (30s), sürekli listener değil
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { db } from "./firebase.js";
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { urunleriniGetir } from "./veri.js";
import { arayuzHazirla, kacisEt, sayiBicimle } from "./utils.js";

arayuzHazirla();

let siparisler = [];
let urunSayilari = new Map();
let sureSayaci = null;
let pollingInterval = null;

sayfaKorumasi(["admin"], (kullanici) => {
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  baslatTakip();
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  clearInterval(pollingInterval);
  clearInterval(sureSayaci);
  await signOut(auth); window.location.href = "index.html";
});

async function aktifSiparisleriGetir() {
  const snap = await getDocs(query(
    collection(db, "siparisler"),
    where("durum", "in", ["toplaniyor", "toplandi", "kontrol_ediliyor"])
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function baslatTakip() {
  async function guncelle() {
    try {
      siparisler = await aktifSiparisleriGetir();
      for (const s of siparisler) {
        if (!urunSayilari.has(s.id)) {
          try {
            const urunler = await urunleriniGetir(s.id);
            urunSayilari.set(s.id, {
              toplam: urunler.length,
              toplanan: urunler.filter(u => u.toplandi).length,
              eksik: urunler.filter(u => u.eksik).length
            });
          } catch {
            urunSayilari.set(s.id, { toplam: s.toplamUrun || 0, toplanan: s.toplananUrun || 0, eksik: s.eksikUrun || 0 });
          }
        }
      }
      render();
    } catch (err) { console.error(err); }
  }

  guncelle();
  pollingInterval = setInterval(guncelle, 30 * 1000);
  sureSayaci = setInterval(() => {
    document.querySelectorAll("[data-baslangic]").forEach(el => {
      el.textContent = gecenSure(el.dataset.baslangic);
    });
  }, 1000);
}

function gecenSure(isoStr) {
  if (!isoStr) return "—";
  const sn = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if (sn < 60) return `${sn} sn`;
  const dk = Math.floor(sn / 60);
  if (dk < 60) return `${dk} dk ${sn % 60} sn`;
  const saat = Math.floor(dk / 60);
  return `${saat}s ${dk % 60}dk`;
}

function render() {
  const grid = document.getElementById("canliGrid");
  const bos = document.getElementById("bosDurum");

  // Bugün tamamlananlar için ayrı sorgu yapmıyoruz — sadece aktifler
  const bugün = new Date().toDateString();
  const toplaniyor = siparisler.filter(s => s.durum === "toplaniyor");
  const kontrol = siparisler.filter(s => s.durum === "kontrol_ediliyor");
  const bekliyor = siparisler.filter(s => s.durum === "toplandi");

  document.getElementById("ozetToplaniyor").textContent = toplaniyor.length;
  document.getElementById("ozetKontrol").textContent = kontrol.length;
  document.getElementById("ozetBekliyor").textContent = bekliyor.length;
  document.getElementById("ozetTamamlandi").textContent = "—";
  document.getElementById("sonGuncelleme").textContent = `Son güncelleme: ${new Date().toLocaleTimeString("tr-TR")}`;

  const aktif = [...toplaniyor, ...kontrol, ...bekliyor];
  if (!aktif.length) {
    grid.innerHTML = "";
    bos.classList.remove("u-hidden");
    return;
  }
  bos.classList.add("u-hidden");

  grid.innerHTML = aktif.map((s) => {
    const sayilar = urunSayilari.get(s.id) || { toplam: s.toplamUrun || 0, toplanan: s.toplananUrun || 0, eksik: s.eksikUrun || 0 };
    const { toplam, toplanan, eksik } = sayilar;
    const yuzde = toplam > 0 ? Math.round((toplanan / toplam) * 100) : 0;

    let sinif = "bekliyor";
    let durum = "Bekliyor";
    let renk = "gray";
    let personel = "—";
    let baslangic = null;

    if (s.durum === "toplaniyor") {
      sinif = "toplaniyor";
      durum = "Toplanıyor";
      renk = "blue";
      personel = s.toplayanKullanici || s.toplamayiTamamlayan || "—";
      baslangic = s.toplamaBaslangic;
    } else if (s.durum === "kontrol_ediliyor") {
      sinif = "kontrol";
      durum = "Kontrol";
      renk = "purple";
      personel = s.kontrolTamamlayan || s.kontrolBaşlayan || "—";
      baslangic = s.kontrolBaslangic;
    } else if (s.durum === "toplandi") {
      sinif = "bekliyor";
      durum = "Kontrol Bekliyor";
      personel = s.toplamayiTamamlayan || "—";
    }

    const acilRenk = s.aciliyet === "cok_acil" ? "#EF4444" : s.aciliyet === "acil" ? "#F59E0B" : "transparent";
    const acilEtiket = s.aciliyet === "cok_acil" ? "🔴 Çok Acil" : s.aciliyet === "acil" ? "⚡ Acil" : "";

    return `
      <div class="canli-kart ${sinif}">
        ${acilEtiket ? `<div style="font-size:11px;font-weight:700;color:${acilRenk};margin-bottom:4px;">${acilEtiket}</div>` : ""}
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-weight:700;font-size:14px;">${kacisEt(s.ad || s.subeAdi || "—")}</div>
            <div class="canli-personel" style="margin-top:2px;">👤 ${kacisEt(personel)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px;font-weight:700;color:var(--color-${renk === "blue" ? "blue" : renk === "purple" ? "ink" : "ink-soft"});">${durum}</div>
            ${baslangic ? `<div class="canli-sure" data-baslangic="${baslangic}">${gecenSure(baslangic)}</div>` : ""}
          </div>
        </div>

        <div class="progress-bar">
          <div class="progress-fill ${renk}" style="width:${yuzde}%;"></div>
        </div>

        <div style="display:flex;justify-content:space-between;font-size:12px;">
          <span>${toplanan}/${toplam} ürün</span>
          <span style="font-weight:700;">%${yuzde}</span>
        </div>
        ${eksik > 0 ? `<div style="font-size:11.5px;color:#EF4444;margin-top:4px;">⚠ ${eksik} eksik ürün</div>` : ""}
        ${s.toplamKg ? `<div style="font-size:11.5px;color:var(--color-ink-soft);margin-top:2px;">${sayiBicimle(s.toplamKg)} KG</div>` : ""}
      </div>`;
  }).join("");
}
