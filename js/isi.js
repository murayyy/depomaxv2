// ============================================================================
// DEPO ISI HARİTASI (3D)
//   Veri: siparişlerin toplanan satırları (reyon, miktar, toplayan, toplanma zamanı)
//   Yerleşim: reyon kodundan çıkarılır — harf kısmı koridor (A, B, ADA…), sayı kısmı sıra.
//   Okuma: sadece "Yükle" deyince (seçilen günlerdeki siparişler + ürünleri).
// ============================================================================
import { auth, signOut, sayfaKorumasi, db } from "./firebase.js";
import { arayuzHazirla, toast, kacisEt, sayiBicimle } from "./utils.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

arayuzHazirla();
const T3 = window.THREE;

let toplamalar = [];   // {reyon, kod, ad, miktar, kisi, zaman(ms|null), siparisId, siparisAd}
let siparisAdlari = new Map();

sayfaKorumasi(["depocu", "admin"], (k) => {
  document.getElementById("kullaniciAdi").textContent = k.ad || k.uid;
  document.getElementById("rolEtiketi").textContent = k.rol;
  if (!T3) { document.getElementById("sahne").innerHTML = '<p style="color:#fff;padding:20px;">3D kütüphanesi yüklenemedi.</p>'; return; }
  sahneKur();
  yukle();
});
document.getElementById("cikisBtn").addEventListener("click", async () => { await signOut(auth); location.href = "index.html"; });
document.getElementById("yukleBtn").addEventListener("click", yukle);
["kisi", "olcu"].forEach((id) => document.getElementById(id).addEventListener("change", ciz));
document.getElementById("rotaSec").addEventListener("change", rotaCiz);

/* ---------------- Veri ---------------- */
async function yukle() {
  const btn = document.getElementById("yukleBtn");
  btn.disabled = true;
  document.getElementById("enCok").textContent = "Yükleniyor…";
  try {
    const gun = Number(document.getElementById("gun").value) || 7;
    const sinir = new Date(); sinir.setHours(0, 0, 0, 0); sinir.setDate(sinir.getDate() - (gun - 1));
    const sip = await getDocs(query(collection(db, "siparisler"), where("olusturulmaTarihi", ">=", sinir)));
    siparisAdlari = new Map(sip.docs.map((d) => [d.id, d.data().ad || d.id]));
    const parcalar = await Promise.all(sip.docs.map(async (d) => {
      const u = await getDocs(collection(db, "siparisler", d.id, "urunler"));
      return u.docs.map((x) => x.data()).filter((k) => k.toplandi).map((k) => ({
        reyon: String(k.reyon || "").trim() || "?", kod: k.kod || "", ad: k.ad || "",
        miktar: Number(k.gercekMiktar ?? k.miktar) || 0, kisi: k.toplayanKullanici || "",
        zaman: k.toplanmaZamani?.toMillis?.() || (k.toplanmaZamani instanceof Date ? +k.toplanmaZamani : null),
        siparisId: d.id, siparisAd: d.data().ad || d.id
      }));
    }));
    toplamalar = parcalar.flat();
    const kisiler = [...new Set(toplamalar.map((t) => t.kisi).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
    const sk = document.getElementById("kisi"); const onceki = sk.value;
    sk.innerHTML = '<option value="">Tüm toplayıcılar</option>' + kisiler.map((k) => `<option>${kacisEt(k)}</option>`).join("");
    sk.value = kisiler.includes(onceki) ? onceki : "";
    const rotali = [...new Set(toplamalar.filter((t) => t.zaman).map((t) => t.siparisId))];
    document.getElementById("rotaSec").innerHTML = '<option value="">Sipariş seçin…</option>' +
      rotali.map((id) => `<option value="${id}">${kacisEt(siparisAdlari.get(id) || id)}</option>`).join("");
    document.getElementById("altBaslik").textContent = `${sip.size} sipariş · ${toplamalar.length} toplama satırı`;
    ciz();
  } catch (e) {
    console.error(e);
    toast("Veri okunamadı: " + (e.code || e.message), "error");
  } finally { btn.disabled = false; }
}

/* Reyon kodunu (koridor, sıra) olarak çöz: "A-03" -> A,3 · "ADA" -> ADA,0 · "12" -> #,12 */
function reyonCoz(r) {
  const n = String(r || "").trim().toLocaleUpperCase("tr");
  const m = n.match(/^([A-ZÇĞİÖŞÜ]+)\s*[-_./ ]?\s*(\d+)?/);
  if (m) return { koridor: m[1], sira: Number(m[2] || 0), alt: n.slice(m[0].length).replace(/^[-_./ ]+/, "") };
  const s = n.match(/^(\d+)/);
  return { koridor: "#", sira: s ? Number(s[1]) : 0, alt: "" };
}

/* ---------------- Sahne ---------------- */
const S = {};
function sahneKur() {
  const el = document.getElementById("sahne");
  S.el = el;
  S.r = new T3.WebGLRenderer({ antialias: true });
  S.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  el.appendChild(S.r.domElement);
  S.sc = new T3.Scene();
  S.sc.background = new T3.Color(0x0f172a);
  S.cam = new T3.PerspectiveCamera(45, 1, 0.1, 500);
  S.sc.add(new T3.AmbientLight(0xffffff, 0.55));
  const g = new T3.DirectionalLight(0xffffff, 0.8); g.position.set(20, 40, 15); S.sc.add(g);
  S.zemin = new T3.Mesh(new T3.PlaneGeometry(200, 200), new T3.MeshStandardMaterial({ color: 0x1e293b }));
  S.zemin.rotation.x = -Math.PI / 2; S.sc.add(S.zemin);
  S.grup = new T3.Group(); S.sc.add(S.grup);
  S.rota = new T3.Group(); S.sc.add(S.rota);
  S.az = 0.8; S.el_ = 0.75; S.uz = 40; S.hedef = new T3.Vector3(0, 0, 0);
  S.ray = new T3.Raycaster(); S.fare = new T3.Vector2(-9, -9);
  // kontrol: sürükle döndür, tekerlek yakınlaş, iki parmak yakınlaş
  let surukle = null, dokun = null;
  el.addEventListener("pointerdown", (e) => { surukle = { x: e.clientX, y: e.clientY, az: S.az, el: S.el_ }; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", (e) => {
    const b = el.getBoundingClientRect();
    S.fare.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    S.fareXY = [e.clientX - b.left, e.clientY - b.top];
    if (surukle) {
      S.az = surukle.az + (e.clientX - surukle.x) * 0.008;
      S.el_ = Math.max(0.15, Math.min(1.45, surukle.el + (e.clientY - surukle.y) * 0.006));
    }
  });
  el.addEventListener("pointerup", () => { surukle = null; });
  el.addEventListener("pointerleave", () => { S.fare.set(-9, -9); });
  el.addEventListener("wheel", (e) => { e.preventDefault(); S.uz = Math.max(8, Math.min(160, S.uz * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
  el.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 2) { dokun = null; return; }
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (dokun) S.uz = Math.max(8, Math.min(160, S.uz * dokun / d));
    dokun = d;
  }, { passive: true });
  el.addEventListener("touchend", () => { dokun = null; });
  new ResizeObserver(boyut).observe(el);
  boyut();
  requestAnimationFrame(dongu);
}
function boyut() {
  const w = S.el.clientWidth, h = S.el.clientHeight;
  S.r.setSize(w, h); S.cam.aspect = w / Math.max(1, h); S.cam.updateProjectionMatrix();
}

const renk = (t) => { // 0..1 -> mavi, yeşil, sarı, kırmızı
  const d = [[0x1d, 0x4e, 0xd8], [0x22, 0xc5, 0x5e], [0xea, 0xb3, 0x08], [0xef, 0x44, 0x44]];
  const x = Math.max(0, Math.min(0.9999, t)) * 3, i = Math.floor(x), f = x - i;
  const a = d[i], b = d[i + 1];
  return new T3.Color(`rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`);
};

let kutular = [];       // {mesh, reyon, veri}
let etiketler = [];     // {el, pos}
let konum = new Map();  // reyon -> Vector3 (üst nokta)

function ciz() {
  if (!S.sc) return;
  const kisi = document.getElementById("kisi").value;
  const olcu = document.getElementById("olcu").value;
  const veri = toplamalar.filter((t) => !kisi || t.kisi === kisi);
  const reyonlar = new Map();
  veri.forEach((t) => {
    const r = reyonlar.get(t.reyon) || { reyon: t.reyon, adet: 0, miktar: 0, urun: new Map(), kisiler: new Set() };
    r.adet++; r.miktar += t.miktar; r.kisiler.add(t.kisi);
    r.urun.set(t.ad || t.kod, (r.urun.get(t.ad || t.kod) || 0) + 1);
    reyonlar.set(t.reyon, r);
  });
  // temizle
  S.grup.clear(); kutular = [];
  etiketler.forEach((e) => e.el.remove()); etiketler = [];
  konum = new Map();
  const kutuEt = document.getElementById("etiketler");

  // yerleşim: koridorlar X ekseninde, sıra Z ekseninde
  const koridorlar = new Map();
  reyonlar.forEach((r) => {
    const c = reyonCoz(r.reyon);
    if (!koridorlar.has(c.koridor)) koridorlar.set(c.koridor, []);
    koridorlar.get(c.koridor).push({ ...r, c });
  });
  const kAdlari = [...koridorlar.keys()].sort((a, b) => (a === "#") - (b === "#") || a.localeCompare(b, "tr"));
  const enFazla = Math.max(1, ...[...reyonlar.values()].map((r) => olcu === "adet" ? r.adet : r.miktar));
  const ARALIK_X = 4, ARALIK_Z = 1.6;
  let enUzun = 0;
  kAdlari.forEach((kAd, ki) => {
    const liste = koridorlar.get(kAd).sort((a, b) => a.c.sira - b.c.sira || a.c.alt.localeCompare(b.c.alt, "tr"));
    enUzun = Math.max(enUzun, liste.length);
    const x = (ki - (kAdlari.length - 1) / 2) * ARALIK_X;
    liste.forEach((r, i) => {
      const deger = olcu === "adet" ? r.adet : r.miktar;
      const t = deger / enFazla;
      const h = 0.2 + t * 8;
      const m = new T3.Mesh(new T3.BoxGeometry(1.4, h, 1.2), new T3.MeshStandardMaterial({ color: renk(t), roughness: 0.6 }));
      const z = i * ARALIK_Z;
      m.position.set(x, h / 2, z);
      m.userData.reyon = r.reyon;
      S.grup.add(m);
      kutular.push({ mesh: m, r });
      konum.set(r.reyon, new T3.Vector3(x, h + 0.3, z));
    });
    const el = document.createElement("div"); el.className = "et koridor"; el.textContent = kAd === "#" ? "Numaralı" : kAd;
    kutuEt.appendChild(el); etiketler.push({ el, pos: new T3.Vector3(x, 0.2, -1.6) });
  });
  // kamerayı ortala
  S.hedef.set(0, 0, (enUzun - 1) * ARALIK_Z / 2);
  S.uz = Math.max(18, Math.max(kAdlari.length * ARALIK_X, enUzun * ARALIK_Z) * 1.4);

  // en çok gidilenler
  const sirali = [...reyonlar.values()].sort((a, b) => (olcu === "adet" ? b.adet - a.adet : b.miktar - a.miktar)).slice(0, 10);
  document.getElementById("enCok").innerHTML = sirali.length ? sirali.map((r) =>
    `<div class="liste-sat"><span>${kacisEt(r.reyon)} <span class="u-text-soft">· ${kacisEt([...r.urun.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "")}</span></span><b>${olcu === "adet" ? r.adet + " kez" : sayiBicimle(Math.round(r.miktar))}</b></div>`).join("")
    : "Bu aralıkta toplama yok.";

  // toplayıcıların bugünkü son konumu
  const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
  const son = new Map();
  toplamalar.filter((t) => t.zaman && t.zaman >= +bugun && t.kisi).forEach((t) => {
    if (!son.has(t.kisi) || son.get(t.kisi).zaman < t.zaman) son.set(t.kisi, t);
  });
  document.getElementById("kisiler").innerHTML = son.size ? [...son.values()].map((t) =>
    `<div class="liste-sat"><span>👤 ${kacisEt(t.kisi)}</span><b>${kacisEt(t.reyon)} · ${new Date(t.zaman).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</b></div>`).join("")
    : "Bugün saat kaydı olan toplama yok.";
  son.forEach((t) => {
    const p = konum.get(t.reyon); if (!p) return;
    const el = document.createElement("div"); el.className = "et kisi"; el.textContent = "👤 " + t.kisi;
    kutuEt.appendChild(el); etiketler.push({ el, pos: p.clone().add(new T3.Vector3(0, 1.2, 0)) });
  });
  rotaCiz();
}

function rotaCiz() {
  S.rota.clear();
  const id = document.getElementById("rotaSec").value;
  const bilgi = document.getElementById("rotaBilgi");
  if (!id) return;
  const adim = toplamalar.filter((t) => t.siparisId === id && t.zaman).sort((a, b) => a.zaman - b.zaman);
  const noktalar = adim.map((t) => konum.get(t.reyon)).filter(Boolean).map((p) => p.clone().add(new T3.Vector3(0, 0.6, 0)));
  if (noktalar.length < 2) { bilgi.textContent = "Bu siparişte rota çizecek kadar saatli toplama yok."; return; }
  S.rota.add(new T3.Line(new T3.BufferGeometry().setFromPoints(noktalar), new T3.LineBasicMaterial({ color: 0xffffff })));
  noktalar.forEach((p, i) => {
    const k = new T3.Mesh(new T3.SphereGeometry(i === 0 ? 0.45 : 0.28, 12, 12),
      new T3.MeshBasicMaterial({ color: i === 0 ? 0x22c55e : i === noktalar.length - 1 ? 0xef4444 : 0xffffff }));
    k.position.copy(p); S.rota.add(k);
  });
  let koridorDegisim = 0, geriDonus = 0;
  for (let i = 1; i < adim.length; i++) {
    const a = reyonCoz(adim[i - 1].reyon), b = reyonCoz(adim[i].reyon);
    if (a.koridor !== b.koridor) koridorDegisim++;
    else if (b.sira < a.sira) geriDonus++;
  }
  const sure = Math.round((adim[adim.length - 1].zaman - adim[0].zaman) / 60000);
  const farkliKoridor = new Set(adim.map((t) => reyonCoz(t.reyon).koridor)).size;
  bilgi.innerHTML = `<b>${adim.length}</b> ürün · <b>${sure}</b> dk · koridor değişimi <b>${koridorDegisim}</b> (en az ${Math.max(0, farkliKoridor - 1)} olabilirdi)` +
    (geriDonus ? ` · aynı koridorda geri dönüş <b>${geriDonus}</b>` : "") +
    `<br><span style="color:#22c55e;">●</span> başlangıç <span style="color:#ef4444;">●</span> bitiş`;
}

/* ---------------- Döngü ---------------- */
const ipucu = document.getElementById("ipucu");
function dongu() {
  requestAnimationFrame(dongu);
  if (!S.r) return;
  const c = S.cam, h = S.hedef;
  c.position.set(h.x + Math.cos(S.az) * Math.cos(S.el_) * S.uz, Math.sin(S.el_) * S.uz, h.z + Math.sin(S.az) * Math.cos(S.el_) * S.uz);
  c.lookAt(h);
  // ipucu
  S.ray.setFromCamera(S.fare, c);
  const vurus = S.ray.intersectObjects(kutular.map((k) => k.mesh))[0];
  kutular.forEach((k) => k.mesh.material.emissive?.setHex(vurus && vurus.object === k.mesh ? 0x333333 : 0));
  if (vurus && S.fareXY) {
    const k = kutular.find((x) => x.mesh === vurus.object).r;
    const enCok = [...k.urun.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    ipucu.innerHTML = `<b>${kacisEt(k.reyon)}</b><br>${k.adet} toplama · ${sayiBicimle(Math.round(k.miktar * 10) / 10)} miktar<br>` +
      enCok.map(([a, n]) => `${kacisEt(a)} (${n})`).join("<br>") + `<br><span style="color:#94a3b8;">${kacisEt([...k.kisiler].filter(Boolean).join(", "))}</span>`;
    ipucu.style.display = "block";
    ipucu.style.left = Math.min(S.fareXY[0] + 14, S.el.clientWidth - 270) + "px";
    ipucu.style.top = (S.fareXY[1] + 14) + "px";
  } else ipucu.style.display = "none";
  // etiketler
  const w = S.el.clientWidth, hh = S.el.clientHeight, v = new T3.Vector3();
  etiketler.forEach((e) => {
    v.copy(e.pos).project(c);
    e.el.style.left = ((v.x * 0.5 + 0.5) * w) + "px";
    e.el.style.top = ((-v.y * 0.5 + 0.5) * hh) + "px";
    e.el.style.display = v.z < 1 ? "" : "none";
  });
  S.r.render(S.sc, c);
}
