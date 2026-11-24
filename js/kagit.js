// ============================================================================
// KAĞIT TOPLAMA — sistemin dışında kağıtla toplanan ürünler sonradan girilir.
// Toplama gözlerinden düşer (ADA ürünü ADA gözünden), Mikro'ya aktarılmaz.
// ============================================================================
import { auth, signOut, sayfaKorumasi } from "./firebase.js";
import { katalogDinle, kagitToplamaKaydet, kagitToplamaIptal, kagitToplamalariGetir } from "./veri.js?v=20261124";
import { arayuzHazirla, toast, onayIste, kacisEt, sayiBicimle, ondalikOku } from "./utils.js";

arayuzHazirla();

let ben = null;
let katalog = [];
let satirlar = [{ kod: "", ad: "", miktar: "", birim: "", ozelReyon: "" }];
const ADA = ["ADA"];
const reyonNorm = (v) => String(v || "").trim().toLocaleUpperCase("tr");
const adaMi = (u) => {
  for (const v of [u?.reyon, u?.kategori]) {
    const n = reyonNorm(v);
    const r = ADA.find((x) => n === x || n.startsWith(x + "-") || n.startsWith(x + " "));
    if (r) return r;
  }
  return "";
};
const kodu = (u) => String(u.stokKodu || u.kod || "").trim();

sayfaKorumasi(["depocu", "toplayici", "admin"], (k) => {
  ben = k;
  document.getElementById("kullaniciAdi").textContent = k.ad || k.uid;
  document.getElementById("rolEtiketi").textContent = k.rol;
  document.getElementById("kgTarih").value = new Date().toISOString().slice(0, 10);
  katalogDinle((l) => {
    katalog = (l || []).filter((u) => u.aktif !== false);
    document.getElementById("kgKatalog").innerHTML = katalog.map((u) =>
      `<option value="${kacisEt(kodu(u))}${adaMi(u) ? "@" + adaMi(u) : ""}">${kacisEt(u.ad || "")}${adaMi(u) ? " (🏝 " + adaMi(u) + ")" : ""}</option>`).join("");
  });
  ciz();
  gecmisYukle();
});
document.getElementById("cikisBtn").addEventListener("click", async () => { await signOut(auth); location.href = "index.html"; });

function urunBul(girdi) {
  const [kod, reyon] = String(girdi || "").trim().split("@");
  const adaylar = katalog.filter((u) => kodu(u) === kod);
  return adaylar.find((u) => adaMi(u) === (reyon || "")) || adaylar.find((u) => !adaMi(u)) || adaylar[0] || null;
}

function ciz() {
  const kutu = document.getElementById("kgSatirlar");
  kutu.innerHTML = satirlar.map((s, i) => `
    <div class="kg-satir">
      <input class="input" data-kod="${i}" list="kgKatalog" value="${kacisEt(s.kod + (s.ozelReyon ? "@" + s.ozelReyon : ""))}" placeholder="Kod" autocomplete="off" />
      <input class="input" data-ad="${i}" value="${kacisEt(s.ad)}" placeholder="Ürün adı" />
      <input class="input miktar" data-miktar="${i}" type="text" inputmode="decimal" value="${kacisEt(String(s.miktar))}" placeholder="Miktar" />
      <span class="birim u-text-soft" style="font-size:12px;">${kacisEt(s.birim)}${s.ozelReyon ? ` <b style="color:#B45309;">🏝${kacisEt(s.ozelReyon)}</b>` : ""}</span>
      <button class="btn btn-ghost btn-sm" data-sil="${i}" title="Sil">✕</button>
    </div>`).join("");
  kutu.querySelectorAll("[data-kod]").forEach((inp) => inp.addEventListener("change", () => {
    const i = Number(inp.dataset.kod);
    const u = urunBul(inp.value);
    const [kod] = inp.value.trim().split("@");
    satirlar[i] = { ...satirlar[i], kod, ad: u?.ad || satirlar[i].ad, birim: u?.birim || "", ozelReyon: u ? adaMi(u) : "" };
    if (i === satirlar.length - 1) satirlar.push({ kod: "", ad: "", miktar: "", birim: "", ozelReyon: "" });
    ciz();
    document.querySelector(`[data-miktar="${i}"]`)?.focus();
  }));
  kutu.querySelectorAll("[data-ad]").forEach((inp) => inp.addEventListener("input", () => { satirlar[Number(inp.dataset.ad)].ad = inp.value; }));
  kutu.querySelectorAll("[data-miktar]").forEach((inp) => {
    inp.addEventListener("input", () => { satirlar[Number(inp.dataset.miktar)].miktar = inp.value; ozet(); });
    inp.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const sonraki = document.querySelector(`[data-kod="${Number(inp.dataset.miktar) + 1}"]`);
      sonraki ? sonraki.focus() : document.getElementById("kgSatirEkle").click();
    });
  });
  kutu.querySelectorAll("[data-sil]").forEach((b) => b.addEventListener("click", () => {
    satirlar.splice(Number(b.dataset.sil), 1);
    if (!satirlar.length) satirlar.push({ kod: "", ad: "", miktar: "", birim: "", ozelReyon: "" });
    ciz();
  }));
  ozet();
}

function gecerliSatirlar() {
  return satirlar.filter((s) => s.kod && (ondalikOku(s.miktar) || 0) > 0)
    .map((s) => ({ ...s, miktar: ondalikOku(s.miktar) }));
}
function ozet() {
  const g = gecerliSatirlar();
  document.getElementById("kgOzet").textContent = g.length ? `${g.length} ürün` : "";
}

document.getElementById("kgSatirEkle").addEventListener("click", () => {
  satirlar.push({ kod: "", ad: "", miktar: "", birim: "", ozelReyon: "" });
  ciz();
  document.querySelector(`[data-kod="${satirlar.length - 1}"]`)?.focus();
});

document.getElementById("kgExcelBtn").addEventListener("click", () => document.getElementById("kgExcel").click());
document.getElementById("kgExcel").addEventListener("change", async (e) => {
  const dosya = e.target.files[0];
  e.target.value = "";
  if (!dosya) return;
  try {
    const wb = window.XLSX.read(await dosya.arrayBuffer(), { type: "array" });
    const satir = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    const al = (r, ...adlar) => {
      for (const a of adlar) {
        const anahtar = Object.keys(r).find((k) => k.trim().toLocaleLowerCase("tr") === a);
        if (anahtar !== undefined && String(r[anahtar]).trim() !== "") return String(r[anahtar]).trim();
      }
      return "";
    };
    const yeni = [], bulunamayan = [];
    satir.forEach((r) => {
      const kod = al(r, "stok kodu", "kod", "stokkodu");
      const miktar = ondalikOku(al(r, "miktar", "adet", "kg"));
      if (!kod || !miktar) return;
      const reyon = reyonNorm(al(r, "reyon"));
      const u = urunBul(kod + (ADA.includes(reyon) ? "@" + reyon : ""));
      if (!u) bulunamayan.push(kod);
      yeni.push({ kod, ad: u?.ad || al(r, "ürün adı", "urun adi", "ad"), miktar, birim: u?.birim || "", ozelReyon: u ? adaMi(u) : "" });
    });
    if (!yeni.length) { toast("Excel'de 'Stok Kodu' ve 'Miktar' sütunları bulunamadı.", "error"); return; }
    satirlar = satirlar.filter((s) => s.kod).concat(yeni, [{ kod: "", ad: "", miktar: "", birim: "", ozelReyon: "" }]);
    ciz();
    toast(`${yeni.length} satır eklendi.${bulunamayan.length ? ` Katalogda olmayan: ${bulunamayan.slice(0, 5).join(", ")}` : ""}`, bulunamayan.length ? "info" : "success", 6000);
  } catch (err) {
    console.error(err);
    toast("Excel okunamadı.", "error");
  }
});

document.getElementById("kgKaydet").addEventListener("click", async () => {
  const aciklama = document.getElementById("kgAciklama").value.trim();
  const kalemler = gecerliSatirlar();
  if (!aciklama) { toast("Kime toplandığını / açıklamayı yazın.", "error"); return; }
  if (!kalemler.length) { toast("Ürün girin.", "error"); return; }
  if (!(await onayIste({ baslik: "Kağıt toplamayı kaydet", metin: `${kalemler.length} ürün toplama gözlerinden düşülecek. Mikro'ya aktarılmaz.`, onayMetni: "Kaydet" }))) return;
  const btn = document.getElementById("kgKaydet");
  btn.disabled = true;
  try {
    await kagitToplamaKaydet({ aciklama, tarihStr: document.getElementById("kgTarih").value, kalemler, yapan: ben.ad || ben.uid });
    toast(`✅ ${kalemler.length} ürün gözlerden düşüldü.`, "success");
    satirlar = [{ kod: "", ad: "", miktar: "", birim: "", ozelReyon: "" }];
    document.getElementById("kgAciklama").value = "";
    ciz();
    gecmisYukle();
  } catch (err) {
    toast("Kaydedilemedi: " + (err.code || err.message), "error");
  } finally { btn.disabled = false; }
});

let gecmis = [];
async function gecmisYukle() {
  const tb = document.getElementById("kgGecmis");
  try {
    gecmis = await kagitToplamalariGetir(50);
  } catch (err) {
    tb.innerHTML = `<tr><td colspan="5" class="u-text-soft">Okunamadı: ${kacisEt(err.code || err.message)}</td></tr>`;
    return;
  }
  tb.innerHTML = gecmis.map((g) => `<tr style="${g.durum === "iptal" ? "opacity:.5;text-decoration:line-through;" : ""}">
    <td style="font-size:12px;white-space:nowrap;">${kacisEt(g.tarihStr ? g.tarihStr.split("-").reverse().join(".") : "")}</td>
    <td>${kacisEt(g.aciklama)}</td>
    <td style="font-size:12px;">${(g.kalemler || []).slice(0, 4).map((k) => `${kacisEt(k.kod)} ${sayiBicimle(k.miktar)}`).join(", ")}${(g.kalemler || []).length > 4 ? ` +${g.kalemler.length - 4}` : ""}</td>
    <td style="font-size:12px;">${kacisEt(g.yapan || "")}</td>
    <td>${g.durum === "iptal" ? "İptal" : `<button class="btn btn-ghost btn-sm" data-iptal="${g.id}">İptal</button>`}</td>
  </tr>`).join("") || `<tr><td colspan="5" class="u-text-soft">Kayıt yok.</td></tr>`;
  tb.querySelectorAll("[data-iptal]").forEach((b) => b.addEventListener("click", async () => {
    const g = gecmis.find((x) => x.id === b.dataset.iptal);
    if (!(await onayIste({ baslik: "Kaydı iptal et", metin: "Ürünler toplama gözlerine geri eklenecek.", onayMetni: "İptal et", tehlikeli: true }))) return;
    try { await kagitToplamaIptal(g.id, g, ben.ad || ben.uid); toast("İptal edildi, gözlere geri eklendi.", "success"); gecmisYukle(); }
    catch (err) { toast("İptal edilemedi: " + (err.code || err.message), "error"); }
  }));
}
