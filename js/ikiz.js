// ============================================================================
// DEPO İKİZİ 3D — gerçek Depomax verisiyle (salt okunur)
//   Raflar (D1, D2, E1, E2): raflar/{id}/kalemler -> kat / bölme konumuna palet
//   Toplama gözleri: toplamaGozleri.reyon -> "D1-03" = D1 rafı 3. bölme tabanı,
//                    "A1-05" = A1 rafsız toplama şeridi 5. yer
//   Palet yapma / hazır alanı: siparişler (canlı)
//   Üretim alanı: ÜRETİM rafının kalemleri
// ============================================================================
import { db, sayfaKorumasi } from "./firebase.js";
import { tumSiparisleriCanliDinle } from "./veri.js?v=20261127";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const THREE = window.THREE;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sayi = (v) => (Number(v) || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
const norm = (v) => String(v || "").trim().toLocaleUpperCase("tr");

/* ---------------- Sabit yerleşim (gerçek ölçüler) ---------------- */
/* Yerleşim (çizime göre): soldan sağa
   duvar | A1 | koridor | A2 B1 | koridor | B2 ORTA C1 | koridor | C2 D1 | koridor | D2 E1 | koridor | E2 | duvar
   Ön (x<0): paletleme alanı + kepenk solda, palet koyma alanı + kapı sağda. Arka: ofis katı ve üretim. */
const SIRA_Z = { A1: 0, A2: 4.3, B1: 5.5, B2: 9.8, ORTA: 11.0, C1: 12.2, C2: 16.5, D1: 17.7, D2: 22.0, E1: 23.2, E2: 27.5 };
const SIRA_YUZ = { A1: 1, A2: -1, B1: 1, B2: -1, ORTA: 1, C1: 1, C2: -1, D1: 1, D2: -1, E1: 1, E2: -1 };
const RACKS = [
  { id: "D1", bays: 13, bw: 2.70, lv: [180, 180, 180, 350] },
  { id: "D2", bays: 10, bw: 3.25, lv: [170, 170, 170, 300] },
  { id: "E1", bays: 10, bw: 3.30, lv: [220, 200, 300] },
  { id: "E2", bays: 11, bw: 3.30, lv: [150, 250, 250] }
].map((r) => ({ ...r, z: SIRA_Z[r.id], face: SIRA_YUZ[r.id] }));
const DEPO_BOY = 37;   // raf sıralarının boyu (m)
const PCOL = ["#2f7ed8", "#8e44ad", "#16a085", "#c0392b", "#d35400", "#2c3e50", "#27ae60", "#b8860b", "#7f8c8d", "#e84393"];
const ST = { ok: "#c9a46a", skt: "#e3a400", gecti: "#d63b2f", low: "#d6336c", goz: "#5aa0e0" };
const D = 1.1, PICK_X = -2;
const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
const gunFark = (s) => { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : Math.round((d - bugun) / 864e5); };
const tarihYaz = (s) => { const d = new Date(s); return isNaN(d) ? (s || "—") : d.toLocaleDateString("tr-TR"); };
const renkKod = (kod) => PCOL[[...String(kod)].reduce((t, c) => t + c.charCodeAt(0), 0) % PCOL.length];

/* yuvalar: her raf bölmesi × kat × 3 palet yeri */
const slots = [];
for (const r of RACKS) {
  r.base = []; let y = 0; r.lv.forEach((h) => { r.base.push(y); y += h / 100; });
  r.H = r.base[r.base.length - 1] + Math.min(r.lv[r.lv.length - 1] / 100, 2);
  r.len = r.bays * r.bw;
  for (let b = 0; b < r.bays; b++) for (let l = 0; l < r.lv.length; l++) for (let k = 0; k < 3; k++) {
    slots.push({ r, b, l, k, levelCm: r.lv[l], x: b * r.bw + r.bw * (k + 0.5) / 3, y: r.base[l] + (l ? 0.07 : 0), z: r.z, pick: l === 0, pal: null });
  }
}
/* rafsız toplama şeritleri */
const FL_N = 30, FL_W = 1.1, FL_X = 0;
const FLOORS = ["A1", "A2", "B1", "B2", "ORTA", "C1", "C2"]
  .map((id) => ({ id, floor: true, face: SIRA_YUZ[id], x0: FL_X, z0: SIRA_Z[id] - 0.6, zc: SIRA_Z[id], w: FL_N * FL_W, d: 1.2, bays: FL_N }));
for (const f of FLOORS) for (let k = 0; k < FL_N; k++) slots.push({ r: f, b: k, l: 0, k: 0, levelCm: 999, pick: true, x: f.x0 + FL_W / 2 + k * FL_W, y: 0, z: f.zc, pal: null });
const slotAdi = (s) => s.r.floor ? `${s.r.id === "ORTA" ? "Orta raf" : s.r.id} · Yer ${s.b + 1} (toplama)` : `${s.r.id} · Bölme ${s.b + 1} · Kat ${s.l + 1} · Yer ${s.k + 1}` + (s.pick ? " (taban / toplama)" : "");
const yuvaBul = (rid, b, l) => slots.filter((s) => s.r.id === rid && s.b === b && s.l === l);

/* ---------------- Sahne ---------------- */
const cv = $("cv"), stage = $("stage");
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
const HOME = { pos: new THREE.Vector3(-34, 34, 14), tgt: new THREE.Vector3(14, 0, 14) };
cam.position.copy(HOME.pos);
const ctl = new THREE.OrbitControls(cam, cv); ctl.target.copy(HOME.tgt); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI * 0.48; ctl.minDistance = 3; ctl.maxDistance = 90;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(-20, 40, 25); scene.add(sun);
const floorMat = new THREE.MeshLambertMaterial({ color: 0xc9cdd2 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(58, 30), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.set(20, -0.01, 13.75); scene.add(floor);
const grid = new THREE.GridHelper(58, 58, 0x9aa0a8, 0xb4b9bf); grid.position.set(20, 0, 13.75); scene.add(grid);

function label(text, bg, h = 0.9) {
  const c = document.createElement("canvas"), g = c.getContext("2d"), F = "800 56px Archivo, sans-serif"; g.font = F;
  c.width = Math.ceil(g.measureText(text).width) + 48; c.height = 96; g.fillStyle = bg; g.fillRect(0, 0, c.width, 96); g.font = F; g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, c.width / 2, 52);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); s.scale.set(c.width / 96 * h, h, 1); return s;
}
const upMat = new THREE.MeshLambertMaterial({ color: 0x1f5fbf }), bmMat = new THREE.MeshLambertMaterial({ color: 0xf26a1b });
for (const r of RACKS) {
  for (let b = 0; b <= r.bays; b++) for (const dz of [-D / 2, D / 2]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, r.H, 0.08), upMat); m.position.set(b * r.bw, r.H / 2, r.z + dz); scene.add(m); }
  for (let l = 1; l < r.lv.length; l++) for (let b = 0; b < r.bays; b++) for (const dz of [-D / 2, D / 2]) { const m = new THREE.Mesh(new THREE.BoxGeometry(r.bw, 0.1, 0.07), bmMat); m.position.set(b * r.bw + r.bw / 2, r.base[l] + 0.02, r.z + dz); scene.add(m); }
  const L = label(r.id, "#1f5fbf"); L.position.set(-0.9, r.H * 0.55, r.z); scene.add(L);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r.len, D), new THREE.MeshBasicMaterial({ color: 0xf2c200, transparent: true, opacity: 0.45, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(r.len / 2, 0.02, r.z); scene.add(m);
}
const ZONES = [
  ...FLOORS.map((f) => ({ id: f.id, name: f.id === "ORTA" ? "Orta raf" : f.id, css: "#d4a900", x: f.x0, z: f.z0, w: f.w, d: f.d, floor: true })),
  { id: "yapma", name: "Paletleme alanı", css: "#8e44ad", x: -8.5, z: -0.8, w: 7, d: 11.8 },
  { id: "hazir", name: "Palet koyma alanı", css: "#1f9d55", x: -8.5, z: 20, w: 7, d: 8.3 },
  { id: "ofis", name: "Ofis katı", css: "#64748b", x: 38, z: 3, w: 9, d: 11, sabit: true },
  { id: "uretim", name: "Üretim", css: "#16a085", x: 38, z: 18, w: 9, d: 10.3 }
];
for (const zn of ZONES) {
  zn.cx = zn.x + zn.w / 2; zn.cz = zn.z + zn.d / 2; zn.n = 0;
  const pm = new THREE.Mesh(new THREE.PlaneGeometry(zn.w, zn.d), new THREE.MeshBasicMaterial({ color: zn.css, transparent: true, opacity: 0.22, depthWrite: false }));
  pm.rotation.x = -Math.PI / 2; pm.position.set(zn.cx, 0.015, zn.cz); scene.add(pm);
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(zn.w, 0.001, zn.d)), new THREE.LineBasicMaterial({ color: zn.css })); e.position.set(zn.cx, 0.03, zn.cz); scene.add(e);
  const L = label(zn.name, zn.floor ? "#b38f00" : zn.css, zn.floor ? 0.9 : 0.85); L.position.set(zn.floor ? zn.x - 0.9 : zn.cx, zn.floor ? (zn.id === "ORTA" ? 2.6 : 1.3) : 3.2, zn.cz); scene.add(L);
}
/* duvarlar, kepenk, kapı */
{
  const dm = new THREE.MeshLambertMaterial({ color: 0x9aa3ad, transparent: true, opacity: 0.55 });
  const duvar = (x, z, w, d, h = 2.4) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), dm); m.position.set(x + w / 2, h / 2, z + d / 2); scene.add(m); };
  const X0 = -9, X1 = 47.5, Z0 = -1.2, Z1 = 28.7;
  duvar(X0, Z0 - 0.2, X1 - X0, 0.2);           // sol duvar
  duvar(X0, Z1, X1 - X0, 0.2);                 // sağ duvar
  duvar(X1, Z0, 0.2, Z1 - Z0);                 // arka duvar
  // ön duvar: kepenk (z 6–10) ve kapı (z 23–27.5) boşluklu
  duvar(X0 - 0.2, Z0, 0.2, 7.2); duvar(X0 - 0.2, 10, 0.2, 13); duvar(X0 - 0.2, 27.5, 0.2, Z1 - 27.5);
  const K = label("Kepenk", "#475569", 0.7); K.position.set(X0 - 0.6, 1.6, 8); scene.add(K);
  const Kp = label("Kapı", "#475569", 0.7); Kp.position.set(X0 - 0.6, 1.6, 25.2); scene.add(Kp);
  const of = new THREE.Mesh(new THREE.BoxGeometry(9, 0.25, 11), new THREE.MeshLambertMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.5 }));
  of.position.set(42.5, 3.2, 8.5); scene.add(of);   // ofis katı (asma kat)
}
const Z = (id) => ZONES.find((z) => z.id === id);
/* üretim hattı (sabit görsel) */
{
  const belt = new THREE.Mesh(new THREE.BoxGeometry(1, 0.75, 6), new THREE.MeshLambertMaterial({ color: 0x4a525c })); belt.position.set(45.5, 0.375, 23); scene.add(belt);
  [20.5, 25.5].forEach((z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 1.8), new THREE.MeshLambertMaterial({ color: 0x16a085 })); m.position.set(45.5, 1.1, z); scene.add(m); });
}

const woodGeo = new THREE.BoxGeometry(0.8, 0.14, 1);
const dinamik = new THREE.Group(); scene.add(dinamik);   // veriden gelen her şey burada; yenilemede temizlenir
let hits = [], zoneHits = [];
const selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.9, 1, 1.08)), new THREE.LineBasicMaterial({ color: 0xf26a1b })); selBox.visible = false; scene.add(selBox);
const ghost = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 1), new THREE.MeshBasicMaterial({ color: 0x1f9d55, transparent: true, opacity: 0.5 })); ghost.visible = false; scene.add(ghost);

function paletKur(s) {
  const p = s.pal, g = new THREE.Group();
  const wm = new THREE.MeshLambertMaterial({ color: 0x8a6a44 }), bm = new THREE.MeshLambertMaterial({ color: ST.ok });
  const base = new THREE.Mesh(woodGeo, wm); base.position.y = 0.07;
  const hMax = Math.min(s.levelCm - 20, 175) / 100;
  const bh = Math.max(0.12, (Math.min(p.h / 100, hMax) - 0.14) * (p.fill ?? 1));
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.74, bh, 0.94), bm); box.position.y = 0.14 + bh / 2;
  g.add(base, box); g.position.set(s.x, s.y, s.z); dinamik.add(g);
  box.userData.slot = s; p.mesh = g; p.bm = bm; p.wm = wm; hits.push(box);
}
function alanPaleti(x, z, h, color, rec, wrap) {
  const g = new THREE.Group(), base = new THREE.Mesh(woodGeo, new THREE.MeshLambertMaterial({ color: 0x8a6a44 })); base.position.y = 0.07;
  const bh = h - 0.14, box = new THREE.Mesh(new THREE.BoxGeometry(0.74, bh, 0.94), new THREE.MeshLambertMaterial({ color })); box.position.y = 0.14 + bh / 2; g.add(base, box);
  if (wrap) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.8, bh + 0.04, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })); f.position.y = box.position.y; g.add(f); }
  g.position.set(x, 0, z); dinamik.add(g); box.userData.z = rec; zoneHits.push(box); Z(rec.zone).n++; return g;
}

/* ---------------- Veri ---------------- */
let raflar = [], gozler = [], siparisler = [], yersiz = [], urunRaf = null;
const RAF_ID = (ad) => { const m = norm(ad).replace(/[^A-Z0-9]/g, "").match(/^(?:RAF)?([DE][12])(?![0-9])/); return m ? m[1] : null; };
const reyonCoz = (r) => { const m = norm(r).match(/^(ORTA(?:\s*RAF)?|[A-E][12])\s*[-_./ ]?\s*(\d+)/); return m ? { id: m[1].startsWith("ORTA") ? "ORTA" : m[1], no: Number(m[2]) } : null; };

async function yukle() {
  $("yenile").disabled = true;
  try {
    const [rs, gs] = await Promise.all([getDocs(collection(db, "raflar")), getDocs(collection(db, "toplamaGozleri"))]);
    raflar = await Promise.all(rs.docs.map(async (d) => {
      const k = await getDocs(collection(db, "raflar", d.id, "kalemler"));
      return { id: d.id, ...d.data(), kalemler: k.docs.map((x) => ({ id: x.id, ...x.data() })).filter((x) => (Number(x.miktar) || 0) > 0 || (Number(x.palet) || 0) > 0) };
    }));
    gozler = gs.docs.map((d) => ({ id: d.id, ...d.data() }));
    $("uyari").classList.add("hidden");
    yerlestir();
  } catch (e) {
    console.error(e);
    $("uyari").textContent = "Veri okunamadı: " + (e.code || e.message);
    $("uyari").classList.remove("hidden");
  } finally { $("yenile").disabled = false; }
}

function yerlestir() {
  // temizle
  dinamik.clear(); hits = []; zoneHits = []; ZONES.forEach((z) => (z.n = 0));
  slots.forEach((s) => (s.pal = null)); yersiz = [];
  selBox.visible = false; sel = null;

  // 1) toplama gözleri: reyondan konum
  for (const g of gozler) {
    const yr = reyonCoz(g.reyon);
    const pal = { tip: "goz", kod: g.kod || g.id, ad: g.ad || "", miktar: Number(g.miktar) || 0, birim: g.birim || "", uyari: Number(g.uyariSeviyesi) || 0,
      ikmal: !!g.ikmalGerekli, reyon: g.reyon || "", h: 110, fill: 1 };
    const esik = pal.uyari > 0 ? pal.uyari * 4 : Math.max(pal.miktar, 1);
    pal.fill = Math.max(0.06, Math.min(1, pal.miktar / esik));
    if (!yr) { yersiz.push({ ...pal, neden: g.reyon ? `Reyon "${g.reyon}"` : "Reyon yok" }); continue; }
    const s = yuvaBul(yr.id, yr.no - 1, 0).find((x) => !x.pal);
    if (!s) { yersiz.push({ ...pal, neden: `${g.reyon}: yer dolu ya da yok` }); continue; }
    s.pal = pal;
  }
  // 2) raf kalemleri: kat/bölme konumu
  urunRaf = null;
  for (const r of raflar) {
    const rid = RAF_ID(r.ad);
    if (norm(r.ad).replace("Ü", "U").replace("İ", "I") === "URETIM") { urunRaf = r; continue; }
    for (const k of r.kalemler) {
      const pal = { tip: "raf", kod: k.stokKodu || "", ad: k.ad || "", miktar: Number(k.miktar) || 0, birim: k.birim || "", palet: Number(k.palet) || 0,
        skt: k.skt || "", giris: k.girisTarihi || "", cari: k.cari || "", not: k.not || "", raf: r.ad, h: 150, fill: 1 };
      if (!rid || !k.kat || !k.bolme) { yersiz.push({ ...pal, neden: !rid ? `${r.ad} rafı sahnede yok` : `${r.ad}: kat/bölme yok` }); continue; }
      const adet = Math.max(1, Math.min(3, pal.palet || 1));
      const bos = yuvaBul(rid, k.bolme - 1, k.kat - 1).filter((x) => !x.pal);
      if (!bos.length) { yersiz.push({ ...pal, neden: `${rid} Kat ${k.kat}/Böl. ${k.bolme} dolu ya da yok` }); continue; }
      bos.slice(0, adet).forEach((s, i) => { s.pal = { ...pal, parca: adet > 1 ? `${i + 1}/${adet}` : "" }; });
    }
  }
  slots.forEach((s) => s.pal && paletKur(s));
  alanlariKur();
  ppListe();
  boya(); ozet();
  $("altyazi").textContent = `${raflar.length} raf · ${slots.filter((s) => s.pal).length} palet/göz sahnede · son okuma ${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
}

/* palet yapma, hazır, üretim alanları */
let alanGrup = new THREE.Group(); dinamik.add(alanGrup);
const subeAd = (s) => s.subeAdi || String(s.ad || "").split(" — ")[0] || "—";
function alanlariKur() {
  zoneHits = zoneHits.filter((h) => !h.userData.z || !["yapma", "hazir"].includes(h.userData.z.zone));
  ["yapma", "hazir", "uretim"].forEach((id) => (Z(id).n = 0));
  dinamik.remove(alanGrup); alanGrup = new THREE.Group(); dinamik.add(alanGrup);
  zoneHits = zoneHits.filter((h) => h.userData.z?.zone !== "uretim");
  const eskiDinamik = dinamik; // alanPaleti dinamik'e ekler; burada gruba yönlendir
  const ekle = (...a) => { const g = alanPaleti(...a); eskiDinamik.remove(g); alanGrup.add(g); return g; };

  const yapma = siparisler.filter((s) => ["toplandi", "kontrol_ediliyor"].includes(s.durum)).slice(0, 10);
  yapma.forEach((s, i) => {
    const t = Number(s.toplamUrun) || 0, k = t ? (Number(s.kontrolEdilenUrun) || 0) / t : 0.3;
    const x = -7.4 + Math.floor(i / 5) * 2.6, z = 0.6 + (i % 5) * 2.2;
    ekle(x, z, 0.4 + 1.2 * Math.max(0.15, k), renkKod(subeAd(s)), { zone: "yapma", title: `${subeAd(s)}`, tag: s.durum === "kontrol_ediliyor" ? "Kontrol ediliyor" : "Kontrol bekliyor", tagc: "#8e44ad",
      rows: [["Kalem", `${t}`], ["Kontrol", `${s.kontrolEdilenUrun || 0} / ${t}`], ["Eksik", `${s.eksikUrun || 0}`], ["Toplayan", s.toplayanKullanici || "—"], ["Kontrol eden", s.kontrolBaşlayan || "—"]] }, false);
    const L = label(subeAd(s), renkKod(subeAd(s)), 0.45); L.position.set(x, 2.1, z); alanGrup.add(L);
  });
  const hazir = siparisler.filter((s) => s.durum === "tamamlandi");
  let hz = 0;
  hazir.forEach((s) => {
    const n = Math.max(1, Math.min(4, Number(s.paletSayisi) || 1));
    for (let j = 0; j < n && hz < 35; j++) {
      const col = hz % 7, row = Math.floor(hz / 7); hz++;
      const x = -7.8 + row * 1.4, z = 20.8 + col * 1.12;
      ekle(x, z, 1.45, renkKod(subeAd(s)), { zone: "hazir", title: `${subeAd(s)}${n > 1 ? ` · palet ${j + 1}/${n}` : ""}`, tag: "Sevke hazır", tagc: "#1f9d55",
        rows: [["Kalem", `${s.toplananUrun || 0}`], ["Kilo", s.toplamKg ? `${Math.round(s.toplamKg)} kg` : "—"], ["Eksik", `${s.eksikUrun || 0}`], ["Kontrol bitti", s.kontrolBitis ? new Date(s.kontrolBitis).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "—"]] }, true);
      if (j === 0) { const L = label(subeAd(s), renkKod(subeAd(s)), 0.45); L.position.set(x, 2.15, z); alanGrup.add(L); }
    }
  });
  (urunRaf?.kalemler || []).slice(0, 12).forEach((k, i) => {
    const x = 39 + Math.floor(i / 4) * 1.8, z = 19 + (i % 4) * 2.4;
    ekle(x, z, 1.1, renkKod(k.stokKodu || k.ad), { zone: "uretim", title: k.ad || k.stokKodu, tag: "ÜRETİM rafı", tagc: "#16a085",
      rows: [["Stok kodu", k.stokKodu || "—"], ["Miktar", `${sayi(k.miktar)} ${k.birim || ""}`], ["Giriş", k.girisTarihi || "—"], ["Not", k.not || "—"]] }, false);
  });
  zonlarCiz();
}

/* ---------------- Boyama, özet, detay ---------------- */
let mode = "status", sorgu = "", sel = null, sugs = [], sugI = 0, fly = null;
const durum = (p) => {
  if (p.tip === "goz") return p.ikmal ? "low" : "goz";
  const g = gunFark(p.skt);
  if (g != null && g < 0) return "gecti";
  if (g != null && g <= 30) return "skt";
  return "ok";
};
const eslesir = (p) => !sorgu || norm(p.kod).toLowerCase().includes(sorgu) || norm(p.ad).toLocaleLowerCase("tr").includes(sorgu);
function boya() {
  let n = 0;
  for (const s of slots) {
    const p = s.pal; if (!p || !p.bm) continue;
    p.bm.color.set(mode === "status" ? ST[durum(p)] : renkKod(p.kod || p.ad));
    const m = eslesir(p); if (m && sorgu) n++;
    for (const mt of [p.bm, p.wm]) { mt.transparent = !m; mt.opacity = m ? 1 : 0.1; mt.depthWrite = m; }
  }
  $("qinfo").textContent = sorgu ? `${n} palet/göz eşleşti.` : "Yazınca eşleşen paletler öne çıkar.";
  $("legend").innerHTML = mode === "status"
    ? `<span><i style="background:${ST.ok}"></i>Raf paleti</span><span><i style="background:${ST.goz}"></i>Toplama gözü</span><span><i style="background:${ST.low}"></i>İkmal gerekli</span><span><i style="background:${ST.skt}"></i>SKT ≤ 30 gün</span><span><i style="background:${ST.gecti}"></i>SKT geçmiş</span>`
    : '<span>Her ürün kendi renginde</span>';
}
function ozet() {
  const dolu = slots.filter((s) => s.pal);
  const rs = slots.filter((s) => !s.r.floor && !s.pick), rf = rs.filter((s) => s.pal).length;
  const ikmal = gozler.filter((g) => g.ikmalGerekli);
  const skt = dolu.filter((s) => s.pal.tip === "raf" && gunFark(s.pal.skt) != null && gunFark(s.pal.skt) <= 30).length;
  const k = [["Raf yeri", rs.length, ""], ["Dolu", `%${rs.length ? Math.round(rf / rs.length * 100) : 0}`, ""], ["Boş yer", rs.length - rf, ""], ["İkmal gerekli", ikmal.length + " göz", "p"],
    ["SKT ≤ 30 gün", skt + " palet", "a"], ["Paletleniyor", Z("yapma").n, ""], ["Sevke hazır", Z("hazir").n, ""]];
  $("kpis").innerHTML = k.map(([a, b, c]) => `<div class="kpi ${c}"><b>${b}</b><span>${a}</span></div>`).join("");
  $("fill").innerHTML = RACKS.map((r) => {
    const ss = slots.filter((s) => s.r === r && !s.pick), f = ss.filter((s) => s.pal).length, pc = ss.length ? Math.round(f / ss.length * 100) : 0;
    return `<div class="brow"><b>${r.id}</b><span>${f}/${ss.length} yer · %${pc}</span></div><div class="bar"><div style="width:${pc}%"></div></div>`;
  }).join("");
  $("crit").innerHTML = ikmal.length ? ikmal.sort((a, b) => (a.miktar || 0) - (b.miktar || 0)).slice(0, 12)
    .map((g) => `<li data-c="${esc(g.kod || g.id)}"><span>${esc(g.kod || "")} ${esc(g.ad || "")}</span><b style="color:var(--red);white-space:nowrap">${sayi(g.miktar)} / ${sayi(g.uyariSeviyesi)} ${esc(g.birim || "")}</b></li>`).join("") : "<li>İkmal gereken göz yok.</li>";
  $("yersizKart").classList.toggle("hidden", !yersiz.length);
  $("yersiz").innerHTML = yersiz.slice(0, 30).map((p) => `<li data-c="${esc(p.kod)}"><span>${esc(p.kod)} ${esc(p.ad)}</span><span class="r">${esc(p.neden)}</span></li>`).join("")
    + (yersiz.length > 30 ? `<li><span class="r">+${yersiz.length - 30} kayıt daha</span></li>` : "");
}
function toplam(kod) {
  let t = 0, n = 0, birim = "";
  slots.forEach((s) => { if (s.pal && s.pal.kod === kod && !s.pal.parca?.match(/^[2-9]/)) { t += s.pal.miktar; n++; birim = birim || s.pal.birim; } });
  yersiz.forEach((p) => { if (p.kod === kod) { t += p.miktar; n++; } });
  return { t, n, birim };
}
function detay(s) {
  const el = $("detail"), p = s.pal; if (!p) return;
  const st = durum(p);
  const stTxt = { ok: "Raf paleti", goz: "Toplama gözü", low: "İkmal gerekli", skt: "SKT yaklaşıyor", gecti: "SKT geçmiş" }[st];
  let satir;
  if (p.tip === "goz") {
    let kaynak = null, bd = 1e9;
    for (const o of slots) if (o.pal && o.pal.tip === "raf" && o.pal.kod && o.pal.kod === p.kod) { const d = Math.hypot(o.x - s.x, o.z - s.z) + o.l * 2; if (d < bd) { bd = d; kaynak = o; } }
    satir = `<dt>Reyon</dt><dd>${esc(p.reyon || "—")}</dd><dt>Gözde</dt><dd>${sayi(p.miktar)} ${esc(p.birim)}</dd><dt>Uyarı seviyesi</dt><dd>${sayi(p.uyari)} ${esc(p.birim)}</dd>
      <dt>İkmal kaynağı</dt><dd>${kaynak ? esc(slotAdi(kaynak)) : "Rafta bu ürün yok"}</dd>`;
  } else {
    const d = gunFark(p.skt);
    satir = `<dt>Raf</dt><dd>${esc(p.raf)}</dd><dt>Miktar</dt><dd>${sayi(p.miktar)} ${esc(p.birim)}${p.palet ? ` · ${p.palet} palet` : ""}${p.parca ? ` (${p.parca})` : ""}</dd>
      <dt>SKT</dt><dd>${p.skt ? `${tarihYaz(p.skt)}${d != null ? ` (${d} gün)` : ""}` : "—"}</dd><dt>Giriş</dt><dd>${esc(p.giris || "—")}</dd>
      ${p.cari ? `<dt>Cari</dt><dd>${esc(p.cari)}</dd>` : ""}${p.not ? `<dt>Not</dt><dd>${esc(p.not)}</dd>` : ""}`;
  }
  const tt = p.kod ? toplam(p.kod) : null;
  el.innerHTML = `<h2>${esc(p.ad || p.kod)}</h2><p style="margin:0 0 10px"><span class="tag" style="background:${ST[st]}">${stTxt}</span></p>
  <dl><dt>Konum</dt><dd>${esc(slotAdi(s))}</dd><dt>Stok kodu</dt><dd>${esc(p.kod || "—")}</dd>${satir}
  ${tt ? `<dt>Depoda toplam</dt><dd>${sayi(tt.t)} ${esc(tt.birim)} · ${tt.n} yer</dd>` : ""}</dl>
  ${p.kod ? '<button style="width:100%;margin-top:10px" id="sameBtn">Bu ürünün bütün yerlerini göster</button>' : ""}`;
  const b = $("sameBtn"); if (b) b.onclick = () => { qEl.value = p.kod; sorgu = p.kod.toLowerCase(); boya(); };
}
function alanSec(o) {
  const r = o.userData.z, el = $("detail"); sel = null;
  const bb = new THREE.Box3().setFromObject(o.parent.type === "Group" ? o.parent : o), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  selBox.scale.set(sz.x / 0.9 * 1.08, sz.y * 1.05, sz.z / 1.08 * 1.08); selBox.position.copy(c); selBox.visible = true;
  el.innerHTML = `<h2>${esc(r.title)}</h2><p style="margin:0 0 10px"><span class="tag" style="background:${r.tagc}">${esc(r.tag)}</span> <span class="muted">${esc(Z(r.zone).name)}</span></p><dl>${r.rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join("")}</dl>`;
}
function zonaUc(zn) { fly = { tgt: new THREE.Vector3(zn.cx, 0.6, zn.cz), pos: new THREE.Vector3(zn.cx - 6 - zn.w * 0.4, 8 + Math.max(zn.w, zn.d) * 0.7, zn.cz + 2) }; }
function sec(s) {
  sel = s; if (!s) { selBox.visible = false; return; }
  const bb = new THREE.Box3().setFromObject(s.pal.mesh), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  selBox.scale.set(sz.x / 0.9 * 1.08, sz.y * 1.05 + 0.05, sz.z / 1.08 * 1.08); selBox.position.copy(c); selBox.visible = true; detay(s);
}
function ucTo(s) { fly = { tgt: new THREE.Vector3(s.x, s.y + 0.8, s.z), pos: new THREE.Vector3(s.x - 3.5, s.y + 3.2, s.z + (s.r.face || 1) * 3.5) }; }
function zonlarCiz() {
  $("zones").innerHTML = ZONES.map((z) => {
    const n = z.floor ? slots.filter((s) => s.r.id === z.id && s.pal).length : z.n;
    const yazi = z.sabit ? "" : z.floor ? `${n} göz` : z.id === "uretim" ? `${n} kalem` : `${n} palet`;
    return `<li data-z="${z.id}"><span><i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${z.css};margin-inline-end:7px"></i>${z.floor ? z.name + " toplama sırası" : z.name}</span><b>${yazi}</b></li>`;
  }).join("");
}

/* ---------------- Yer önerisi (sadece gösterir) ---------------- */
function ppListe() {
  const m = new Map();
  slots.forEach((s) => { if (s.pal?.kod) m.set(s.pal.kod, s.pal.ad); });
  gozler.forEach((g) => g.kod && m.set(g.kod, g.ad || ""));
  $("ppList").innerHTML = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "tr", { numeric: true }))
    .map(([k, a]) => `<option value="${esc(k)}">${esc(a)}</option>`).join("");
}
function oner() {
  const h = +$("ph").value || 150, kod = $("pp").value.trim();
  const ayni = slots.filter((s) => s.pal && kod && s.pal.kod === kod);
  sugs = slots.filter((s) => !s.pal && !s.pick && !s.r.floor && s.levelCm - 15 >= h).map((s) => {
    let yakin = 15; for (const o of ayni) { const d = Math.hypot(o.x - s.x, (o.y - s.y) * 2, o.z - s.z); if (d < yakin) yakin = d; }
    return { s, puan: (s.x - PICK_X) * 0.35 + s.l * 3 + yakin * 0.8 + (s.levelCm - h) / 60, yakin };
  }).sort((a, b) => a.puan - b.puan).slice(0, 3);
  sugI = 0; onerCiz();
}
function onerCiz() {
  const ul = $("sug");
  if (!sugs.length) { ul.innerHTML = "<li>Bu yükseklikte boş yer yok.</li>"; ghost.visible = false; $("sugNot").classList.add("hidden"); return; }
  ul.innerHTML = sugs.map((o, i) => `<li data-i="${i}" class="${i === sugI ? "on" : ""}"><span>${esc(slotAdi(o.s))}</span><span class="muted" style="white-space:nowrap">${o.yakin < 15 ? "aynı ürün yakın" : "kat " + o.s.levelCm + " cm"}</span></li>`).join("");
  const s = sugs[sugI].s, h = (+$("ph").value || 150) / 100;
  ghost.scale.set(1, h, 1); ghost.position.set(s.x, s.y + h / 2, s.z); ghost.visible = true; ucTo(s);
  $("sugNot").classList.remove("hidden");
}
$("sug").onclick = (e) => { const li = e.target.closest("li[data-i]"); if (li) { sugI = +li.dataset.i; onerCiz(); } };
$("suggest").onclick = oner;

/* ---------------- Olaylar ---------------- */
const qEl = $("q");
qEl.oninput = () => { sorgu = qEl.value.trim().toLocaleLowerCase("tr"); boya(); };
const modSec = (m) => { mode = m; $("mStatus").setAttribute("aria-pressed", m === "status"); $("mProd").setAttribute("aria-pressed", m === "prod"); boya(); };
$("mStatus").onclick = () => modSec("status"); $("mProd").onclick = () => modSec("prod");
const listeAra = (e) => { const li = e.target.closest("li[data-c]"); if (li) { qEl.value = li.dataset.c; sorgu = li.dataset.c.toLowerCase(); boya(); } };
$("crit").onclick = listeAra; $("yersiz").onclick = listeAra;
$("reset").onclick = () => { fly = { tgt: HOME.tgt.clone(), pos: HOME.pos.clone() }; };
$("yenile").onclick = yukle;
$("zones").onclick = (e) => { const li = e.target.closest("li[data-z]"); if (li) zonaUc(Z(li.dataset.z)); };
const ray = new THREE.Raycaster(), v2 = new THREE.Vector2(); let down = null;
cv.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; fly = null; });
cv.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) return;
  const b = cv.getBoundingClientRect(); v2.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1); ray.setFromCamera(v2, cam);
  const h = ray.intersectObjects([...hits.filter((m) => eslesir(m.userData.slot.pal)), ...zoneHits])[0]; if (!h) return;
  h.object.userData.z ? alanSec(h.object) : sec(h.object.userData.slot);
});

/* tema + boyut + döngü */
function tema() {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  floorMat.color.set(dark ? 0x2a2f35 : 0xc9cdd2); grid.material.color && grid.material.color.set(dark ? 0x3a4048 : 0xb4b9bf);
}
tema(); matchMedia("(prefers-color-scheme: dark)").addEventListener("change", tema);
new ResizeObserver(() => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }).observe(stage);
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
function dongu(t) {
  if (fly) { const k = still ? 1 : 0.08; ctl.target.lerp(fly.tgt, k); cam.position.lerp(fly.pos, k); if (cam.position.distanceTo(fly.pos) < 0.05) fly = null; }
  if (ghost.visible) ghost.material.opacity = still ? 0.5 : 0.35 + 0.25 * Math.sin(t / 250);
  ctl.update(); renderer.render(scene, cam); requestAnimationFrame(dongu);
}
requestAnimationFrame(dongu);
zonlarCiz(); boya();

/* ---------------- Başlat ---------------- */
let basladi = false;
sayfaKorumasi(["depocu", "toplayici", "kontrolor"], (k) => {
  if (basladi) return; basladi = true;
  $("geriBtn").href = { admin: "admin.html", toplayici: "toplama.html", kontrolor: "kontrol.html", depocu: "ikmal.html" }[k?.rol] || "index.html";
  yukle();
  // siparişler canlı: palet yapma ve hazır alanları anında değişir
  tumSiparisleriCanliDinle((liste) => { siparisler = liste; if (raflar.length || gozler.length) { alanlariKur(); ozet(); } }, 7);
  // raflar ve gözler 5 dakikada bir tazelenir
  setInterval(() => { if (document.visibilityState === "visible") yukle(); }, 5 * 60 * 1000);
});
