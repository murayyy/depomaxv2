// ============================================================================
// FIREBASE BAŞLATMA
// Tüm sayfalarda bu modül import edilir; app/auth/db tek yerden başlatılır.
// ============================================================================
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  enableIndexedDbPersistence,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Çevrimdışı destek: internet kesilse bile veriler önbellekten okunur,
// bağlantı gelince otomatik senkronize olur.
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Çevrimdışı mod: birden fazla sekme açık, yalnızca biri aktif olabilir.");
  } else if (err.code === "unimplemented") {
    console.warn("Çevrimdışı mod bu tarayıcıda desteklenmiyor.");
  }
});

export { onAuthStateChanged, signInWithEmailAndPassword, signOut, doc, getDoc };

/**
 * Giriş yapmış kullanıcının rol bilgisini "kullanicilar/{uid}" belgesinden okur.
 * Belge yoksa null döner (giriş engellenmeli).
 */
export async function kullaniciBilgisiGetir(uid) {
  const ref = doc(db, "kullanicilar", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { uid, ...snap.data() };
}

/**
 * Sayfa korumasını uygular: giriş yoksa veya rolü uygun değilse login'e gönderir.
 * @param {string[]} izinliRoller - bu sayfayı görebilecek roller (admin her zaman dahildir)
 * @param {(kullanici) => void} onReady - kullanıcı doğrulanınca çağrılır
 */
export function sayfaKorumasi(izinliRoller, onReady) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    const bilgi = await kullaniciBilgisiGetir(user.uid);
    if (!bilgi || (!izinliRoller.includes(bilgi.rol) && bilgi.rol !== "admin")) {
      await signOut(auth);
      window.location.href = "index.html?hata=yetkisiz";
      return;
    }
    onReady(bilgi);
  });
}