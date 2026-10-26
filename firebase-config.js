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
  increment,
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

// إدارة هوية الجهاز الفريد وحفظ تقدم المستخدم تلقائياً
let currentUser = null;

/**
 * توليد أو استرجاع البصمة العتادية الفريدة للجهاز (Hardware Device Fingerprint)
 * يضمن عد الأجهزة الفعلية الحقيقية واستبعاد تكرار الزيارات أو مرات الدخول
 */
export function getUniqueDeviceId() {
  let deviceId = '';
  try {
    deviceId = localStorage.getItem('quran_device_id') || localStorage.getItem('local_quran_uid') || '';
  } catch (e) {}

  if (deviceId && deviceId.startsWith('dev_')) {
    return deviceId;
  }

  // توليد بصمة عتادية مدمجة من مواصفات الجهاز والشاشة والمعالج
  const components = [
    navigator.userAgent || '',
    navigator.platform || '',
    navigator.language || '',
    screen.width + 'x' + screen.height + 'x' + (screen.colorDepth || 24),
    window.devicePixelRatio || 1,
    navigator.hardwareConcurrency || 1,
    navigator.maxTouchPoints || 0,
    Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  ];

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('QuranVoiceDevice', 2, 2);
      components.push(canvas.toDataURL().slice(-50));
    }
  } catch (e) {}

  const raw = components.join('###');
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);

  deviceId = 'dev_' + hash;
  try {
    localStorage.setItem('quran_device_id', deviceId);
    localStorage.setItem('local_quran_uid', deviceId);
  } catch (e) {}

  return deviceId;
}

export async function initUserSession(onUserReady) {
  // تحديد الجهاز الفعلي الفريد بدلاً من تكرار الحساب في كل زيارة
  const deviceId = getUniqueDeviceId();
  currentUser = { uid: deviceId, deviceId: deviceId };

  // تسجيل ومزامنة بيانات الجهاز الفعلي في Firestore
  await syncUserMetadata(currentUser);
  if (onUserReady) onUserReady(currentUser);

  // إذا تم تفعيل Firebase Auth فسيتم ربط الجلسة تلقائياً
  try {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = { ...user, deviceId: deviceId };
        await syncUserMetadata(currentUser);
        if (onUserReady) onUserReady(currentUser);
      }
    });
  } catch (err) {
    console.warn('Auth observer running in direct mode:', err);
  }
}

// حفظ وتحديث بيانات جهاز المستخدم ونشاطه في Firestore
async function syncUserMetadata(user) {
  if (!user || !user.uid) return;
  const userRef = doc(db, "users", user.uid);
  
  const deviceInfo = {
    userAgent: (navigator.userAgent || '').slice(0, 150),
    isPwa: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    screenResolution: `${screen.width}x${screen.height}`,
    language: navigator.language || 'ar',
    platform: navigator.platform || '',
    cores: navigator.hardwareConcurrency || 1,
    pixelRatio: window.devicePixelRatio || 1
  };

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        deviceId: user.uid,
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
        visitCount: 1,
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
          totalSeconds: 0,
          totalMinutes: 0
        }
      });
    } else {
      // الجهاز موجود مسبقاً: نحدث فقط وقت آخر نشاط وعدد الزيارات لنفس الجهاز دون إنشاء مستخدم جديد
      const existingData = snap.data() || {};
      const prevVisits = existingData.visitCount || 1;
      await updateDoc(userRef, {
        lastActiveAt: serverTimestamp(),
        visitCount: prevVisits + 1,
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

// تسجيل وقت الاستماع الفعلي للمستخدم بالثواني والدقائق
export async function recordListeningTime(seconds) {
  if (!currentUser || !seconds || seconds <= 0) return;

  // حفظ تراكمي محلي
  const localTotal = (parseInt(localStorage.getItem('quran_user_total_seconds') || '0', 10)) + seconds;
  localStorage.setItem('quran_user_total_seconds', localTotal);

  try {
    const userRef = doc(db, "users", currentUser.uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const stats = snap.data().stats || {};
      const currentSeconds = stats.totalSeconds || ((stats.totalMinutes || 0) * 60);
      const newSeconds = currentSeconds + seconds;
      const newMinutes = Math.round(newSeconds / 60);

      await updateDoc(userRef, {
        "stats.totalSeconds": newSeconds,
        "stats.totalMinutes": newMinutes,
        lastActiveAt: serverTimestamp()
      });
    }
  } catch (e) {
    console.warn('Listening time sync skipped:', e.message);
  }
}

// الاستماع للرسائل والإعلانات الصوتية الصادرة من الأدمن
export function listenForAdminBroadcast(callback) {
  try {
    const alertRef = doc(db, "system_config", "broadcast");
    return onSnapshot(alertRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.active && data.message) {
          callback(data);
        } else {
          callback({ active: false });
        }
      } else {
        callback({ active: false });
      }
    }, (err) => {
      console.warn('Broadcast listener offline:', err.message);
    });
  } catch (e) {
    return () => {};
  }
}

// الاستماع لاستطلاعات الرأي السريعة المباشرة الصادرة من الإدارة (Micro-Surveys)
export function listenForActiveSurvey(callback) {
  try {
    const surveyRef = doc(db, "system_config", "survey");
    return onSnapshot(surveyRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.active && data.question) {
          callback({ ...data, id: data.id || 'survey_active' });
        } else {
          callback({ active: false });
        }
      } else {
        callback({ active: false });
      }
    }, (err) => {
      console.warn('Survey listener offline:', err.message);
    });
  } catch (e) {
    return () => {};
  }
}

// تسجيل تصويت ورأي المستخدم في الاستطلاع بدقة لمنع تكرار تصويت نفس الجهاز
export async function submitSurveyVote(surveyId, answer, comment = '') {
  const deviceId = getUniqueDeviceId();
  const responseId = `${surveyId}_${deviceId}`;
  const responseRef = doc(db, "survey_responses", responseId);

  const cleanComment = (comment || '').trim();
  const hasComment = cleanComment.length > 0;

  const responseData = {
    surveyId: surveyId,
    deviceId: deviceId,
    answer: answer || (hasComment ? 'رأي مكتوب' : 'موافق'),
    comment: cleanComment,
    hasComment: hasComment,
    timestamp: serverTimestamp(),
    timeString: new Date().toLocaleTimeString('ar-EG'),
    platform: navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop',
    userAgent: (navigator.userAgent || '').slice(0, 100),
    isPwa: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  };

  try {
    // 1. تسجيل صوت ورأي الجهاز في مجموعة استجابات الاستفتاءات
    await setDoc(responseRef, responseData);

    // 2. تحديث التعداد التراكمي في وثيقة الاستبيان
    const surveyRef = doc(db, "system_config", "survey");
    const updatePayload = {
      totalVotes: increment(1)
    };
    if (responseData.answer) {
      updatePayload[`votes.${responseData.answer}`] = increment(1);
    }
    if (hasComment) {
      updatePayload.totalComments = increment(1);
    }

    try {
      await updateDoc(surveyRef, updatePayload);
    } catch (updateErr) {
      const sSnap = await getDoc(surveyRef);
      if (sSnap.exists()) {
        const currentData = sSnap.data();
        const currentVotes = currentData.votes || {};
        if (responseData.answer) {
          currentVotes[responseData.answer] = (currentVotes[responseData.answer] || 0) + 1;
        }
        await updateDoc(surveyRef, {
          totalVotes: (currentData.totalVotes || 0) + 1,
          totalComments: (currentData.totalComments || 0) + (hasComment ? 1 : 0),
          votes: currentVotes
        });
      }
    }
    return { success: true };
  } catch (e) {
    console.warn('Failed to submit survey vote:', e);
    return { success: false, error: e.message };
  }
}
