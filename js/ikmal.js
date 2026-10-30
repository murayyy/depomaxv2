// ============================================================================
// TOPLAMA GÖZÜ İKMAL (depocu ekranı)
// - Doldurulacak: uyarı seviyesine inen gözler canlı gelir, yeni gelende ses çalar.
//   "Doldurdum" -> depocu koyduğu miktarı girer, göze eklenir, kim/ne zaman kaydedilir.
// - Tüm Gözler: gözleri tanımla / düzenle / sayım düzeltmesi / Excel içe-dışa.
// Kota: sadece ikmalGerekli=true belgeler canlı dinlenir; tüm liste istenince bir kez okunur.
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import {
  ikmalBekleyenleriDinle, gozIkmalYap, gozKaydet, gozSil, gozleriTopluKaydet,
  tumGozleriGetir, gozHareketleriniGetir, katalogDinle,
  rafKalemleriniBul, rafKalemiGuncelle, rafKalemiSil, rafHareketiKaydet
} from "./veri.js?v=20261030b";
import {
  arayuzHazirla, toast, onayIste, kacisEt, sayiBicimle, ondalikOku, sesCal,
  reyonKarsilastir, excelDosyasiniOku, tarihBicimle
} from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;
let katalogCache = [];
let bekleyenler = [];
let tumGozler = [];
let tumGozlerYuklendi = false;
let aktifSekme = "bekleyen";
let ilkYukleme = true;
let yeniGelenIdler = new Set();
const kullaniciAdi = () => (mevcutKullanici ? (mevcutKullanici.ad || mevcutKullanici.uid) : "");

/* ---------------- Başlangıç ---------------- */
sayfaKorumasi(["depocu", "admin"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  katalogDinle((liste) => { katalogCache = liste.filter((u) => u.aktif !== false); });

  ikmalBekleyenleriDinle((liste, yeniGelenler) => {
    bekleyenler = liste.sort((a, b) => reyonKarsilastir(a.reyon, b.reyon));
    if (!ilkYukleme && yeniGelenler.length) {
      yeniGelenler.forEach((g) => yeniGelenIdler.add(g.id));
      uyariVer(yeniGelenler);
    }
    ilkYukleme = false;
    renderBekleyenler();
    if (tumGozlerYuklendi) {
      // Tüm Gözler tablosundaki durumları da canlı güncel tut (ek okuma yapmadan)
      const harita = new Map(liste.map((g) => [g.id, g]));
      tumGozler = tumGozler.map((g) => harita.get(g.id) || (g.ikmalGerekli ? { ...g, ikmalGerekli: false } : g));
      renderTumGozler();
    }
  });
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

/* ---------------- Sekmeler ---------------- */
document.querySelectorAll("[data-sekme]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-sekme]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    aktifSekme = btn.dataset.sekme;
    document.getElementById("bekleyenBloku").classList.toggle("u-hidden", aktifSekme !== "bekleyen");
    document.getElementById("tumBloku").classList.toggle("u-hidden", aktifSekme !== "tum");
    if (aktifSekme === "tum" && !tumGozlerYuklendi) tumGozleriYukle();
  });
});

/* ---------------- Sesli uyarı ---------------- */
let sesBaglami = null;

function sesiAc() {
  try {
    sesBaglami = sesBaglami || new (window.AudioContext || window.webkitAudioContext)();
    if (sesBaglami.state === "suspended") sesBaglami.resume();
  } catch (e) { sesBaglami = null; }
  document.getElementById("sesUyari").classList.add("u-hidden");
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}
document.getElementById("sesAcBtn").addEventListener("click", () => { sesiAc(); alarmCal(1); toast("Sesli uyarı açık.", "success"); });
document.addEventListener("click", () => { if (!sesBaglami) sesiAc(); }, { once: true });

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

function uyariVer(yeniGelenler) {
  alarmCal(3);
  const metin = yeniGelenler.length === 1
    ? `🔔 Doldur: ${yeniGelenler[0].ad || yeniGelenler[0].kod} (${yeniGelenler[0].reyon || "reyon yok"}) · gözde ${sayiBicimle(yeniGelenler[0].miktar)} ${yeniGelenler[0].birim || ""}`
    : `🔔 ${yeniGelenler.length} göz doldurulmalı: ${yeniGelenler.map((g) => g.ad || g.kod).join(", ")}`;
  toast(metin, "error", 10000);
  if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
    try { new Notification("Depomax · Toplama gözü", { body: metin.replace("🔔 ", ""), tag: "ikmal" }); } catch (e) {}
  }
}

// Doldurulmayı bekleyen göz varsa 10 dakikada bir kısa hatırlatma
setInterval(() => { if (bekleyenler.length) alarmCal(1); }, 10 * 60 * 1000);

/* ---------------- Doldurulacak listesi ---------------- */
function oranYuzde(g) {
  const seviye = Number(g.uyariSeviyesi) || 0;
  if (!seviye) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(g.miktar) || 0) / seviye * 100)));
}

function beklemeSuresi(g) {
  const t = g.ikmalBaslangic?.toDate?.();
  if (!t) return "";
  const dk = Math.max(0, Math.round((Date.now() - t.getTime()) / 60000));
  return dk < 60 ? `${dk} dk'dır bekliyor` : `${Math.floor(dk / 60)} sa ${dk % 60} dk'dır bekliyor`;
}

function renderBekleyenler() {
  const kap = document.getElementById("bekleyenListe");
  const sayac = document.getElementById("sekmeSayac");
  document.getElementById("bekleyenBos").classList.toggle("u-hidden", bekleyenler.length !== 0);
  sayac.textContent = bekleyenler.length;
  sayac.classList.toggle("u-hidden", bekleyenler.length === 0);
  document.title = (bekleyenler.length ? `(${bekleyenler.length}) ` : "") + "Toplama Gözü İkmal — Depomax";
  document.getElementById("ozetYazi").textContent = bekleyenler.length
    ? `${bekleyenler.length} göz doldurulmayı bekliyor · reyon sırasıyla`
    : "Tüm gözler uyarı seviyesinin üstünde.";

  kap.innerHTML = bekleyenler.map((g) => {
    const miktar = Number(g.miktar) || 0;
    const bos = miktar <= 0;
    return `
      <div class="ikmal-kart${bos ? " bos" : ""}${yeniGelenIdler.has(g.id) ? " yeni" : ""}" data-kod="${kacisEt(g.id)}">
        <div class="ikmal-kart__ana">
          <div class="ikmal-kart__ad">${kacisEt(g.ad || g.kod)}</div>
          <div class="ikmal-kart__meta">
            <span class="reyon-tag">${kacisEt(g.reyon || "—")}</span>
            <span class="cell-code">${kacisEt(g.kod || g.id)}</span>
            ${bos ? '<span class="badge badge-red">Göz boş</span>' : '<span class="badge badge-amber">Azaldı</span>'}
            <span>${beklemeSuresi(g)}</span>
          </div>
        </div>
        <div class="ikmal-kart__miktar">
          <div class="ikmal-kart__sayi${bos ? " bos" : ""}">${sayiBicimle(miktar)} <span style="font-size:12px;font-weight:500;">${kacisEt(g.birim || "")}</span></div>
          <div class="ikmal-kart__alt">uyarı seviyesi ${sayiBicimle(g.uyariSeviyesi)}</div>
          <div class="seviye-bar"><div class="seviye-bar__ic" style="width:${oranYuzde(g)}%;${bos ? "background:#EF4444;" : ""}"></div></div>
        </div>
        <button class="btn btn-green" data-doldur="${kacisEt(g.id)}">✓ Doldurdum</button>
      </div>`;
  }).join("");
  yeniGelenIdler.clear();

  kap.querySelectorAll("[data-doldur]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = bekleyenler.find((x) => x.id === btn.dataset.doldur);
      if (g) doldurModalAc(g);
    });
  });
}

/* ---------------- Doldurdum modalı (miktar zorunlu, kaynak: raf / direkt) ---------------- */
function doldurModalAc(g) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal" style="max-width:420px;">
        <h3>✓ Doldurdum — ${kacisEt(g.ad || g.kod)}</h3>
        <p style="font-size:13px;">
          <span class="reyon-tag">${kacisEt(g.reyon || "—")}</span>
          &nbsp; Gözde şu an: <b>${sayiBicimle(g.miktar)} ${kacisEt(g.birim || "")}</b>
        </p>
        <div class="field">
          <label>Göze koyduğunuz miktar (${kacisEt(g.birim || "birim")})</label>
          <input class="input" type="text" inputmode="decimal" id="dlMiktar" placeholder="Örn. 25" autocomplete="off" />
        </div>
        <div class="field">
          <label>Nereden geldi?</label>
          <div class="u-flex" style="gap:14px;flex-wrap:wrap;font-size:13.5px;">
            <label style="display:flex;gap:6px;align-items:center;"><input type="radio" name="dlKaynak" value="raf" checked /> Raftan</label>
            <label style="display:flex;gap:6px;align-items:center;"><input type="radio" name="dlKaynak" value="direkt" /> Direkt gelen ürün</label>
          </div>
        </div>
        <div id="dlRafBolum" style="background:var(--color-surface-2);padding:10px;border-radius:8px;margin-bottom:8px;">
          <div class="field" style="margin-bottom:8px;">
            <label>Hangi raftan?</label>
            <select class="select" id="dlRaf"><option value="">Raflar yükleniyor…</option></select>
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>Raftan düşülecek miktar <span id="dlRafBirim" class="u-text-soft"></span></label>
            <input class="input" type="text" inputmode="decimal" id="dlRafMiktar" placeholder="Göze koyduğunuzla aynıysa boş bırakın" autocomplete="off" />
          </div>
        </div>
        <div class="field">
          <label id="dlNotEtiket">Not (isteğe bağlı)</label>
          <input class="input" id="dlNot" placeholder="" />
        </div>
        <div class="u-text-soft" style="font-size:12px;" id="dlSonuc"></div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-green" data-role="kaydet">Kaydet</button>
        </div>
      </div>
    </div>`;
  const kapat = () => { root.innerHTML = ""; };
  const input = document.getElementById("dlMiktar");
  const sonuc = document.getElementById("dlSonuc");
  const rafSec = document.getElementById("dlRaf");
  const rafBolum = document.getElementById("dlRafBolum");
  const notInput = document.getElementById("dlNot");
  let kalemler = [];
  input.focus();

  const kaynak = () => root.querySelector('input[name="dlKaynak"]:checked').value;
  const seciliKalem = () => kalemler.find((k) => k.id === rafSec.value);

  function kaynakDegisti() {
    const raf = kaynak() === "raf";
    rafBolum.classList.toggle("u-hidden", !raf);
    document.getElementById("dlNotEtiket").textContent = raf ? "Not (isteğe bağlı)" : "Tedarikçi / not (isteğe bağlı)";
    notInput.placeholder = raf ? "" : "Örn. fabrikadan geldi";
  }
  root.querySelectorAll('input[name="dlKaynak"]').forEach((r) => r.addEventListener("change", kaynakDegisti));
  rafSec.addEventListener("change", () => {
    const k = seciliKalem();
    document.getElementById("dlRafBirim").textContent = k ? `(${k.birim || ""}, rafta ${sayiBicimle(k.miktar)})` : "";
  });

  // Ürünün raflardaki yerleri (SKT'si yakın olan önce)
  rafKalemleriniBul(g.kod || g.id).then((liste) => {
    kalemler = liste;
    if (!liste.length) {
      rafSec.innerHTML = '<option value="">Bu ürün hiçbir rafta kayıtlı değil</option>';
      root.querySelector('input[name="dlKaynak"][value="direkt"]').checked = true;
      kaynakDegisti();
      return;
    }
    rafSec.innerHTML = liste.map((k) => `<option value="${kacisEt(k.id)}">${kacisEt(k.rafAd)} · Kat ${k.kat || "?"}/Böl.${k.bolme || "?"} · ${sayiBicimle(k.miktar)} ${kacisEt(k.birim || "")}${k.skt ? " · SKT " + kacisEt(k.skt) : ""}</option>`).join("");
    rafSec.dispatchEvent(new Event("change"));
  }).catch((err) => {
    console.error("Raflar okunamadı:", err);
    rafSec.innerHTML = `<option value="">Raflar okunamadı: ${kacisEt(err.code || err.message || "bilinmeyen hata")}</option>`;
    root.querySelector('input[name="dlKaynak"][value="direkt"]').checked = true;
    kaynakDegisti();
  });

  input.addEventListener("input", () => {
    const m = ondalikOku(input.value) || 0;
    sonuc.textContent = m > 0 ? `Kayıttan sonra gözde ${sayiBicimle((Number(g.miktar) || 0) + m)} ${g.birim || ""} olacak.` : "";
  });
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };

  const kaydet = async () => {
    const miktar = ondalikOku(input.value) || 0;
    if (miktar <= 0) { toast("Göze koyduğunuz miktarı girin.", "error"); input.focus(); return; }
    const rafdan = kaynak() === "raf";
    const kalem = rafdan ? seciliKalem() : null;
    if (rafdan && !kalem) { toast("Hangi raftan aldığınızı seçin ya da 'Direkt gelen ürün' deyin.", "error"); return; }
    const rafMiktarStr = document.getElementById("dlRafMiktar").value.trim();
    const rafMiktar = rafdan ? (rafMiktarStr ? ondalikOku(rafMiktarStr) || 0 : miktar) : 0;
    if (rafdan && rafMiktar > (Number(kalem.miktar) || 0)) {
      toast(`Rafta sadece ${sayiBicimle(kalem.miktar)} ${kalem.birim || ""} görünüyor. Raftan düşülecek miktarı düzeltin.`, "error");
      return;
    }
    const btn = root.querySelector('[data-role="kaydet"]');
    btn.disabled = true;
    const not = notInput.value.trim();
    try {
      const s = await gozIkmalYap(g.id, miktar, kullaniciAdi(), not,
        rafdan ? { tip: "raf", rafAd: kalem.rafAd } : { tip: "direkt" });

      if (rafdan) {
        const kalan = (Number(kalem.miktar) || 0) - rafMiktar;
        try {
          if (kalan <= 0) await rafKalemiSil(kalem.rafId, kalem.id);
          else await rafKalemiGuncelle(kalem.rafId, kalem.id, { miktar: Math.round(kalan * 1000) / 1000 });
          await rafHareketiKaydet({
            rafId: kalem.rafId, rafAd: kalem.rafAd, tip: "cikis",
            stokKodu: kalem.stokKodu, ad: kalem.ad, miktar: rafMiktar, palet: 0, birim: kalem.birim,
            yapan: kullaniciAdi(), not: `Toplama gözüne (${g.reyon || "reyon yok"})${not ? ". " + not : ""}`
          });
        } catch (e) {
          toast(`Göz dolduruldu ama raftan düşülemedi: ${e.message || e}. Raflar sayfasından elle düşün.`, "error", 9000);
        }
      }

      kapat();
      if (tumGozlerYuklendi) {
        tumGozler = tumGozler.map((x) => x.id === g.id
          ? { ...x, miktar: s.yeni, ikmalGerekli: s.ikmalGerekli, sonIkmal: { miktar, yapan: kullaniciAdi(), tarih: null, kaynak: rafdan ? "raf" : "direkt", rafAd: kalem?.rafAd || "" } }
          : x);
        renderTumGozler();
      }
      const nereden = rafdan ? ` ${kalem.rafAd} rafından ${sayiBicimle(rafMiktar)} ${kalem.birim || ""} düşüldü.` : " (direkt gelen)";
      toast((s.ikmalGerekli
        ? `Kaydedildi. Gözde ${sayiBicimle(s.yeni)} ${g.birim || ""} var, hâlâ uyarı seviyesinin altında.`
        : `Kaydedildi. Gözde ${sayiBicimle(s.yeni)} ${g.birim || ""} var.`) + nereden, s.ikmalGerekli ? "info" : "success", 6000);
    } catch (err) {
      btn.disabled = false;
      toast("Kaydedilemedi: " + (err.message || err), "error");
    }
  };
  root.querySelector('[data-role="kaydet"]').onclick = kaydet;
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") kaydet(); });
}

/* ---------------- Tüm gözler ---------------- */
async function tumGozleriYukle() {
  try {
    tumGozler = await tumGozleriGetir();
    tumGozlerYuklendi = true;
    renderTumGozler();
  } catch (err) {
    console.error(err);
    toast("Gözler yüklenemedi: " + (err.message || err), "error");
  }
}
document.getElementById("yenileBtn").addEventListener("click", tumGozleriYukle);
document.getElementById("gozAra").addEventListener("input", () => renderTumGozler());

function durumRozeti(g) {
  if (!Number(g.uyariSeviyesi)) return '<span class="badge badge-gray">Seviye yok</span>';
  if ((Number(g.miktar) || 0) <= 0) return '<span class="badge badge-red">Boş</span>';
  if (g.ikmalGerekli) return '<span class="badge badge-amber">Doldurulmalı</span>';
  return '<span class="badge badge-green">Yeterli</span>';
}

function sonIkmalYazi(g) {
  if (!g.sonIkmal) return "—";
  const kaynakYazi = g.sonIkmal.kaynak === "raf" ? ` · ${kacisEt(g.sonIkmal.rafAd || "raf")}` : g.sonIkmal.kaynak === "direkt" ? " · direkt" : "";
  return `${sayiBicimle(g.sonIkmal.miktar)} · ${kacisEt(g.sonIkmal.yapan || "")}${kaynakYazi}<br><span class="u-text-soft" style="font-size:11px;">${g.sonIkmal.tarih ? tarihBicimle(g.sonIkmal.tarih) : "az önce"}</span>`;
}

function renderTumGozler() {
  const ara = document.getElementById("gozAra").value.trim().toLocaleLowerCase("tr");
  let liste = [...tumGozler].sort((a, b) => reyonKarsilastir(a.reyon, b.reyon));
  if (ara) {
    liste = liste.filter((g) =>
      (g.ad || "").toLocaleLowerCase("tr").includes(ara) ||
      (g.kod || g.id || "").toLocaleLowerCase("tr").includes(ara) ||
      (g.reyon || "").toLocaleLowerCase("tr").includes(ara));
  }
  document.getElementById("tumBos").classList.toggle("u-hidden", tumGozler.length !== 0);

  document.getElementById("gozTablosu").innerHTML = liste.map((g) => `
    <tr>
      <td><span class="reyon-tag">${kacisEt(g.reyon || "—")}</span></td>
      <td class="cell-code">${kacisEt(g.kod || g.id)}</td>
      <td>${kacisEt(g.ad || "")}</td>
      <td class="sayi"><b>${sayiBicimle(g.miktar)}</b> ${kacisEt(g.birim || "")}</td>
      <td class="sayi">${sayiBicimle(g.uyariSeviyesi)}</td>
      <td>${durumRozeti(g)}</td>
      <td style="font-size:12px;">${sonIkmalYazi(g)}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-green btn-sm" data-tdoldur="${kacisEt(g.id)}" title="Doldurdum">✓</button>
        <button class="btn btn-ghost btn-sm" data-duzenle="${kacisEt(g.id)}" title="Düzenle / sayım">✏</button>
        <button class="btn btn-danger btn-sm" data-sil="${kacisEt(g.id)}" title="Takipten çıkar">🗑</button>
      </td>
    </tr>`).join("");

  document.getElementById("gozKartlar").innerHTML = liste.map((g) => `
    <div class="row-card">
      <div class="row-card__top">
        <div>
          <div class="row-card__name">${kacisEt(g.ad || "")}</div>
          <div class="row-card__code">${kacisEt(g.kod || g.id)}</div>
        </div>
        <span class="reyon-tag">${kacisEt(g.reyon || "—")}</span>
      </div>
      <div class="row-card__grid">
        <div><div class="row-card__label">Gözde</div><b>${sayiBicimle(g.miktar)}</b> ${kacisEt(g.birim || "")}</div>
        <div><div class="row-card__label">Uyarı Seviyesi</div>${sayiBicimle(g.uyariSeviyesi)}</div>
        <div><div class="row-card__label">Durum</div>${durumRozeti(g)}</div>
        <div><div class="row-card__label">Son İkmal</div>${sonIkmalYazi(g)}</div>
      </div>
      <div class="row-card__actions">
        <button class="btn btn-green btn-sm" data-tdoldur="${kacisEt(g.id)}">✓ Doldurdum</button>
        <button class="btn btn-ghost btn-sm" data-duzenle="${kacisEt(g.id)}">✏ Düzenle</button>
        <button class="btn btn-danger btn-sm" data-sil="${kacisEt(g.id)}">🗑</button>
      </div>
    </div>`).join("");

  const bul = (id) => tumGozler.find((g) => g.id === id);
  document.querySelectorAll("#tumBloku [data-tdoldur]").forEach((b) => b.onclick = () => {
    const g = bul(b.dataset.tdoldur);
    if (g) doldurModalAc(g);
  });
  document.querySelectorAll("#tumBloku [data-duzenle]").forEach((b) => b.onclick = () => gozModalAc(bul(b.dataset.duzenle)));
  document.querySelectorAll("#tumBloku [data-sil]").forEach((b) => b.onclick = async () => {
    const g = bul(b.dataset.sil);
    if (!g) return;
    const onay = await onayIste({ baslik: "Takipten Çıkar", metin: `"${g.ad || g.kod}" toplama gözü takibinden çıkarılacak. Toplanınca artık düşmeyecek ve uyarı vermeyecek.`, onayMetni: "Çıkar" });
    if (!onay) return;
    await gozSil(g.id, kullaniciAdi());
    tumGozler = tumGozler.filter((x) => x.id !== g.id);
    renderTumGozler();
    toast("Takipten çıkarıldı.", "success");
  });
}

/* ---------------- Göz tanımla / düzenle (sayım düzeltmesi) ---------------- */
document.getElementById("yeniGozBtn").addEventListener("click", () => gozModalAc(null));

function katalogBul(kodVeyaAd) {
  const d = String(kodVeyaAd || "").trim();
  return katalogCache.find((u) => (u.stokKodu || u.kod) === d) || katalogCache.find((u) => u.ad === d);
}

function gozModalAc(mevcut) {
  const root = document.getElementById("modalRoot");
  const kodOptions = katalogCache.map((u) => `<option value="${kacisEt(u.stokKodu || u.kod || "")}">${kacisEt(u.ad)}</option>`).join("");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal" style="max-width:440px;">
        <h3>${mevcut ? "✏ Göz Düzenle — " + kacisEt(mevcut.ad || mevcut.kod) : "+ Toplama Gözü Tanımla"}</h3>
        <datalist id="gzKodList">${kodOptions}</datalist>
        <div class="field">
          <label>Stok Kodu</label>
          <input class="input" id="gzKod" list="gzKodList" autocomplete="off" value="${kacisEt(mevcut?.kod || mevcut?.id || "")}" ${mevcut ? "disabled" : ""} />
        </div>
        <div class="field"><label>Ürün Adı</label><input class="input" id="gzAd" value="${kacisEt(mevcut?.ad || "")}" /></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div class="field"><label>Reyon</label><input class="input" id="gzReyon" value="${kacisEt(mevcut?.reyon || "")}" /></div>
          <div class="field"><label>Birim</label><input class="input" id="gzBirim" value="${kacisEt(mevcut?.birim || "")}" placeholder="KG, Adet…" /></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div class="field"><label>Gözdeki miktar (sayım)</label><input class="input" type="text" inputmode="decimal" id="gzMiktar" value="${mevcut ? mevcut.miktar ?? "" : ""}" /></div>
          <div class="field"><label>Uyarı seviyesi</label><input class="input" type="text" inputmode="decimal" id="gzSeviye" value="${mevcut ? mevcut.uyariSeviyesi ?? "" : ""}" placeholder="Bu miktara inince uyar" /></div>
        </div>
        ${mevcut ? '<div class="u-text-soft" style="font-size:12px;">Gözdeki miktarı değiştirirseniz sayım düzeltmesi olarak geçmişe kaydedilir.</div>' : ""}
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="kaydet">Kaydet</button>
        </div>
      </div>
    </div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };

  const kodEl = document.getElementById("gzKod");
  kodEl.addEventListener("change", () => {
    const u = katalogBul(kodEl.value);
    if (!u) return;
    const ad = document.getElementById("gzAd"), reyon = document.getElementById("gzReyon"), birim = document.getElementById("gzBirim");
    if (!ad.value) ad.value = u.ad || "";
    if (!reyon.value) reyon.value = u.reyon || "";
    if (!birim.value) birim.value = u.birim || "";
  });

  root.querySelector('[data-role="kaydet"]').onclick = async () => {
    const kod = (mevcut ? (mevcut.kod || mevcut.id) : kodEl.value).trim();
    const miktarStr = document.getElementById("gzMiktar").value.trim();
    const seviyeStr = document.getElementById("gzSeviye").value.trim();
    if (!kod) { toast("Stok kodu zorunlu.", "error"); return; }
    if (miktarStr === "" || seviyeStr === "") { toast("Gözdeki miktar ve uyarı seviyesi zorunlu.", "error"); return; }
    if (!mevcut && tumGozler.some((g) => g.id === kod)) { toast("Bu ürün için zaten göz tanımlı, listeden düzenleyin.", "error"); return; }
    const veri = {
      ad: document.getElementById("gzAd").value.trim(),
      reyon: document.getElementById("gzReyon").value.trim(),
      birim: document.getElementById("gzBirim").value.trim(),
      miktar: ondalikOku(miktarStr) || 0,
      uyariSeviyesi: ondalikOku(seviyeStr) || 0
    };
    try {
      await gozKaydet(kod, veri, kullaniciAdi(), "sayim");
      kapat();
      toast(mevcut ? "Güncellendi." : "Toplama gözü tanımlandı.", "success");
      tumGozleriYukle();
    } catch (err) {
      toast("Kaydedilemedi: " + (err.message || err), "error");
    }
  };
}

/* ---------------- Excel ---------------- */
document.getElementById("excelIndirBtn").addEventListener("click", async () => {
  if (!tumGozlerYuklendi) await tumGozleriYukle();
  const satirlar = [["Reyon", "Stok Kodu", "Ürün Adı", "Birim", "Gözdeki Miktar", "Uyarı Seviyesi", "Durum", "Son İkmal Miktarı", "Son İkmal Yapan"]];
  [...tumGozler].sort((a, b) => reyonKarsilastir(a.reyon, b.reyon)).forEach((g) => {
    satirlar.push([g.reyon || "", g.kod || g.id, g.ad || "", g.birim || "", Number(g.miktar) || 0, Number(g.uyariSeviyesi) || 0,
      g.ikmalGerekli ? "Doldurulmalı" : "Yeterli", g.sonIkmal ? Number(g.sonIkmal.miktar) || 0 : "", g.sonIkmal?.yapan || ""]);
  });
  const ws = window.XLSX.utils.aoa_to_sheet(satirlar);
  // Stok kodlarını metin olarak sakla (baştaki sıfırlar kaybolmasın)
  for (let r = 2; r <= satirlar.length; r++) { const c = ws[`B${r}`]; if (c) { c.t = "s"; c.v = String(c.v); } }
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, "Toplama Gözleri");
  window.XLSX.writeFile(wb, `toplama_gozleri_${new Date().toLocaleDateString("tr-TR").replace(/\./g, "-")}.xlsx`);
});

document.getElementById("excelYukleBtn").addEventListener("click", () => document.getElementById("excelYukleInput").click());
document.getElementById("excelYukleInput").addEventListener("change", async (e) => {
  const dosya = e.target.files[0];
  e.target.value = "";
  if (!dosya) return;
  try {
    const satirlar = await excelDosyasiniOku(dosya);
    const al = (satir, adlar) => {
      for (const k of Object.keys(satir)) {
        if (adlar.includes(k.trim().toLocaleLowerCase("tr")) && satir[k] !== "") return satir[k];
      }
      return "";
    };
    const okunan = satirlar.map((s) => {
      const kod = String(al(s, ["stok kodu", "kod", "ürün kodu"]) || "").trim();
      const u = katalogBul(kod);
      return {
        kod,
        ad: String(al(s, ["ürün adı", "urun adi", "ad"]) || u?.ad || "").trim(),
        reyon: String(al(s, ["reyon"]) || u?.reyon || "").trim(),
        birim: String(al(s, ["birim"]) || u?.birim || "").trim(),
        miktar: ondalikOku(String(al(s, ["gözdeki miktar", "gozdeki miktar", "göz miktarı", "miktar"]))) || 0,
        uyariSeviyesi: ondalikOku(String(al(s, ["uyarı seviyesi", "uyari seviyesi", "uyarı", "min", "minimum"]))) || 0
      };
    }).filter((s) => s.kod);
    if (!okunan.length) { toast("Excel'de 'Stok Kodu' sütunu bulunamadı ya da satır yok.", "error", 7000); return; }
    const seviyesiz = okunan.filter((s) => !s.uyariSeviyesi).length;
    const onay = await onayIste({
      baslik: "Excel'den Yükle",
      metin: `${okunan.length} göz yüklenecek. Var olanların miktarı ve uyarı seviyesi Excel'dekiyle değiştirilecek.` +
        (seviyesiz ? ` ${seviyesiz} satırda uyarı seviyesi yok, bunlar uyarı vermez.` : ""),
      onayMetni: "Yükle"
    });
    if (!onay) return;
    const yazilan = await gozleriTopluKaydet(okunan, kullaniciAdi());
    toast(`${yazilan} toplama gözü yüklendi.`, "success");
    tumGozleriYukle();
  } catch (err) {
    console.error(err);
    toast("Excel okunamadı: " + (err.message || err), "error");
  }
});

/* ---------------- Geçmiş ---------------- */
document.getElementById("gecmisBtn").addEventListener("click", async () => {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-backdrop"><div class="modal"><p>Yükleniyor…</p></div></div>`;
  try {
    const liste = await gozHareketleriniGetir(50);
    const tipYazi = { ikmal: "✓ Dolduruldu", sayim: "✏ Sayım", tanim: "+ Tanımlandı", silindi: "🗑 Çıkarıldı" };
    root.innerHTML = `
      <div class="modal-backdrop" data-role="backdrop">
        <div class="modal" style="max-width:600px;">
          <h3>📋 Son 50 Göz Hareketi</h3>
          <div style="max-height:60vh;overflow-y:auto;">
            ${liste.length === 0 ? "<p>Henüz hareket yok.</p>" : liste.map((h) => `
              <div class="hareket-satir">
                <div style="min-width:100px;font-weight:700;">${tipYazi[h.tip] || kacisEt(h.tip)}</div>
                <div style="flex:1;">
                  <div style="font-weight:600;">${kacisEt(h.ad || h.kod)}</div>
                  <div style="font-size:11px;color:var(--color-ink-soft);">
                    ${h.kod ? kacisEt(h.kod) + " · " : ""}${h.tip === "ikmal" ? "+" + sayiBicimle(h.miktar) + (h.kaynak === "raf" ? " (" + kacisEt(h.rafAd || "raf") + ")" : h.kaynak === "direkt" ? " (direkt)" : "") + " · " : ""}${h.tip !== "tanim" || h.kod ? sayiBicimle(h.onceki) + " → " + sayiBicimle(h.sonra) : ""}${h.not ? " · " + kacisEt(h.not) : ""}
                  </div>
                </div>
                <div style="font-size:11px;color:var(--color-ink-soft);text-align:right;">${kacisEt(h.yapan || "")}<br>${tarihBicimle(h.tarih)}</div>
              </div>`).join("")}
          </div>
          <div class="modal__actions"><button class="btn btn-primary" data-role="kapat">Kapat</button></div>
        </div>
      </div>`;
    root.querySelector('[data-role="kapat"]').onclick = () => { root.innerHTML = ""; };
    root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") root.innerHTML = ""; };
  } catch (err) {
    console.error(err);
    root.innerHTML = "";
    toast("Geçmiş yüklenemedi: " + (err.message || err), "error");
  }
});
