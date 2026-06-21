# Depomax — Tuğlubey Depo Otomasyon Sistemi (v2)

Bu klasör, eski Excel dosya alışverişine dayanan toplama/kontrol sisteminin
profesyonel bir yeniden yapımıdır.

## Ne değişti?

**Eskiden:** Toplama ekranı bir Excel dosyası üretiyordu (`..._siparis_tamam.xlsx`),
bu dosya elden/e-postayla kontrol ekibine ulaştırılıyor, kontrol ekranına tekrar
yükleniyordu. Dosya adı eşleşmesi koptuğunda veya biri eski bir dosyayı yüklediğinde
veri kayboluyordu. Kontrol ekranındaki barkod butonu hiç çalışmıyordu (taslaktı).
Giriş/yetkilendirme yoktu, herkes her şeyi yapabiliyordu.

**Şimdi:**
- Toplama ve kontrol ekranları **aynı veritabanını (Firebase Firestore)** paylaşıyor.
  Toplama ekibi bir ürünü işaretlediği an, kontrol ekibi bunu anında görüyor —
  dosya aktarımı yok, isim eşleştirme yok.
- **Gerçek barkod tarama** her iki ekranda da çalışıyor (kamera ile).
- **Giriş ve roller**: `toplayici`, `kontrolor`, `admin`. Her rol sadece kendi
  ekranını görür; admin ikisini de görebilir.
- Excel içe aktarma (sipariş oluşturma) ve dışa aktarma (rapor) hâlâ mevcut —
  ama artık tek kullanımlık bir aktarım değil, sadece kayıt/yedek amaçlı.
- Tüm `alert()` / `confirm()` / `prompt()` pencereleri kaldırıldı; yerine
  uygulama içi bildirim (toast) ve modal pencereler kondu.
- Mobil/tablet için tasarlandı (depo çalışanları telefon/tabletle barkod okutur).

## Dosya yapısı

```
depomax/
├── index.html          Giriş ekranı
├── toplama.html         Toplama ekranı (rol: toplayici)
├── kontrol.html         Kontrol ekranı (rol: kontrolor)
├── firestore.rules       Firestore güvenlik kuralları
├── css/style.css         Ortak tasarım
└── js/
    ├── firebase-config.js   ← SİZİN doldurmanız gereken dosya
    ├── firebase.js           Firebase başlatma + yetki koruması
    ├── veri.js               Firestore okuma/yazma fonksiyonları
    ├── utils.js              Toast, modal, Excel, barkod tarayıcı yardımcıları
    ├── toplama.js             Toplama ekranı mantığı
    └── kontrol.js             Kontrol ekranı mantığı
```

---

## Kurulum (tek seferlik, ~15 dakika)

### 1. Firebase projesi oluşturma
1. https://console.firebase.google.com adresine gidin, Google hesabınızla giriş yapın.
2. "Proje ekle" → bir isim verin (örn. `tuglubey-depomax`) → ücretsiz plan ile devam edin.

### 2. Authentication etkinleştirme
1. Sol menüden **Authentication** → **Get started**.
2. **Sign-in method** sekmesinde **Email/Password** sağlayıcısını etkinleştirin.
3. **Users** sekmesinden personeliniz için hesap ekleyin (e-posta + şifre).
   Her kullanıcı için oluşan **User UID**'yi not edin — 4. adımda gerekecek.

### 3. Firestore Database oluşturma
1. Sol menüden **Firestore Database** → **Create database** → "production mode" seçin,
   size yakın bir bölge seçin.
2. **Rules** sekmesine girip bu klasördeki `firestore.rules` dosyasının içeriğini
   yapıştırıp **Publish** deyin.

### 4. Kullanıcılara rol atama
Firestore'da `kullanicilar` koleksiyonu oluşturun. Her personel için, **belge ID'si
o kişinin Authentication UID'si** olacak şekilde bir belge ekleyin:

| Alan | Değer (örnek) |
|---|---|
| `ad` | "Mehmet Toplayıcı" |
| `rol` | `toplayici`  *(veya `kontrolor`, `admin`)* |

(Firestore konsolunda: **Start collection** → ID: `kullanicilar` → belge ID'sine
UID'yi yapıştırın → alanları ekleyin.)

### 5. Web uygulaması bağlantı bilgilerini alma
1. Proje ayarları (dişli simgesi) → **Genel** sekmesi → en altta **"Uygulamalarınız"**
   → `</>` (Web) simgesine tıklayıp bir takma ad girin → **Kaydet**.
2. Size gösterilen `firebaseConfig` nesnesini kopyalayıp `js/firebase-config.js`
   dosyasındaki yer tutucuların üzerine yapıştırın.

### 6. Yayınlama (HTTPS gerekli — kamera erişimi için şart)
En basit seçenek **Firebase Hosting**:
```bash
npm install -g firebase-tools
firebase login
firebase init hosting    # public klasörü olarak bu klasörü seçin
firebase deploy
```
Alternatif olarak bu klasörü olduğu gibi **Netlify** veya **GitHub Pages**'e
sürükleyip bırakabilirsiniz — ikisi de otomatik HTTPS verir. Dosyaları doğrudan
bilgisayardan çift tıklayarak açmak (file://) **kamera için çalışmaz**;
tarayıcılar kamerayı yalnızca HTTPS (veya localhost) üzerinden açmaya izin verir.

---

## Kullanım akışı

**Toplama (`toplayici` rolü):**
1. Giriş yap → "Yeni Sipariş" → ad ver, isterseniz Excel'i hemen yükleyin.
2. Reyon sırasına göre listelenen ürünleri topla; barkod okutarak veya
   kutucukları işaretleyerek "Toplandı"/"Eksik" işaretleyin.
3. Tüm ürünler işaretlenince "Toplamayı Tamamla" — sipariş otomatik olarak
   kontrol kuyruğuna düşer.

**Kontrol (`kontrolor` rolü):**
1. Giriş yap → kuyruktaki siparişi aç (toplama bitince anında görünür).
2. Barkod okutarak veya kutucuklarla "Kontrol Edildi" işaretle, gerekirse not ekle.
3. Tüm ürünler kontrol edilince "Kontrolü Tamamla" — sipariş arşive taşınır,
   Excel raporu istenildiğinde indirilebilir.

---

## Bilinen sınırlamalar / ileride eklenebilecekler
- Kullanıcı/rol yönetimi şu an Firebase konsolundan manuel yapılıyor; bir admin
  paneli eklenerek bu, uygulama içinden yapılabilir hale getirilebilir.
- Firestore kuralları sipariş belgesi için alan bazlı değil; isterseniz
  kontrolörün sadece kontrol alanlarını değiştirebilmesi gibi daha sıkı
  kurallar yazılabilir.
- Çoklu depo/şube desteği, push bildirimleri, ve geçmiş sipariş arama/filtreleme
  gibi özellikler bu sürümde yok ama mevcut veri modeline kolayca eklenebilir.
