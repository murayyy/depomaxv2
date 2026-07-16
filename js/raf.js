// ============================================================================
// RAF YÖNETİMİ
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import {
  raflariDinle, rafOlustur, rafGuncelle, rafSil,
  rafKalemleriDinle, rafKalemiEkle, rafKalemiGuncelle, rafKalemiSil,
  rafHareketiKaydet, rafHareketleriniGetir, tumRaflariGetir,
  katalogDinle
} from "./veri.js";
import { arayuzHazirla, toast, onayIste, kacisEt, sayiBicimle, ondalikOku } from "./utils.js";

arayuzHazirla();

let mevcutKullanici = null;
let rafListesi = [];
let rafKalemleriMap = new Map(); // rafId → kalemler[]
let katalogCache = []; // Katalog ürünleri — autocomplete için
let kalemleriDinleMap = new Map(); // rafId → unsubscribe fn
let aktifSekme = "raflar";

sayfaKorumasi(["depocu", "admin"], (kullanici) => {
  mevcutKullanici = kullanici;
  document.getElementById("kullaniciAdi").textContent = kullanici.ad || kullanici.uid;
  document.getElementById("rolEtiketi").textContent = kullanici.rol;
  raflariDinle((liste) => {
    rafListesi = liste;
    dinlemeGuncelle(liste);
    render();
  });
  katalogDinle((liste) => { katalogCache = liste.filter((u) => u.aktif !== false); });
});

document.getElementById("cikisBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// Sekme
document.querySelectorAll("[data-sekme]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-sekme]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    aktifSekme = btn.dataset.sekme;
    document.getElementById("raflarBloku").classList.toggle("u-hidden", aktifSekme !== "raflar");
    document.getElementById("ozetBloku").classList.toggle("u-hidden", aktifSekme !== "ozet");
    if (aktifSekme === "ozet") renderOzet();
  });
});

// Kalem dinleyicilerini güncelle
function dinlemeGuncelle(liste) {
  const yeniIdler = new Set(liste.map((r) => r.id));
  // Silinenleri durdur
  kalemleriDinleMap.forEach((unsub, id) => {
    if (!yeniIdler.has(id)) { unsub(); kalemleriDinleMap.delete(id); rafKalemleriMap.delete(id); }
  });
  // Yenileri başlat
  liste.forEach((raf) => {
    if (!kalemleriDinleMap.has(raf.id)) {
      const unsub = rafKalemleriDinle(raf.id, (kalemler) => {
        rafKalemleriMap.set(raf.id, kalemler);
        render();
      });
      kalemleriDinleMap.set(raf.id, unsub);
    }
  });
}

/* ---- Doluluk hesapla ---- */
function dolulukHesapla(raf) {
  const kalemler = rafKalemleriMap.get(raf.id) || [];
  const kullanilanPalet = kalemler.reduce((t, k) => t + (Number(k.palet) || 0), 0);
  const kapasite = Number(raf.kapasite) || 0;
  const oran = kapasite > 0 ? kullanilanPalet / kapasite : 0;
  return { kullanilanPalet, kapasite, oran, bosKalan: Math.max(0, kapasite - kullanilanPalet) };
}

function dolulukSinif(oran) {
  if (oran < 0.25) return "doluluk-bos";
  if (oran < 0.5) return "doluluk-az";
  if (oran < 0.8) return "doluluk-orta";
  return "doluluk-dolu";
}

/* ---- Ana render ---- */
function render() {
  const grid = document.getElementById("rafGrid");
  const bos = document.getElementById("bosDurum");

  if (rafListesi.length === 0) {
    grid.innerHTML = "";
    bos.classList.remove("u-hidden");
    document.getElementById("ozetYazi").textContent = "Hiç raf yok.";
    return;
  }
  bos.classList.add("u-hidden");

  const toplamPalet = rafListesi.reduce((t, r) => t + (dolulukHesapla(r).kullanilanPalet || 0), 0);
  const toplamKap = rafListesi.reduce((t, r) => t + (Number(r.kapasite) || 0), 0);
  const toplamBos = toplamKap - toplamPalet;
  document.getElementById("ozetYazi").textContent =
    `${rafListesi.length} raf · ${toplamPalet}/${toplamKap} palet dolu · ${toplamBos} palet boş`;

  grid.innerHTML = rafListesi.map((raf) => {
    const { kullanilanPalet, kapasite, oran, bosKalan } = dolulukHesapla(raf);
    const kalemler = rafKalemleriMap.get(raf.id) || [];
    const yuzdePct = Math.round(oran * 100);
    const sinif = dolulukSinif(oran);

    return `
      <div class="raf-card" data-rafid="${raf.id}">
        <!-- Tıklanabilir başlık -->
        <div class="raf-card__header" data-toggle="${raf.id}">
          <div style="flex:1;">
            <div class="raf-card__isim">🗄 ${kacisEt(raf.ad)}</div>
            <div class="raf-card__meta">
              ${raf.kat} kat · ${raf.bolme} bölme · ${kapasite} palet kap. ·
              <span style="font-weight:600;color:${bosKalan === 0 ? "#EF4444" : "#10B981"};">${bosKalan} boş</span>
              · ${kalemler.length} ürün çeşidi
            </div>
            <!-- Mini doluluk bar başlıkta -->
            <div class="kapasite-bar" style="margin-top:6px;height:5px;">
              <div class="kapasite-bar__ic ${sinif}" style="width:${yuzdePct}%;"></div>
            </div>
          </div>
          <div class="u-flex" style="gap:6px;align-items:center;">
            <button class="btn btn-ghost btn-sm" data-duzenle="${raf.id}" onclick="event.stopPropagation()">✏</button>
            <button class="btn btn-danger btn-sm" data-sil="${raf.id}" onclick="event.stopPropagation()">✕</button>
            <span class="raf-card__chevron">▶</span>
          </div>
        </div>

        <!-- Açılır içerik -->
        <div class="raf-card__body">

        <!-- Ürün listesi -->
        ${kalemler.length > 0 ? `
          <div class="kalem-liste">
            ${kalemler.map((k) => `
              <div class="kalem-satir" data-kalem="${k.id}" data-raf="${raf.id}">
                <div class="kalem-satir__ad">
                  <div style="font-weight:600;">${kacisEt(k.ad)}</div>
                  <div style="font-size:11px;color:var(--color-ink-soft);">
                    ${k.stokKodu ? `<span class="cell-code">${kacisEt(k.stokKodu)}</span> · ` : ""}
                    ${k.kat ? `Kat ${k.kat} / Böl.${k.bolme}` : '<span style="color:#F59E0B;">⚠ Kat/bölme belirsiz</span>'}
                    ${k.cari ? ` · ${kacisEt(k.cari)}` : ""}
                    ${k.skt ? ` · SKT: ${k.skt}` : ""}
                  </div>
                </div>
                <div class="kalem-satir__miktar">${sayiBicimle(k.miktar)} ${kacisEt(k.birim)}</div>
                <div style="font-size:11px;color:var(--color-ink-soft);">${k.palet || 0} plt</div>
                <button class="btn btn-ghost btn-sm" data-kalemduzenle="${k.id}" data-kalemraf="${raf.id}" title="Düzenle / Taşı">✏</button>
                <button class="btn btn-ghost btn-sm" data-kalemsil="${k.id}" data-kalemraf="${raf.id}" title="Çıkış / Taşı">↗</button>
                <button class="btn btn-danger btn-sm" data-kalemkaldir="${k.id}" data-kalemraf="${raf.id}" title="Sil">🗑</button>
              </div>`).join("")}
          </div>` : `<div style="font-size:12px;color:var(--color-ink-soft);margin-top:8px;">Rafta ürün yok</div>`}

        <div style="margin-top:10px;">
          <button class="btn btn-primary btn-sm" data-urunekle="${raf.id}">+ Ürün Ekle</button>
        </div>
        ${raf.aciklama ? `<div style="font-size:11.5px;color:var(--color-ink-soft);margin-top:10px;">📝 ${kacisEt(raf.aciklama)}</div>` : ""}
        </div><!-- /raf-card__body -->
      </div>`;
  }).join("");

  // Event listener'lar
  // Accordion toggle
  grid.querySelectorAll("[data-toggle]").forEach((header) => {
    header.addEventListener("click", () => {
      const kart = header.closest(".raf-card");
      kart.classList.toggle("acik");
    });
  });

  grid.querySelectorAll("[data-urunekle]").forEach((btn) => {
    btn.addEventListener("click", () => urunEkleModalAc(btn.dataset.urunekle));
  });
  grid.querySelectorAll("[data-duzenle]").forEach((btn) => {
    btn.addEventListener("click", () => rafDuzenleModalAc(btn.dataset.duzenle));
  });
  grid.querySelectorAll("[data-sil]").forEach((btn) => {
    btn.addEventListener("click", () => rafSilOnay(btn.dataset.sil));
  });
  grid.querySelectorAll("[data-kalemduzenle]").forEach((btn) => {
    btn.addEventListener("click", () => kalemDuzenleModalAc(btn.dataset.kalemraf, btn.dataset.kalemduzenle));
  });
  grid.querySelectorAll("[data-kalemsil]").forEach((btn) => {
    btn.addEventListener("click", () => kalemCikisModalAc(btn.dataset.kalemraf, btn.dataset.kalemsil));
  });
  grid.querySelectorAll("[data-kalemkaldir]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const raf = rafListesi.find((r) => r.id === btn.dataset.kalemraf);
      const kalem = (rafKalemleriMap.get(btn.dataset.kalemraf) || []).find((k) => k.id === btn.dataset.kalemkaldir);
      if (!kalem) return;
      const onay = await onayIste({
        baslik: "Ürünü Sil",
        metin: `"${kalem.ad}" raftan silinecek. Bu işlem geri alınamaz.`,
        onayMetni: "Sil"
      });
      if (!onay) return;
      await rafHareketiKaydet({
        rafId: btn.dataset.kalemraf, rafAd: raf?.ad, tip: "silindi",
        stokKodu: kalem.stokKodu, ad: kalem.ad,
        miktar: kalem.miktar, palet: kalem.palet, birim: kalem.birim,
        yapan: mevcutKullanici.ad || mevcutKullanici.uid, not: "Manuel silme"
      });
      await rafKalemiSil(btn.dataset.kalemraf, btn.dataset.kalemkaldir);
      toast(`${kalem.ad} raftan silindi.`, "success");
    });
  });

  if (aktifSekme === "ozet") renderOzet();
}

/* ---- Doluluk özet görünümü ---- */
function renderOzet() {
  const grid = document.getElementById("ozetGrid");
  grid.innerHTML = rafListesi.map((raf) => {
    const { kullanilanPalet, kapasite, oran, bosKalan } = dolulukHesapla(raf);
    const sinif = dolulukSinif(oran);
    const renk = sinif === "doluluk-bos" ? "#10B981" : sinif === "doluluk-az" ? "#3B82F6" : sinif === "doluluk-orta" ? "#F59E0B" : "#EF4444";
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--color-border);">
        <div style="width:48px;height:48px;border-radius:8px;background:${renk}22;border:2px solid ${renk};
             display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:${renk};">
          ${Math.round(oran * 100)}%
        </div>
        <div style="flex:1;">
          <div style="font-weight:700;">${kacisEt(raf.ad)}</div>
          <div style="font-size:12px;color:var(--color-ink-soft);">${kullanilanPalet}/${kapasite} palet</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:14px;font-weight:700;color:${bosKalan === 0 ? "#EF4444" : "#10B981"};">${bosKalan}</div>
          <div style="font-size:11px;color:var(--color-ink-soft);">boş palet</div>
        </div>
      </div>`;
  }).join("");
}

/* ---- Yeni Raf modal ---- */
document.getElementById("yeniRafBtn").addEventListener("click", () => rafDuzenleModalAc(null));

function rafDuzenleModalAc(rafId) {
  const mevcut = rafId ? rafListesi.find((r) => r.id === rafId) : null;
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal">
        <h3>${mevcut ? "Raf Düzenle" : "Yeni Raf"}</h3>
        <div class="field"><label>Raf Adı</label><input class="input" id="rfAd" value="${kacisEt(mevcut?.ad || "")}" placeholder="Örn. A Rafı" /></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <div class="field"><label>Kat Sayısı</label><input class="input" type="number" id="rfKat" value="${mevcut?.kat || 3}" min="1" /></div>
          <div class="field"><label>Bölme Sayısı</label><input class="input" type="number" id="rfBolme" value="${mevcut?.bolme || 10}" min="1" /></div>
          <div class="field"><label>Kapasite (palet)</label><input class="input" type="number" id="rfKapasite" value="${mevcut?.kapasite || 30}" min="1" /></div>
        </div>
        <div class="field"><label>Not (isteğe bağlı)</label><input class="input" id="rfAciklama" value="${kacisEt(mevcut?.aciklama || "")}" placeholder="Raf hakkında not…" /></div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="kaydet">${mevcut ? "Güncelle" : "Oluştur"}</button>
        </div>
      </div>
    </div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
  root.querySelector('[data-role="kaydet"]').onclick = async () => {
    const ad = document.getElementById("rfAd").value.trim();
    if (!ad) { toast("Raf adı zorunlu.", "error"); return; }
    const veri = {
      ad,
      kat: parseInt(document.getElementById("rfKat").value) || 3,
      bolme: parseInt(document.getElementById("rfBolme").value) || 10,
      kapasite: parseInt(document.getElementById("rfKapasite").value) || 30,
      aciklama: document.getElementById("rfAciklama").value.trim()
    };
    if (mevcut) { await rafGuncelle(rafId, veri); toast("Raf güncellendi.", "success"); }
    else { await rafOlustur(veri); toast("Raf oluşturuldu.", "success"); }
    kapat();
  };
}

async function rafSilOnay(rafId) {
  const raf = rafListesi.find((r) => r.id === rafId);
  const onay = await onayIste({ baslik: "Rafı Sil", metin: `"${raf?.ad}" rafı silinecek. Üreteki ürünler de silinecek!`, onayMetni: "Sil" });
  if (!onay) return;
  await rafSil(rafId);
  toast("Raf silindi.", "success");
}

/* ---- Ürün Ekle modal ---- */
function urunEkleModalAc(rafId) {
  const raf = rafListesi.find((r) => r.id === rafId);
  const root = document.getElementById("modalRoot");
  const bugun = new Date().toISOString().slice(0,10);
  // Katalog ürünleri datalist için
  const katalogOptions = katalogCache
    .map((u) => `<option data-kod="${kacisEt(u.stokKodu || "")}" data-ad="${kacisEt(u.ad)}" value="${kacisEt(u.ad)}">Kod: ${kacisEt(u.stokKodu || "—")}</option>`)
    .join("");
  const kodOptions = katalogCache
    .map((u) => `<option data-ad="${kacisEt(u.ad)}" value="${kacisEt(u.stokKodu || "")}">İsim: ${kacisEt(u.ad)}</option>`)
    .join("");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal">
        <h3>📦 Ürün Ekle — ${kacisEt(raf?.ad)}</h3>
        <div class="field">
          <label>Ürün Adı</label>
          <input class="input" id="ueAd" placeholder="Ürün adı" list="katAdList" autocomplete="off" />
          <datalist id="katAdList">${katalogOptions}</datalist>
        </div>
        <div class="field">
          <label>Stok Kodu</label>
          <input class="input" id="ueKod" placeholder="Mikro stok kodu" list="katKodList" autocomplete="off" />
          <datalist id="katKodList">${kodOptions}</datalist>
        </div>
        <div class="field"><label>Cari Adı (Tedarikçi)</label><input class="input" id="ueCari" placeholder="Tedarikçi / cari adı" /></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <div class="field"><label>Miktar</label><input class="input" type="text" inputmode="decimal" id="ueMiktar" placeholder="0" /></div>
          <div class="field"><label>Birim</label><input class="input" id="ueBirim" value="KG" placeholder="KG, Adet…" /></div>
          <div class="field"><label>Palet Sayısı</label><input class="input" type="number" id="uePalet" placeholder="0" min="0" /></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div class="field"><label>Kat</label><input class="input" type="number" id="ueKat" placeholder="1" min="1" /></div>
          <div class="field"><label>Bölme</label><input class="input" type="number" id="ueBolme" placeholder="1" min="1" /></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div class="field"><label>Giriş Tarihi</label><input class="input" type="date" id="ueGirisTarihi" value="${bugun}" /></div>
          <div class="field"><label>SKT (Son Kullanma Tarihi)</label><input class="input" type="date" id="ueSkt" /></div>
        </div>
        <div class="field"><label>Not</label><input class="input" id="ueNot" placeholder="İsteğe bağlı…" /></div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="ekle">Ekle</button>
        </div>
      </div>
    </div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };

  // Autocomplete: ad yazılınca kod, kod yazılınca ad otomatik dolar
  const ueAdEl = root.querySelector("#ueAd");
  const ueKodEl = root.querySelector("#ueKod");
  ueAdEl?.addEventListener("change", () => {
    const s = katalogCache.find((u) => u.ad === ueAdEl.value);
    if (s && !ueKodEl.value) ueKodEl.value = s.stokKodu || "";
  });
  ueKodEl?.addEventListener("change", () => {
    const s = katalogCache.find((u) => u.stokKodu === ueKodEl.value);
    if (s) { ueAdEl.value = s.ad || ""; }
  });

  root.querySelector('[data-role="ekle"]').onclick = async () => {
    const ad = document.getElementById("ueAd").value.trim();
    if (!ad) { toast("Ürün adı zorunlu.", "error"); return; }
    const veri = {
      ad, stokKodu: document.getElementById("ueKod").value.trim(),
      cari: document.getElementById("ueCari").value.trim(),
      miktar: ondalikOku(document.getElementById("ueMiktar").value),
      birim: document.getElementById("ueBirim").value.trim() || "KG",
      palet: parseInt(document.getElementById("uePalet").value) || 0,
      kat: parseInt(document.getElementById("ueKat").value) || 1,
      bolme: parseInt(document.getElementById("ueBolme").value) || 1,
      girisTarihi: document.getElementById("ueGirisTarihi").value || new Date().toISOString().slice(0,10),
      skt: document.getElementById("ueSkt").value || "",
      not: document.getElementById("ueNot").value.trim()
    };
    await rafKalemiEkle(rafId, veri);
    await rafHareketiKaydet({ rafId, rafAd: raf?.ad, tip: "giris", ...veri, yapan: mevcutKullanici.ad || mevcutKullanici.uid });
    kapat();
    toast(`${veri.ad} rafa eklendi.`, "success");
  };
}

/* ---- Kalem Düzenle ---- */
function kalemDuzenleModalAc(rafId, kalemId) {
  const raf = rafListesi.find((r) => r.id === rafId);
  const kalem = (rafKalemleriMap.get(rafId) || []).find((k) => k.id === kalemId);
  if (!kalem) return;
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal">
        <h3>✏ Düzenle — ${kacisEt(kalem.ad)}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <div class="field"><label>Miktar</label><input class="input" type="text" inputmode="decimal" id="kdMiktar" value="${kalem.miktar}" /></div>
          <div class="field"><label>Birim</label><input class="input" id="kdBirim" value="${kacisEt(kalem.birim || "KG")}" /></div>
          <div class="field"><label>Palet</label><input class="input" type="number" id="kdPalet" value="${kalem.palet || 0}" /></div>
        </div>
        <div class="field"><label>Not</label><input class="input" id="kdNot" value="${kacisEt(kalem.not || "")}" /></div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-primary" data-role="kaydet">Güncelle</button>
        </div>
      </div>
    </div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };
  root.querySelector('[data-role="kaydet"]').onclick = async () => {
    await rafKalemiGuncelle(rafId, kalemId, {
      miktar: ondalikOku(document.getElementById("kdMiktar").value),
      birim: document.getElementById("kdBirim").value.trim(),
      palet: parseInt(document.getElementById("kdPalet").value) || 0,
      not: document.getElementById("kdNot").value.trim()
    });
    kapat();
    toast("Güncellendi.", "success");
  };
}

/* ---- Kalem Çıkış/Taşı ---- */
function kalemCikisModalAc(rafId, kalemId) {
  const raf = rafListesi.find((r) => r.id === rafId);
  const kalem = (rafKalemleriMap.get(rafId) || []).find((k) => k.id === kalemId);
  if (!kalem) return;
  const root = document.getElementById("modalRoot");
  const hedefRafOptions = rafListesi.filter(r => r.id !== rafId)
    .map(r => `<option value="${r.id}">${kacisEt(r.ad)}</option>`).join("");
  root.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop">
      <div class="modal">
        <h3>↗ Çıkış / Taşı — ${kacisEt(kalem.ad)}</h3>
        <p style="font-size:13px;">
          Mevcut: <b>${sayiBicimle(kalem.miktar)} ${kacisEt(kalem.birim)}, ${kalem.palet || 0} palet</b>
          ${kalem.kat ? ` · Kat ${kalem.kat} Böl.${kalem.bolme}` : ""}
        </p>
        <div class="field">
          <label>İşlem Tipi</label>
          <select class="select" id="cikTip">
            <option value="cikis">Raftan çıktı (toplama alanına)</option>
            <option value="kat_tasima">Aynı rafta farklı kat/bölmeye taşı</option>
            <option value="tasima">Başka rafa taşındı</option>
            <option value="fire">Fire / Kullanıldı</option>
          </select>
        </div>
        <!-- Taşıma hedefi — sadece "tasima" seçilince göster -->
        <div id="tasımaHedef" style="display:none;background:var(--color-surface-2);padding:10px;border-radius:8px;margin-bottom:8px;">
          <div class="field"><label>Hedef Raf</label>
            <select class="select" id="hedefRaf">${hedefRafOptions || '<option value="">Başka raf yok</option>'}</select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div class="field"><label>Hedef Kat</label><input class="input" type="number" id="hedefKat" placeholder="1" min="1" /></div>
            <div class="field"><label>Hedef Bölme</label><input class="input" type="number" id="hedefBolme" placeholder="1" min="1" /></div>
          </div>
        </div>
        <!-- Aynı rafta kat/bölme değişimi -->
        <div id="katTasimaHedef" style="display:none;background:var(--color-surface-2);padding:10px;border-radius:8px;margin-bottom:8px;">
          <div style="font-size:12.5px;color:var(--color-ink-soft);margin-bottom:8px;">Mevcut: Kat ${kalem.kat || "?"} / Bölme ${kalem.bolme || "?"}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div class="field"><label>Yeni Kat</label><input class="input" type="number" id="yeniKat" placeholder="${kalem.kat || 1}" min="1" value="${kalem.kat || ""}" /></div>
            <div class="field"><label>Yeni Bölme</label><input class="input" type="number" id="yeniBolme" placeholder="${kalem.bolme || 1}" min="1" value="${kalem.bolme || ""}" /></div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div class="field"><label>Çıkan / Taşınan Miktar</label><input class="input" type="text" inputmode="decimal" id="cikMiktar" value="${kalem.miktar}" /></div>
          <div class="field"><label>Palet</label><input class="input" type="number" id="cikPalet" value="${kalem.palet || 0}" /></div>
        </div>
        <div class="field"><label>Not</label><input class="input" id="cikNot" placeholder="Açıklama…" /></div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
          <button class="btn btn-danger" data-role="tamam">↗ Kaydet</button>
        </div>
      </div>
    </div>`;
  const kapat = () => { root.innerHTML = ""; };
  root.querySelector('[data-role="iptal"]').onclick = kapat;
  root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(); };

  // Tip değişince taşıma hedefini göster/gizle
  document.getElementById("cikTip").addEventListener("change", (e) => {
    document.getElementById("tasımaHedef").style.display = e.target.value === "tasima" ? "" : "none";
    document.getElementById("katTasimaHedef").style.display = e.target.value === "kat_tasima" ? "" : "none";
  });

  root.querySelector('[data-role="tamam"]').onclick = async () => {
    const tip = document.getElementById("cikTip").value;
    const not = document.getElementById("cikNot").value.trim();
    const cikanMiktar = ondalikOku(document.getElementById("cikMiktar").value);
    const cikanPalet = parseInt(document.getElementById("cikPalet").value) || 0;

    // Aynı rafta kat/bölme değişimi
    if (tip === "kat_tasima") {
      const yeniKat = parseInt(document.getElementById("yeniKat").value) || kalem.kat || 1;
      const yeniBolme = parseInt(document.getElementById("yeniBolme").value) || kalem.bolme || 1;
      await rafKalemiGuncelle(rafId, kalemId, { kat: yeniKat, bolme: yeniBolme });
      await rafHareketiKaydet({
        rafId, rafAd: raf?.ad, tip: "kat_degisimi",
        stokKodu: kalem.stokKodu, ad: kalem.ad,
        miktar: kalem.miktar, palet: kalem.palet, birim: kalem.birim,
        yapan: mevcutKullanici.ad || mevcutKullanici.uid,
        not: `Kat ${kalem.kat}/${kalem.bolme} → Kat ${yeniKat}/${yeniBolme}`
      });
      toast(`Taşındı: Kat ${yeniKat} / Bölme ${yeniBolme}`, "success");
      kapat();
      return;
    }

    await rafHareketiKaydet({
      rafId, rafAd: raf?.ad, tip,
      stokKodu: kalem.stokKodu, ad: kalem.ad,
      miktar: cikanMiktar, palet: cikanPalet, birim: kalem.birim,
      yapan: mevcutKullanici.ad || mevcutKullanici.uid, not
    });

    // Kaynaktan düş
    const kalanMiktar = (kalem.miktar || 0) - cikanMiktar;
    const kalanPalet = (kalem.palet || 0) - cikanPalet;
    if (kalanMiktar <= 0 && kalanPalet <= 0) {
      await rafKalemiSil(rafId, kalemId);
    } else {
      await rafKalemiGuncelle(rafId, kalemId, { miktar: Math.max(0, kalanMiktar), palet: Math.max(0, kalanPalet) });
    }

    // Taşıma ise hedef rafa ekle
    if (tip === "tasima") {
      const hedefRafId = document.getElementById("hedefRaf")?.value;
      const hedefRaf = rafListesi.find(r => r.id === hedefRafId);
      if (hedefRafId && hedefRaf) {
        await rafKalemiEkle(hedefRafId, {
          ad: kalem.ad, stokKodu: kalem.stokKodu || "",
          cari: kalem.cari || "",
          miktar: cikanMiktar, birim: kalem.birim, palet: cikanPalet,
          kat: parseInt(document.getElementById("hedefKat").value) || 1,
          bolme: parseInt(document.getElementById("hedefBolme").value) || 1,
          girisTarihi: new Date().toISOString().slice(0,10),
          skt: kalem.skt || "", not
        });
        await rafHareketiKaydet({
          rafId: hedefRafId, rafAd: hedefRaf.ad, tip: "giris",
          stokKodu: kalem.stokKodu, ad: kalem.ad,
          miktar: cikanMiktar, palet: cikanPalet, birim: kalem.birim,
          yapan: mevcutKullanici.ad || mevcutKullanici.uid,
          not: `${raf?.ad || ""}dan taşındı. ${not}`
        });
        toast(`✅ ${kacisEt(hedefRaf.ad)} rafına taşındı.`, "success");
      }
    } else {
      toast(tip === "cikis" ? "Raftan çıkarıldı." : "Fire kaydedildi.", "success");
    }
    kapat();
  };
}

/* ---- Hareket Geçmişi ---- */
document.getElementById("hareketGecmisBtn").addEventListener("click", async () => {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="empty-state__icon">⏳</div><p>Yükleniyor…</p></div></div>`;
  try {
    const hareketler = await rafHareketleriniGetir(50);
    root.innerHTML = `
      <div class="modal-backdrop" data-role="backdrop">
        <div class="modal" style="max-width:600px;">
          <h3>📋 Son 50 Hareket</h3>
          <div style="max-height:60vh;overflow-y:auto;">
            ${hareketler.length === 0 ? "<p>Hareket yok.</p>" : hareketler.map((h) => {
              const tarih = h.tarih?.toDate?.()?.toLocaleString("tr-TR") || "—";
              const tipEtiketi = h.tip === "giris" ? "✅ Giriş" : h.tip === "cikis" ? "↗ Çıkış" : h.tip === "tasima" ? "🔄 Taşıma" : "🔥 Fire";
              return `
                <div class="hareket-satir">
                  <div style="min-width:80px;">
                    <span class="hareket-tip ${h.tip}">${tipEtiketi}</span>
                  </div>
                  <div style="flex:1;">
                    <div style="font-weight:600;">${kacisEt(h.ad)}</div>
                    <div style="font-size:11px;color:var(--color-ink-soft);">
                      ${kacisEt(h.rafAd)} · ${sayiBicimle(h.miktar)} ${kacisEt(h.birim)} · ${h.palet || 0} palet
                      ${h.not ? " · " + kacisEt(h.not) : ""}
                    </div>
                  </div>
                  <div style="font-size:11px;color:var(--color-ink-soft);text-align:right;">
                    ${kacisEt(h.yapan)}<br>${tarih}
                  </div>
                </div>`;
            }).join("")}
          </div>
          <div class="modal__actions">
            <button class="btn btn-primary" data-role="kapat">Kapat</button>
          </div>
        </div>
      </div>`;
    root.querySelector('[data-role="kapat"]').onclick = () => { root.innerHTML = ""; };
    root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") root.innerHTML = ""; };
  } catch (err) {
    console.error(err);
    toast("Hareketler yüklenemedi.", "error");
    root.innerHTML = "";
  }
});

/* ---- Excel Export ---- */
document.getElementById("excelBtn").addEventListener("click", async () => {
  try {
    const raflar = await tumRaflariGetir();
    const wb = window.XLSX.utils.book_new();

    // Raf özeti sayfası
    const ozetSatirlar = [["Raf Adı", "Kat", "Bölme", "Kapasite (palet)", "Dolu (palet)", "Boş (palet)", "Doluluk %"]];
    raflar.forEach((r) => {
      const { kullanilanPalet, kapasite, oran, bosKalan } = dolulukHesapla(r);
      ozetSatirlar.push([r.ad, r.kat, r.bolme, kapasite, kullanilanPalet, bosKalan, Math.round(oran * 100) + "%"]);
    });
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(ozetSatirlar), "Raf Özeti");

    // Ürün envanteri sayfası
    const envSatirlar = [["Raf", "Kat", "Bölme", "Stok Kodu", "Ürün Adı", "Miktar", "Birim", "Palet", "Cari", "Giriş Tarihi", "SKT", "Not"]];
    raflar.forEach((r) => {
      const kalemler = rafKalemleriMap.get(r.id) || [];
      kalemler.forEach((k) => {
        envSatirlar.push([r.ad, k.kat || "—", k.bolme || "—", k.stokKodu || "—", k.ad, k.miktar, k.birim, k.palet || 0, k.cari || "—", k.girisTarihi || "—", k.skt || "—", k.not || ""]);
      });
    });
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(envSatirlar), "Ürün Envanteri");

    const tarih = new Date().toLocaleDateString("tr-TR").replace(/\./g, "-");
    window.XLSX.writeFile(wb, `raf_envanteri_${tarih}.xlsx`);
    toast("Excel indirildi.", "success");
  } catch (err) {
    console.error(err);
    toast("Excel oluşturulamadı.", "error");
  }
});
