// ============================================================================
// ORTAK YARDIMCI FONKSİYONLAR
// Toast bildirimleri, özel modal/onay pencereleri, Excel okuma/yazma,
// barkod tarayıcı sarmalayıcısı ve reyon sıralama mantığı.
// (Eski sürümlerdeki window.alert / window.confirm / window.prompt kullanımı
//  kaldırıldı — bunlar mobil tarayıcılarda tutarsız görünüyordu.)
// ============================================================================

/* ---------------- Arayüz iskeletini hazırla ---------------- */
export function arayuzHazirla() {
  if (!document.getElementById("toastStack")) {
    const stack = document.createElement("div");
    stack.className = "toast-stack";
    stack.id = "toastStack";
    document.body.appendChild(stack);
  }
  if (!document.getElementById("modalRoot")) {
    const root = document.createElement("div");
    root.id = "modalRoot";
    document.body.appendChild(root);
  }
}

/* ---------------- Toast bildirimleri ---------------- */
export function toast(mesaj, tip = "info", sureMs = 3200) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = `toast toast-${tip}`;
  const ikon = { success: "✓", error: "✕", info: "ℹ" }[tip] || "ℹ";
  el.innerHTML = `<span>${ikon}</span><span>${mesaj}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity 0.2s ease";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 200);
  }, sureMs);
}

/* ---------------- Onay modalı (window.confirm yerine) ---------------- */
export function onayIste({ baslik, metin, onayMetni = "Onayla", iptalMetni = "Vazgeç", tehlikeli = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById("modalRoot");
    root.innerHTML = `
      <div class="modal-backdrop" data-role="backdrop">
        <div class="modal">
          <h3>${baslik}</h3>
          <p>${metin}</p>
          <div class="modal__actions">
            <button class="btn btn-ghost" data-role="iptal">${iptalMetni}</button>
            <button class="btn ${tehlikeli ? "btn-danger" : "btn-primary"}" data-role="onay">${onayMetni}</button>
          </div>
        </div>
      </div>`;
    const kapat = (sonuc) => { root.innerHTML = ""; resolve(sonuc); };
    root.querySelector('[data-role="onay"]').onclick = () => kapat(true);
    root.querySelector('[data-role="iptal"]').onclick = () => kapat(false);
    root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(false); };
  });
}

/* ---------------- Girdi modalı (window.prompt yerine) ---------------- */
export function girdiIste({ baslik, metin = "", etiket, varsayilan = "", placeholder = "", onayMetni = "Devam Et", tip = "text" }) {
  return new Promise((resolve) => {
    const root = document.getElementById("modalRoot");
    root.innerHTML = `
      <div class="modal-backdrop" data-role="backdrop">
        <div class="modal">
          <h3>${baslik}</h3>
          ${metin ? `<p>${metin}</p>` : ""}
          <div class="field">
            ${etiket ? `<label>${etiket}</label>` : ""}
            <input class="input" data-role="girdi" type="${tip}" value="${varsayilan}" placeholder="${placeholder}" />
          </div>
          <div class="modal__actions">
            <button class="btn btn-ghost" data-role="iptal">Vazgeç</button>
            <button class="btn btn-primary" data-role="onay">${onayMetni}</button>
          </div>
        </div>
      </div>`;
    const input = root.querySelector('[data-role="girdi"]');
    input.focus();
    const kapat = (sonuc) => { root.innerHTML = ""; resolve(sonuc); };
    root.querySelector('[data-role="onay"]').onclick = () => kapat(input.value.trim() || null);
    root.querySelector('[data-role="iptal"]').onclick = () => kapat(null);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") kapat(input.value.trim() || null); });
    root.querySelector('[data-role="backdrop"]').onclick = (e) => { if (e.target.dataset.role === "backdrop") kapat(null); };
  });
}

export function yukleniyorGoster(mesaj = "Yükleniyor…") {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal u-flex" style="justify-content:center;">
        <span class="spinner spinner-dark"></span>
        <span>${mesaj}</span>
      </div>
    </div>`;
}
export function yukleniyorKapat() {
  const root = document.getElementById("modalRoot");
  if (root) root.innerHTML = "";
}

/* ---------------- Reyon ayrıştırma & sıralama ---------------- */
// "A12.3" gibi reyon kodlarını [harf, koridor no, raf no] olarak ayırır
// ve listeleri buna göre sıralar (örn. A1.1, A1.2, A2.1, B1.1 ...).
export function reyonAyristir(reyonStr) {
  const s = String(reyonStr || "");
  const eslesme = s.match(/([A-Za-zÇĞİÖŞÜçğıöşü]+)\s*(\d+)(?:[.\-](\d+))?/);
  if (eslesme) {
    return [eslesme[1].toUpperCase(), parseInt(eslesme[2], 10) || 0, parseInt(eslesme[3], 10) || 0];
  }
  return [s.toUpperCase(), 0, 0];
}
export function reyonKarsilastir(a, b) {
  const [p1, n1, m1] = reyonAyristir(a);
  const [p2, n2, m2] = reyonAyristir(b);
  if (p1 !== p2) return p1.localeCompare(p2);
  if (n1 !== n2) return n1 - n2;
  return m1 - m2;
}

/* ---------------- Excel okuma / yazma (SheetJS) ---------------- */
// XLSX global'i sayfaya <script> ile cdnjs üzerinden yükleniyor.
export function excelDosyasiniOku(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = window.XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const satirlar = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
        resolve(satirlar);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function excelOlarakIndir(basliklar, satirlar2D, dosyaAdi) {
  const ws = window.XLSX.utils.aoa_to_sheet([basliklar, ...satirlar2D]);
  // Ürün kodu sütununu metin olarak işaretle (önde sıfır vb. kaybolmasın)
  const range = window.XLSX.utils.decode_range(ws["!ref"]);
  for (let r = 1; r <= range.e.r; r++) {
    const ref = window.XLSX.utils.encode_cell({ c: 0, r });
    if (ws[ref]) { ws[ref].t = "s"; ws[ref].z = "@"; }
  }
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, "Ürünler");
  window.XLSX.writeFile(wb, dosyaAdi);
}

/* ---------------- Tarih biçimleme ---------------- */
export function tarihBicimle(timestamp) {
  if (!timestamp) return "—";
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ---------------- HTML kaçışı (basit XSS koruması) ---------------- */
export function kacisEt(deger) {
  const d = document.createElement("div");
  d.textContent = deger == null ? "" : String(deger);
  return d.innerHTML;
}

/* ---------------- Basit debounce ---------------- */
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------------- Barkod tarayıcı sarmalayıcısı (Html5Qrcode) ---------------- */
// Kullanım: const tarayici = new BarkodTarayici("scannerView");
//           await tarayici.baslat(barkod => { ... });
//           tarayici.durdur();
export class BarkodTarayici {
  constructor(elementId) {
    this.elementId = elementId;
    this.instance = null;
    this.calisiyor = false;
  }
  async baslat(onOkundu) {
    if (this.calisiyor) return;
    this.instance = new window.Html5Qrcode(this.elementId);
    this.calisiyor = true;
    try {
      await this.instance.start(
        { facingMode: "environment" },
        { fps: 12, qrbox: { width: 240, height: 160 } },
        (decodedText) => onOkundu(decodedText),
        () => {} // taramada her karede oluşan "bulunamadı" hatalarını yut
      );
    } catch (err) {
      this.calisiyor = false;
      throw err;
    }
  }
  async durdur() {
    if (this.instance && this.calisiyor) {
      try { await this.instance.stop(); this.instance.clear(); } catch (e) { /* yoksay */ }
    }
    this.calisiyor = false;
    this.instance = null;
  }
}
