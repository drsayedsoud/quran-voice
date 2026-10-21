/**
 * إعدادات واتصال Firebase لمشروع المصحف الصوتي الميسر
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyC8T3qnhKSUt151fDn0TY-JMVjEGUmNHCg",
  authDomain: "quran-2802a.firebaseapp.com",
  projectId: "quran-2802a",
  storageBucket: "quran-2802a.firebasestorage.app",
  messagingSenderId: "74658218150",
  appId: "1:74658218150:web:76b353c5bb4123d895b467",
  measurementId: "G-0M62SK8GM9"
};

// تهيئة التطبيق
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// إدارة هوية المستخدم وحفظ تقدمه تلقائياً
let currentUser = null;

export async function initUserSession(onUserReady) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      await syncUserMetadata(user);
      if (onUserReady) onUserReady(user);
    } else {
      try {
        const cred = await signInAnonymously(auth);
        currentUser = cred.user;
        await syncUserMetadata(cred.user);
        if (onUserReady) onUserReady(cred.user);
      } catch (err) {
        console.warn('Anonymous sign-in error (working in local offline mode):', err);
        // توليد معرف محلي بديل في حال انقطاع الشبكة
        let localUid = localStorage.getItem('local_quran_uid');
        if (!localUid) {
          localUid = 'local_' + Math.random().toString(36).substring(2, 10);
          localStorage.setItem('local_quran_uid', localUid);
        }
        currentUser = { uid: localUid, isAnonymous: true };
        if (onUserReady) onUserReady(currentUser);
      }
    }
  });
}

// حفظ وتحديث بيانات جهاز المستخدم ونشاطه في Firestore
async function syncUserMetadata(user) {
  if (!user || !user.uid) return;
  const userRef = doc(db, "users", user.uid);
  const now = new Date().toISOString();
  
  const deviceInfo = {
    userAgent: navigator.userAgent.slice(0, 150),
    isPwa: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language || 'ar'
  };

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
        deviceInfo: deviceInfo,
        preferences: {
          reciterId: 'husary',
          hapticEnabled: true,
          speechSpeed: 1.0
        },
        lastPosition: {
          surahId: 1,
          surahName: "الفاتحة",
          ayahNumber: 1
        },
        stats: {
          totalAyahsListened: 0,
          totalMinutes: 0
        }
      });
    } else {
      await updateDoc(userRef, {
        lastActiveAt: serverTimestamp(),
        deviceInfo: deviceInfo
      });
    }
  } catch (e) {
    console.warn('Firestore sync skipped:', e.message);
  }
}

// تحديث موضع التلاوة الأخير للمستخدم
export async function saveLastPosition(surah, ayahNumber, reciterId) {
  if (!currentUser) return;
  localStorage.setItem('quran_last_surah', surah.id);
  localStorage.setItem('quran_last_ayah', ayahNumber);
  localStorage.setItem('quran_last_reciter', reciterId);

  try {
    const userRef = doc(db, "users", currentUser.uid);
    await updateDoc(userRef, {
      "lastPosition.surahId": surah.id,
      "lastPosition.surahName": surah.name,
      "lastPosition.ayahNumber": ayahNumber,
      "preferences.reciterId": reciterId,
      lastActiveAt: serverTimestamp()
    });
  } catch (e) {
    // Silent fallback to local storage
  }
}

// تسجيل الأوامر الصوتية لتحليلات الأدمن (Voice Telemetry)
export async function logVoiceCommand(rawTranscript, parsedResult, success = true) {
  const logData = {
    uid: currentUser ? currentUser.uid : 'guest',
    rawTranscript: rawTranscript || '',
    normalized: parsedResult.normalized || '',
    intent: parsedResult.intent || 'UNKNOWN',
    payload: parsedResult.payload || {},
    success: success,
    timestamp: serverTimestamp(),
    timeString: new Date().toLocaleTimeString('ar-EG'),
    device: navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop'
  };

  try {
    await addDoc(collection(db, "voice_logs"), logData);
  } catch (e) {
    console.warn('Voice log skipped:', e.message);
  }
}

// زيادة عداد الآيات المستمعة
export async function recordAyahListened() {
  if (!currentUser) return;
  try {
    const userRef = doc(db, "users", currentUser.uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const currentCount = snap.data().stats?.totalAyahsListened || 0;
      await updateDoc(userRef, {
        "stats.totalAyahsListened": currentCount + 1,
        lastActiveAt: serverTimestamp()
      });
    }
  } catch (e) {
    // Ignore
  }
}

// الاستماع للرسائل والإعلانات الصوتية الصادرة من الأدمن
export function listenForAdminBroadcast(callback) {
  try {
    const alertRef = doc(db, "system_config", "broadcast");
    return onSnapshot(alertRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.active && data.message) {
          callback(data);
        }
      }
    }, (err) => {
      console.warn('Broadcast listener offline:', err.message);
    });
  } catch (e) {
    return () => {};
  }
}
