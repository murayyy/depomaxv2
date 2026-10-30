// ============================================================================
// İKMAL UYARISI (depocunun açık tuttuğu her sayfada çalışır)
// Menüdeki "🔔 İkmal" bağlantısına bekleyen göz sayısını yazar; yeni bir göz
// uyarı seviyesine düşünce ses çalar ve bildirim gösterir.
// Kullanım: ikmalUyarisiniBaslat()  — sayfada id="ikmalSayac" olan bir rozet bulunmalı.
// Kota: sadece doldurulması gereken gözler dinlenir.
// ============================================================================
import { ikmalBekleyenleriDinle } from "./veri.js?v=20261030c";
import { toast, sesCal } from "./utils.js";

let sesBaglami = null;

function sesiHazirla() {
  try {
    sesBaglami = sesBaglami || new (window.AudioContext || window.webkitAudioContext)();
    if (sesBaglami.state === "suspended") sesBaglami.resume();
  } catch (e) { sesBaglami = null; }
}

function alarmCal(tekrar = 3) {
  if (!sesBaglami) { try { sesCal("hata"); } catch (e) {} return; }
  const t0 = sesBaglami.currentTime;
  for (let i = 0; i < tekrar; i++) {
    [880, 660].forEach((frekans, j) => {
      const osc = sesBaglami.createOscillator();
      const kazanc = sesBaglami.createGain();
      const bas = t0 + i * 0.7 + j * 0.22;
      osc.type = "square";
      osc.frequency.value = frekans;
      kazanc.gain.setValueAtTime(0.0001, bas);
      kazanc.gain.exponentialRampToValueAtTime(0.25, bas + 0.02);
      kazanc.gain.exponentialRampToValueAtTime(0.0001, bas + 0.2);
      osc.connect(kazanc).connect(sesBaglami.destination);
      osc.start(bas);
      osc.stop(bas + 0.21);
    });
  }
}

export function ikmalUyarisiniBaslat() {
  // Tarayıcılar sesi ancak sayfaya bir dokunuştan sonra çalar
  document.addEventListener("click", sesiHazirla, { once: true });
  document.addEventListener("keydown", sesiHazirla, { once: true });

  const sayac = document.getElementById("ikmalSayac");
  const baslik = document.title.replace(/^\(\d+\)\s*/, "");
  let ilk = true;
  let bekleyenSayi = 0;

  ikmalBekleyenleriDinle((liste, yeniGelenler) => {
    bekleyenSayi = liste.length;
    if (sayac) {
      sayac.textContent = liste.length;
      sayac.classList.toggle("u-hidden", liste.length === 0);
    }
    document.title = (liste.length ? `(${liste.length}) ` : "") + baslik;

    if (!ilk && yeniGelenler.length) {
      alarmCal(3);
      const g = yeniGelenler[0];
      const metin = yeniGelenler.length === 1
        ? `🔔 Toplama gözü azaldı: ${g.ad || g.kod} (${g.reyon || "reyon yok"}). İkmal ekranından doldurun.`
        : `🔔 ${yeniGelenler.length} toplama gözü azaldı. İkmal ekranından doldurun.`;
      toast(metin, "error", 10000);
      if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
        try { new Notification("Depomax · Toplama gözü", { body: metin.replace("🔔 ", ""), tag: "ikmal" }); } catch (e) {}
      }
    }
    ilk = false;
  });

  // Doldurulmayı bekleyen göz varsa 10 dakikada bir kısa hatırlatma
  setInterval(() => { if (bekleyenSayi) alarmCal(1); }, 10 * 60 * 1000);
}
