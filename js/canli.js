// ============================================================================
// CANLI TAKİP — tablet / TV için canlı sipariş panosu (salt okunur)
// Kaynak: siparisler (son 7 gün) + eksik işaretli ürünler (alt koleksiyon)
// ============================================================================
import { db, sayfaKorumasi } from "./firebase.js";
import { tumSiparisleriCanliDinle } from "./veri.js?v=20261127";
import { collection, getDocs, query, where, onSnapshot, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const STAGES = [
  ["bekliyor", "Bekliyor", "--s0"],
  ["toplaniyor", "Toplanıyor", "--s1"],
  ["kontrol", "Kontrolde", "--s2"],
  ["hazir", "Hazır", "--s3"],
  ["yolda", "Yola çıktı", "--s4"]
];
const SC = Object.fromEntries(STAGES.map((s) => [s[0], `var(${s[2]})`]));
const KART_SINIRI = 7;
const GEC_DK = 60; // bu kadar dakikadır bekleyen sarı yazılır

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tarih = (v) => {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (v.seconds != null) return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d) ? null : d;
};
const saat = (d) => d ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "";
const bugunBas = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const bugun = (d) => d && d >= bugunBas();
const dk = (d) => d ? Math.max(0, Math.round((Date.now() - d) / 60000)) : 0;
const sure = (m) => m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : `${m} dk`;
const subeAd = (s) => s.subeAdi || String(s.ad || "").split(" — ")[0] || "—";

function asama(s) {
  switch (s.durum) {
    case "beklemede": return "bekliyor";
    // ilk ürün işaretlenmeden "toplanıyor" sayılmaz (siparişi açıp bakmak başlatmaz)
    case "toplaniyor": return ((Number(s.toplananUrun) || 0) + (Number(s.eksikUrun) || 0)) > 0 ? "toplaniyor" : "bekliyor";
    case "toplandi":
    case "kontrol_ediliyor": return "kontrol";
    case "tamamlandi": return "hazir";
    case "sevk_edildi":
    case "teslim_edildi": return bugun(tarih(s.sevkTarihi)) ? "yolda" : null;
    default: return null;
  }
}

let siparisler = [];
const yeniler = new Set();
let gorulen = null; // ilk yüklemeden sonra gelen yeni siparişleri ayırt etmek için
const eksikOnbellek = new Map(); // id -> {anahtar, liste:[{ad,kod}]}

/* ---- Eksik ürünler: sadece eksik sayısı değişen siparişler okunur ---- */
let eksikCalisiyor = false;
async function eksikleriGuncelle(liste) {
  if (eksikCalisiyor) return;
  eksikCalisiyor = true;
  try {
    for (const s of liste) {
      const n = Number(s.eksikUrun) || 0;
      const anahtar = `${n}`;
      const o = eksikOnbellek.get(s.id);
      if (o && o.anahtar === anahtar) continue;
      if (!n) { eksikOnbellek.set(s.id, { anahtar, liste: [] }); continue; }
      try {
        const snap = await getDocs(query(collection(db, "siparisler", s.id, "urunler"), where("eksik", "==", true)));
        eksikOnbellek.set(s.id, { anahtar, liste: snap.docs.map((d) => ({ ad: d.data().ad || d.data().kod || "?", kod: d.data().kod || "" })) });
      } catch (e) { console.warn("eksik okunamadı", s.id, e.message); }
    }
  } finally { eksikCalisiyor = false; }
  ciz();
}

/* ---- Çizim ---- */
function ciz() {
  const aktif = siparisler.map((s) => ({ ...s, _a: asama(s) })).filter((s) => s._a);
  const by = (a) => aktif.filter((s) => s._a === a);

  // Bugünün işi: bugün açılan ya da hâlâ açık olan siparişler
  const isler = aktif;
  const kal = isler.filter((s) => s._a !== "bekliyor").reduce((t, s) => t + (Number(s.toplamUrun) || 0), 0)
    + by("bekliyor").reduce((t, s) => t + (Number(s.toplamUrun) || 0), 0);
  const top = isler.reduce((t, s) => t + (s._a === "bekliyor" ? 0 : (Number(s.toplananUrun) || 0)), 0);
  const eks = isler.reduce((t, s) => t + (Number(s.eksikUrun) || 0), 0);
  const subeler = new Set(isler.map(subeAd));
  const yolda = by("yolda");
  const yoldaPalet = yolda.reduce((t, s) => t + (Number(s.paletSayisi) || 0), 0);

  const K = [
    ["İşlemdeki şube", subeler.size, "var(--or)"],
    ["Toplanan kalem", kal ? `%${Math.round(top / kal * 100)}` : "—", "var(--s1)"],
    ["Eksik çıkan kalem", eks, "var(--red)"],
    ["Sevke hazır", by("hazir").length, "var(--s3)"],
    ["Bugün yola çıkan", `${yolda.length} · ${yoldaPalet} palet`, "var(--s4)"],
    ["Bekleyen", by("bekliyor").length, "var(--s0)"]
  ];
  $("kpis").innerHTML = K.map(([a, b, c]) => `<div class="kpi" style="--c:${c}"><b>${b}</b><span>${a}</span></div>`).join("");

  $("flow").innerHTML = STAGES.map(([id, ad, v]) => {
    let list = by(id);
    // en eski önce; yola çıkanlarda en son çıkan önce
    list.sort((a, b) => id === "yolda"
      ? (tarih(b.sevkTarihi) || 0) - (tarih(a.sevkTarihi) || 0)
      : (tarih(a.olusturulmaTarihi) || 0) - (tarih(b.olusturulmaTarihi) || 0));
    // acil olanlar başa
    if (id !== "yolda") list = [...list.filter((s) => s.aciliyet === "acil"), ...list.filter((s) => s.aciliyet !== "acil")];
    return `<div class="col" style="--c:var(${v})"><h2><span><i></i>${ad}</span><em>${list.length}</em></h2>
      ${list.slice(0, KART_SINIRI).map(kart).join("")}
      ${list.length > KART_SINIRI ? `<div class="m" style="color:var(--mute);text-align:center">+${list.length - KART_SINIRI} sipariş daha</div>` : ""}
      ${list.length ? "" : '<div class="card" style="opacity:.5;--c:var(--line)"><span class="m">Şu an yok</span></div>'}</div>`;
  }).join("");

  // Toplayıcılar: bugün başladıkları siparişlerde topladıkları kalem
  const ekip = new Map();
  aktif.forEach((s) => {
    const kim = s.toplayanKullanici;
    if (!kim || !bugun(tarih(s.toplamaBaslangic)) || !((Number(s.toplananUrun) || 0) + (Number(s.eksikUrun) || 0))) return;
    const e = ekip.get(kim) || { kalem: 0, siparis: 0, simdi: null };
    e.kalem += Number(s.toplananUrun) || 0; e.siparis++;
    if (s._a === "toplaniyor") e.simdi = subeAd(s);
    ekip.set(kim, e);
  });
  const ek = [...ekip.entries()].sort((a, b) => b[1].kalem - a[1].kalem).slice(0, 8);
  const mx = Math.max(1, ...ek.map(([, e]) => e.kalem));
  $("teams").innerHTML = ek.map(([kim, e]) => `<div class="team"><div class="m"><span>${esc(kim)}</span><span>${e.simdi ? esc(e.simdi) + " topluyor" : "boşta"}</span></div>
    <b>${e.kalem}</b> <span class="m" style="display:inline">kalem · ${e.siparis} sipariş</span>
    <div class="bar" style="--c:var(--or)"><div style="width:${e.kalem / mx * 100}%"></div></div></div>`).join("");

  // Araçlar: bugün sevk edilenler plaka / sürücüye göre
  const arac = new Map();
  yolda.forEach((s) => {
    const k = s.plaka || s.surucuAd || "Araç bilgisi yok";
    const a = arac.get(k) || { surucu: s.surucuAd || "", ilk: null, liste: [], palet: 0 };
    const t = tarih(s.sevkTarihi);
    if (!a.ilk || t < a.ilk) a.ilk = t;
    a.liste.push(s); a.palet += Number(s.paletSayisi) || 0;
    arac.set(k, a);
  });
  $("veh").innerHTML = [...arac.entries()].sort((a, b) => (b[1].ilk || 0) - (a[1].ilk || 0)).map(([k, a]) => {
    a.liste.sort((x, y) => (Number(x.teslimatSirasi) || 99) - (Number(y.teslimatSirasi) || 99));
    return `<div class="veh"><span class="t">${saat(a.ilk)}</span><span><b>${esc(k)}</b>${a.surucu && a.surucu !== k ? ` <span style="color:var(--mute);font-size:13px">${esc(a.surucu)}</span>` : ""}</span>
      <span class="pill" style="background:var(--s4)">${a.palet} palet</span>
      <span class="s">${a.liste.map((s) => `<span style="white-space:nowrap"><i style="background:${s.durum === "teslim_edildi" ? "var(--s3)" : "var(--s4)"}"></i>${esc(subeAd(s))}</span>`).join(" &nbsp;")}</span></div>`;
  }).join("") || '<div class="m" style="color:var(--mute)">Bugün henüz araç çıkmadı.</div>';

  // Eksikler: bugün işlem gören siparişlerden
  const miss = new Map();
  aktif.forEach((s) => {
    const o = eksikOnbellek.get(s.id);
    (o?.liste || []).forEach((u) => {
      const k = u.kod || u.ad;
      const m = miss.get(k) || { ad: u.ad, n: 0, s: new Set() };
      m.n++; m.s.add(subeAd(s)); miss.set(k, m);
    });
  });
  $("miss").innerHTML = [...miss.values()].sort((a, b) => b.n - a.n || b.s.size - a.s.size).slice(0, 8)
    .map((m) => `<li><span>${esc(m.ad)}</span><b>${m.s.size} şube</b></li>`).join("") || "<li>Eksik yok</li>";

  // Son olaylar: kayıtlardaki zamanlardan
  const olay = [];
  aktif.forEach((s) => {
    const ad = subeAd(s);
    const ekle = (v, t) => { const d = tarih(v); if (bugun(d)) olay.push({ d, t }); };
    ekle(s.olusturulmaTarihi, `${ad} siparişi geldi (${s.toplamUrun || 0} kalem).`);
    ekle(s.toplamaBaslangic, `${s.toplayanKullanici || "Toplayıcı"} ${ad} siparişini toplamaya başladı.`);
    ekle(s.toplamaBitis, `${ad} toplandı${s.eksikUrun ? `, ${s.eksikUrun} kalem eksik` : ""}. Kontrole geçti.`);
    ekle(s.kontrolBitis, `${ad} kontrol edildi, sevke hazır.`);
    ekle(s.sevkTarihi, `${ad} yola çıktı${s.paletSayisi ? ` · ${s.paletSayisi} palet` : ""}${s.plaka ? ` · ${s.plaka}` : ""}.`);
  });
  olay.sort((a, b) => b.d - a.d);
  $("feed").innerHTML = olay.slice(0, 8).map((o) => `<li><time>${saat(o.d)}</time><span>${esc(o.t)}</span></li>`).join("") || "<li><time></time><span>Bugün henüz hareket yok.</span></li>";

  yeniler.clear();
  $("altyazi").textContent = `Depomax canlı verisi · son güncelleme ${saat(new Date())}`;
}

function kart(s) {
  const c = SC[s._a];
  const ad = subeAd(s);
  const toplam = Number(s.toplamUrun) || 0, tp = Number(s.toplananUrun) || 0, ek = Number(s.eksikUrun) || 0;
  const pc = toplam ? Math.round((tp + ek) / toplam * 100) : 0;
  const etiket = [
    s.kaynak === "fabrika" ? '<span class="tag">FABRİKA</span>' : "",
    s.aciliyet === "acil" ? '<span class="tag" style="background:var(--red)">ACİL</span>' : "",
    s.durum === "beklemede" || s.geriGonderildi ? '<span class="tag" style="background:var(--s2)">GERİ GÖNDERİLDİ</span>' : ""
  ].join("");
  let satir;
  if (s._a === "bekliyor") {
    const m = dk(tarih(s.olusturulmaTarihi));
    satir = `<span>${toplam} kalem</span><span class="${m >= GEC_DK ? "late" : ""}">${sure(m)} bekliyor</span>`;
  } else if (s._a === "toplaniyor") {
    satir = `<span>${tp + ek}/${toplam} kalem</span><span>${esc(s.toplayanKullanici || "")}</span>`;
  } else if (s._a === "kontrol") {
    satir = `<span>${s.durum === "kontrol_ediliyor" ? "Kontrol ediliyor" : "Kontrol bekliyor"}</span><span>${esc(s.kontrolBaşlayan || "")}</span>`;
  } else if (s._a === "hazir") {
    const m = dk(tarih(s.kontrolBitis));
    satir = `<span>${tp} kalem${s.toplamKg ? ` · ${Math.round(s.toplamKg)} kg` : ""}</span><span>${s.kontrolBitis ? `${sure(m)} hazır bekliyor` : ""}</span>`;
  } else {
    satir = `<span>${s.paletSayisi || 0} palet · ${tp} kalem</span><span>${saat(tarih(s.sevkTarihi))}${s.plaka ? " · " + esc(s.plaka) : ""}</span>`;
  }
  const bas = s._a === "toplaniyor" ? s.toplamaBaslangic : s._a === "kontrol" ? (s.kontrolBaslangic || s.toplamaBitis) : null;
  const bd = tarih(bas);
  const sayac = bd ? `<div class="m"><span>${s._a === "toplaniyor" ? "Toplama süresi" : "Kontrolde"}</span><span class="tm" data-bas="${bd.getTime()}">${sayacYaz(bd.getTime())}</span></div>` : "";
  return `<div class="card${yeniler.has(s.id) ? " new" : ""}" style="--c:${c}" data-id="${esc(s.id)}" role="button" tabindex="0"><b>${esc(ad)}${etiket}</b>
    <div class="m"><span>${s.olusturulmaTarihi ? "Geldi " + saat(tarih(s.olusturulmaTarihi)) : ""}</span>${ek ? `<span class="x">${ek} eksik</span>` : ""}</div>
    ${s._a === "toplaniyor" ? `<div class="bar"><div style="width:${pc}%"></div></div>` : ""}
    <div class="m">${satir}</div>${sayac}</div>`;
}
const sayacYaz = (ms) => {
  const t = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sn = t % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(sn).padStart(2, "0");
};
setInterval(() => document.querySelectorAll(".tm[data-bas]").forEach((el) => { el.textContent = sayacYaz(Number(el.dataset.bas)); }), 1000);

/* ---- Saat, tam ekran, ekran kararmasın ---- */
function saatCiz() {
  const d = new Date();
  $("clock").textContent = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  $("date").textContent = d.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
saatCiz(); setInterval(saatCiz, 1000);
$("tamEkran").onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
};
let kilit = null;
async function uyanikTut() {
  try { if ("wakeLock" in navigator && document.visibilityState === "visible") kilit = await navigator.wakeLock.request("screen"); } catch { /* desteklenmiyor */ }
}
document.addEventListener("visibilitychange", uyanikTut);

/* ---- Başlat ---- */
let basladi = false;
sayfaKorumasi(["depocu", "toplayici", "kontrolor"], (kullanici) => {
  if (basladi) return;
  basladi = true;
  $("alt").textContent = `Oturum: ${kullanici?.ad || ""} · Ekran sadece okur, hiçbir kaydı değiştirmez. Her gece yarısı kendini yeniler.`;
  uyanikTut();
  geriAyarla(kullanici);
  cevrimiciDinle();
  tumSiparisleriCanliDinle((liste) => {
    $("hata").classList.add("hidden");
    if (gorulen) {
      const yeni = liste.filter((s) => !gorulen.has(s.id) && asama(s));
      yeni.forEach((s) => yeniler.add(s.id));
      if (yeni.length) bipCal();
    }
    gorulen = new Set(liste.map((s) => s.id));
    siparisler = liste;
    ciz();
    if (detayId) detayBaslik();
    eksikleriGuncelle(liste.filter((s) => asama(s)));
  }, 7);
  // süreler ("x dk bekliyor") canlı kalsın
  setInterval(ciz, 30000);
  // gün değişince sayfayı tazele (bellek ve "bugün" hesapları için)
  const yarin = new Date(); yarin.setHours(24, 1, 0, 0);
  setTimeout(() => location.reload(), yarin - Date.now());
});

window.addEventListener("unhandledrejection", (e) => {
  $("hata").textContent = "Bağlantı sorunu: " + (e.reason?.message || e.reason);
  $("hata").classList.remove("hidden");
});


/* ============================================================================
   TABLET EKLERİ
   ============================================================================ */

/* ---- Ses: yeni sipariş gelince kısa bip (tarayıcı ilk dokunuştan sonra izin verir) ---- */
let sesAcik = false, ses = null;
try { sesAcik = localStorage.getItem("canliSes") === "1"; } catch { /* */ }
function sesBtnCiz() {
  $("sesBtn").textContent = sesAcik ? "🔔 Ses açık" : "🔕 Ses kapalı";
  $("sesBtn").setAttribute("aria-pressed", String(sesAcik));
}
$("sesBtn").onclick = () => {
  sesAcik = !sesAcik;
  try { localStorage.setItem("canliSes", sesAcik ? "1" : "0"); } catch { /* */ }
  sesBtnCiz();
  if (sesAcik) bipCal();
};
sesBtnCiz();
function bipCal() {
  if (!sesAcik) return;
  try {
    ses = ses || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18].forEach((t, i) => {
      const o = ses.createOscillator(), g = ses.createGain();
      o.frequency.value = i ? 1175 : 880; o.connect(g); g.connect(ses.destination);
      g.gain.setValueAtTime(0.0001, ses.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ses.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ses.currentTime + t + 0.16);
      o.start(ses.currentTime + t); o.stop(ses.currentTime + t + 0.17);
    });
  } catch { /* */ }
}

/* ---- Geri düğmesi: role göre ana sayfa ---- */
function geriAyarla(k) {
  const ana = { admin: "admin.html", toplayici: "toplama.html", kontrolor: "kontrol.html", depocu: "ikmal.html" }[k?.rol] || "index.html";
  $("geriBtn").href = ana;
}

/* ---- Şu an sistemde olanlar (son 5 dk aktif) ---- */
const SAYFA_ADI = {
  "toplama.html": "Toplamada", "kontrol.html": "Kontrolde", "ikmal.html": "İkmalde", "raf.html": "Raflarda",
  "eksikler.html": "Eksiklerde", "uretim.html": "Üretimde", "fabrika.html": "Fabrikada", "admin.html": "Yönetimde",
  "canli.html": "Canlı takipte", "sayim.html": "Sayımda", "kagit.html": "Kağıt toplamada", "sube.html": "Sipariş ekranında"
};
const ROL_ADI = { admin: "Yönetici", toplayici: "Toplayıcı", kontrolor: "Kontrolör", depocu: "Depocu", uretici: "Üretim", fabrika: "Fabrika", sube: "Şube", surucu: "Sürücü" };
let cevrimici = [];
function cevrimiciDinle() {
  const sinir = new Date(Date.now() - 60 * 60 * 1000);
  try {
    onSnapshot(query(collection(db, "kullanicilar"), where("sonAktif", ">=", sinir)), (snap) => {
      cevrimici = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      cevrimiciCiz();
    }, () => { $("ekipKutu").classList.add("hidden"); });
  } catch { $("ekipKutu").classList.add("hidden"); }
  setInterval(cevrimiciCiz, 30000);
}
function cevrimiciCiz() {
  const simdi = Date.now();
  const l = cevrimici
    .map((k) => ({ ...k, _dk: (simdi - (tarih(k.sonAktif) || 0)) / 60000 }))
    .filter((k) => k._dk <= 5 && k.rol !== "sube")
    .sort((a, b) => (a.ad || "").localeCompare(b.ad || "", "tr"));
  const subeSay = cevrimici.filter((k) => k.rol === "sube" && (simdi - (tarih(k.sonAktif) || 0)) / 60000 <= 5).length;
  $("online").innerHTML = l.map((k) => `<li><i class="${k._dk > 2.5 ? "idle" : ""}"></i><span><b>${esc(k.ad || "—")}</b> <span style="color:var(--mute);font-size:13px">${esc(ROL_ADI[k.rol] || k.rol || "")}</span></span><span class="r">${esc(SAYFA_ADI[k.aktifSayfa] || k.aktifSayfa || "")}</span></li>`).join("")
    + (subeSay ? `<li><i></i><span>${subeSay} şube</span><span class="r">çevrimiçi</span></li>` : "")
    || "<li><span></span><span style='color:var(--mute)'>Kimse görünmüyor</span></li>";
}

/* ---- Karta dokununca: siparişin ürünleri canlı ---- */
let detayId = null, detayKapat = null, detayUrunler = [], detayFiltre = "hepsi";
const FILTRELER = [["hepsi", "Tümü"], ["bekleyen", "Toplanmadı"], ["toplandi", "Toplandı"], ["eksik", "Eksik"], ["kontrol", "Kontrol edildi"]];
document.addEventListener("click", (e) => {
  const kartEl = e.target.closest(".card[data-id]");
  if (kartEl) { detayAc(kartEl.dataset.id); return; }
  if (e.target.closest("[data-kapat]")) detayKapatFn();
  const f = e.target.closest("[data-filtre]");
  if (f) { detayFiltre = f.dataset.filtre; detayCiz(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") detayKapatFn();
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".card[data-id]")) { e.preventDefault(); detayAc(e.target.dataset.id); }
});
function detayAc(id) {
  detayKapatFn();
  detayId = id; detayFiltre = "hepsi"; detayUrunler = [];
  $("detay").classList.remove("hidden");
  $("dListe").innerHTML = '<div class="sub" style="padding:10px">Yükleniyor…</div>';
  detayBaslik();
  detayKapat = onSnapshot(collection(db, "siparisler", id, "urunler"), (snap) => {
    detayUrunler = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    detayCiz();
  }, (err) => { $("dListe").innerHTML = `<div class="sub" style="padding:10px;color:var(--red)">Ürünler okunamadı: ${esc(err.code || err.message)}</div>`; });
}
function detayBaslik() {
  const s = siparisler.find((x) => x.id === detayId);
  if (!s) return;
  const a = STAGES.find((x) => x[0] === asama(s));
  $("dBaslik").textContent = subeAd(s);
  $("dAlt").textContent = [a ? a[1] : s.durum, s.toplayanKullanici && `Toplayan: ${s.toplayanKullanici}`, s.kontrolBaşlayan && `Kontrol: ${s.kontrolBaşlayan}`,
    s.olusturulmaTarihi && `Geldi ${saat(tarih(s.olusturulmaTarihi))}`].filter(Boolean).join(" · ");
}
function detayKapatFn() {
  if (detayKapat) { detayKapat(); detayKapat = null; }
  detayId = null;
  $("detay").classList.add("hidden");
}
function detayCiz() {
  const say = {
    hepsi: detayUrunler.length,
    bekleyen: detayUrunler.filter((u) => !u.toplandi && !u.eksik).length,
    toplandi: detayUrunler.filter((u) => u.toplandi).length,
    eksik: detayUrunler.filter((u) => u.eksik).length,
    kontrol: detayUrunler.filter((u) => u.kontrol).length
  };
  $("dFiltre").innerHTML = FILTRELER.map(([k, ad]) => `<button data-filtre="${k}" aria-pressed="${detayFiltre === k}">${ad} · ${say[k]}</button>`).join("");
  const l = detayUrunler.filter((u) => detayFiltre === "hepsi" ? true
    : detayFiltre === "bekleyen" ? (!u.toplandi && !u.eksik)
    : !!u[detayFiltre])
    .sort((a, b) => String(a.reyon || "").localeCompare(String(b.reyon || ""), "tr", { numeric: true }) || String(a.ad || "").localeCompare(String(b.ad || ""), "tr"));
  $("dListe").innerHTML = l.map((u) => {
    const d = u.eksik ? "⚠️" : u.kontrol ? "✅" : u.toplandi ? "☑️" : "⬜";
    const cls = u.eksik ? "eksik" : u.kontrol ? "bitti" : "";
    const ek = [u.kod, u.reyon && `Reyon ${u.reyon}`, u.toplayanKullanici && `Toplayan ${u.toplayanKullanici}`, u.kontrolEdenKullanici && `Kontrol ${u.kontrolEdenKullanici}`, u.kontrolNotu && `Not: ${u.kontrolNotu}`].filter(Boolean).join(" · ");
    return `<div class="urun ${cls}"><span class="d">${d}</span><span class="a">${esc(u.ad || u.kod || "?")}</span><span class="q">${esc(u.miktar ?? "")} ${esc(u.birim || "")}</span><span class="k">${esc(ek)}</span></div>`;
  }).join("") || '<div class="sub" style="padding:10px">Bu filtrede ürün yok.</div>';
}
