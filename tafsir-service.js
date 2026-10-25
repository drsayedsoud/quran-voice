/**
 * خدمة التفسير الميسر الأوفلاين (Offline Tafsir Service via IndexedDB)
 * 
 * معمارية متعددة الطبقات (Multi-Tier Caching):
 * - Tier 1: ذاكرة الوصول السريع RAM Cache (0ms)
 * - Tier 2: قاعدة بيانات المتصفح الدائمة IndexedDB (بدون إنترنت نهائياً)
 * - Tier 3: ملف JSON المحلي المضمن والمخزن في الـ Service Worker (tafsir-muyassar.json)
 * - Tier 4: خادم سحابي احتياطي (Fallback API) في الحالات النادرة
 */

const DB_NAME = 'quran_voice_db';
const DB_VERSION = 1;
const STORE_NAME = 'tafsir_muyassar';
const LOCAL_JSON_PATH = './tafsir-muyassar.json';

// Tier 1: ذاكرة التخزين السريع في الـ RAM
const memoryCache = new Map();

// مرجع الاتصال المفتوح بـ IndexedDB
let dbInstance = null;
let isSeedingInProgress = false;

/**
 * فتح وتهيئة قاعدة بيانات IndexedDB
 */
export async function openTafsirDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      console.warn('[TafsirService] IndexedDB غير مدعوم في هذا المتصفح، سيتم استخدام التخزين البديل.');
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        console.log(`[TafsirService] تم إنشاء مخزن ${STORE_NAME} بنجاح.`);
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.warn('[TafsirService] خطأ في فتح IndexedDB:', event.target.error);
      resolve(null);
    };
  });
}

/**
 * جلب تفسير آية محددة من IndexedDB محلياً
 */
async function getAyahFromIndexedDB(surahId, ayahNumber) {
  const db = await openTafsirDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const key = `${surahId}:${ayahNumber}`;
      const request = store.get(key);

      request.onsuccess = () => {
        if (request.result && request.result.text) {
          resolve(request.result.text);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null);
    } catch (e) {
      console.warn('[TafsirService] فشل القراءة من IndexedDB:', e);
      resolve(null);
    }
  });
}

/**
 * حفظ دفعة من التفسير داخل IndexedDB في معاملة واحدة فائقة السرعة
 */
async function saveAllToIndexedDB(tafsirDict) {
  const db = await openTafsirDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const [key, text] of Object.entries(tafsirDict)) {
        const [s, a] = key.split(':');
        store.put({
          key,
          surah: parseInt(s, 10),
          ayah: parseInt(a, 10),
          text
        });
      }

      tx.oncomplete = () => {
        console.log('[TafsirService] تم تخزين كامل التفسير الميسر (6236 آية) في IndexedDB للعمل أوفلاين بنجاح!');
        resolve(true);
      };

      tx.onerror = () => resolve(false);
    } catch (e) {
      console.warn('[TafsirService] فشل كتابة بيانات التفسير في IndexedDB:', e);
      resolve(false);
    }
  });
}

/**
 * تغذية قاعدة البيانات في الخلفية من ملف JSON المحلي (Background Seeding)
 */
export async function seedTafsirIfNeeded() {
  if (isSeedingInProgress) return;

  try {
    const existingSample = await getAyahFromIndexedDB(1, 1);
    if (existingSample) {
      // قاعدة البيانات جاهزة ومحملة بالفعل
      return;
    }

    isSeedingInProgress = true;
    console.log('[TafsirService] جاري مزامنة التفسير الميسر محلياً لأول مرة...');

    const response = await fetch(LOCAL_JSON_PATH);
    if (!response.ok) {
      throw new Error(`تعذر جلب ملف التفسير المحلي: ${response.status}`);
    }

    const tafsirData = await response.json();
    
    // حفظ أولاً في الـ RAM للاستجابة اللحظية الفورية
    for (const [k, v] of Object.entries(tafsirData)) {
      memoryCache.set(k, v);
    }

    // حفظ كامل الـ 6236 آية في IndexedDB في الخلفية
    await saveAllToIndexedDB(tafsirData);
  } catch (err) {
    console.warn('[TafsirService] تنبيه: تعذر إكمال المزامنة المسبقة للتفسير:', err);
  } finally {
    isSeedingInProgress = false;
  }
}

/**
 * الدالة الرئيسية: جلب التفسير الميسر للآية بأعلى سرعة وبدون إنترنت
 * 
 * @param {number} surahId رقم السورة (1 إلى 114)
 * @param {number} ayahNumber رقم الآية في السورة
 * @returns {Promise<string>} نص التفسير الميسر
 */
export async function getTafsir(surahId, ayahNumber) {
  const key = `${surahId}:${ayahNumber}`;

  // 1. فحص ذاكرة الـ RAM (0ms)
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }

  // 2. فحص IndexedDB محلياً أوفلاين (2-5ms)
  const idbText = await getAyahFromIndexedDB(surahId, ayahNumber);
  if (idbText) {
    memoryCache.set(key, idbText);
    return idbText;
  }

  // 3. في حال لم تكن IndexedDB ممتلئة بعد، نقرأ من ملف JSON المحلي المضمن
  try {
    const resp = await fetch(LOCAL_JSON_PATH);
    if (resp.ok) {
      const data = await resp.json();
      // تخزين في الذاكرة
      for (const [k, v] of Object.entries(data)) {
        memoryCache.set(k, v);
      }
      // إطلاق الحفظ الدائم في IndexedDB بالخلفية
      saveAllToIndexedDB(data).catch(() => {});

      if (data[key]) {
        return data[key];
      }
    }
  } catch (localErr) {
    console.warn('[TafsirService] تعذر قراءة ملف JSON المحلي، جاري محاولة السيرفر السحابي:', localErr);
  }

  // 4. السيرفر السحابي الخارجي كملاذ أخير (عند الاتصال فقط)
  try {
    const cloudResp = await fetch(`https://api.alquran.cloud/v1/ayah/${surahId}:${ayahNumber}/ar.muyassar`);
    if (cloudResp.ok) {
      const cloudData = await cloudResp.json();
      if (cloudData?.data?.text) {
        const cloudText = cloudData.data.text.trim();
        memoryCache.set(key, cloudText);
        return cloudText;
      }
    }
  } catch (cloudErr) {
    console.warn('[TafsirService] فشل جلب التفسير من السيرفر السحابي:', cloudErr);
  }

  throw new Error(`تعذر العثور على تفسير سورة ${surahId} آية ${ayahNumber}`);
}

/**
 * استخراج تفسير أو معنى كلمة محددة داخل نص تفسير الآية
 * 
 * @param {string} fullTafsir نص التفسير الكامل للآية
 * @param {string} term الكلمة المراد معرفة معناها
 * @returns {string|null} الجملة التي تشرح الكلمة إن وجدت
 */
export function extractTermMeaning(fullTafsir, term) {
  if (!fullTafsir || !term) return null;
  const cleanTerm = term.trim();
  if (cleanTerm.length < 2 || cleanTerm === 'الايه' || cleanTerm === 'الآية') {
    return null;
  }

  // تجزئة التفسير إلى جمل وعبارات
  const sentences = fullTafsir.split(/[\.\،\;\:\n]/).map(s => s.trim()).filter(Boolean);
  const matched = sentences.find(s => s.includes(cleanTerm));
  if (matched) return matched;

  // إذا لم يُذكر اللفظ صراحة وكان التفسير موجزاً، نعيد التفسير الإجمالي كشرح
  if (sentences.length <= 2 || fullTafsir.length < 200) {
    return fullTafsir;
  }

  return null;
}
