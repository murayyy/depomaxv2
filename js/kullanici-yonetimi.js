// ============================================================================
// KULLANICI YÖNETİMİ (admin paneli için)
// ----------------------------------------------------------------------------
// Önemli not: Firebase'in istemci SDK'sında "createUserWithEmailAndPassword"
// çağrıldığı an, o tarayıcı oturumu otomatik olarak YENİ kullanıcıya geçer —
// yani admin, kendi hesabından çıkıp yeni oluşturduğu kullanıcı olarak
// işaretlenir. Bunu önlemek için ayrı (ikincil), isimlendirilmiş bir Firebase
// "app" örneği üzerinden kullanıcı oluşturuyoruz; bu, admin'in ana oturumunu
// (js/firebase.js içindeki `auth`) hiç etkilemiyor. Sunucu/Cloud Functions
// gerekmiyor, tamamen ücretsiz (Spark) planda çalışır.
// ============================================================================
import { firebaseConfig } from "./firebase-config.js";
import { db } from "./firebase.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signOut as ikincilCikisYap
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ikincilApp = initializeApp(firebaseConfig, "kullaniciOlusturmaApp");
const ikincilAuth = getAuth(ikincilApp);

const KULLANICILAR = "kullanicilar";

export function kullanicilariDinle(callback) {
  return onSnapshot(collection(db, KULLANICILAR), (snap) => {
    callback(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
  }, (err) => console.error("kullanicilariDinle:", err));
}

/**
 * Yeni bir personel hesabı oluşturur: Authentication'da hesap açar +
 * Firestore'da rol belgesini yazar. Admin'in kendi oturumunu etkilemez.
 */
export async function kullaniciOlustur({ ad, eposta, sifre, rol }) {
  const cred = await createUserWithEmailAndPassword(ikincilAuth, eposta, sifre);
  const uid = cred.user.uid;
  await setDoc(doc(db, KULLANICILAR, uid), {
    ad, eposta, rol,
    olusturulmaTarihi: serverTimestamp()
  });
  await ikincilCikisYap(ikincilAuth); // ikincil oturumu temizle (admin'in ana oturumu etkilenmez)
  return uid;
}

export function kullaniciRolGuncelle(uid, rol, ekstraAlanlar = {}) {
  return updateDoc(doc(db, KULLANICILAR, uid), { rol, ...ekstraAlanlar });
}

// Not: Bu sadece Firestore'daki rol belgesini siler — yani kullanıcının
// uygulamaya giriş yetkisini kaldırır. Authentication'daki hesabın kendisi
// (e-posta/şifre) silinmez; tamamen silmek isterseniz Firebase konsolundan
// Authentication > Users kısmından ayrıca silmeniz gerekir (istemci SDK'sı
// başka bir kullanıcının hesabını silme yetkisine sahip değildir).
export function kullaniciSil(uid) {
  return deleteDoc(doc(db, KULLANICILAR, uid));
}
