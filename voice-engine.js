/**
 * محرك تحليل الأوامر الصوتية باللغة العربية
 * مصمم لفهم اللهجات والتحدث التلقائي لفاقدي البصر وكبار السن
 */

import { SURAHS, RECITERS } from './quran-data.js';

// تنظيف وتوحيد النص العربي لتسهيل المطابقة الدقيقة
export function normalizeArabic(text) {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    // إزالة التشكيل
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // توحيد الهمزات والألف
    .replace(/[أإآء]/g, 'ا')
    // توحيد التاء المربوطة والهاء
    .replace(/ة/g, 'ه')
    // توحيد الياء والألف المقصورة
    .replace(/[ىي]/g, 'ي')
    // إزالة التطويل
    .replace(/ـ+/g, '')
    // إزالة علامات الترقيم والأقواس
    .replace(/[.,/#!$%^&*;:{}=\-_`~()؟?،]/g, ' ')
    // دمج المسافات الزائدة
    .replace(/\s+/g, ' ')
    .trim();
}

// تحويل الكلمات الرقمية المنطوقة إلى أرقام صحيحة
const ARABIC_NUMBERS = {
  'صفر': 0, 'واحد': 1, 'واحدة': 1, 'اول': 1, 'الاولي': 1, 'الاولى': 1, 'اثنين': 2, 'اثنان': 2, 'تانية': 2, 'ثانية': 2,
  'تلاتة': 3, 'ثلاثة': 3, 'ثلاث': 3, 'تلات': 3, 'اربعة': 4, 'اربع': 4, 'خمسة': 5, 'خمس': 5,
  'ستة': 6, 'ست': 6, 'سبعة': 7, 'سبع': 7, 'ثمانية': 8, 'تمانية': 8, 'تمان': 8, 'ثمان': 8,
  'تسعة': 9, 'تسع': 9, 'عشرة': 10, 'عشر': 10,
  'حادي عشر': 11, 'اثنا عشر': 12, 'ثلاثة عشر': 13, 'اربعة عشر': 14, 'خمسة عشر': 15,
  'عشرين': 20, 'عشرون': 20, 'ثلاثين': 30, 'ثلاثون': 30, 'اربعين': 40, 'اربعون': 40,
  'خمسين': 50, 'خمسون': 50, 'ستين': 60, 'ستون': 60, 'سبعين': 70, 'سبعون': 70,
  'ثمانين': 80, 'ثمانون': 80, 'تسعين': 90, 'تسعون': 90, 'مية': 100, 'مئة': 100, 'مائة': 100,
  'ميتين': 200, 'مئتان': 200, 'مائتان': 200
};

export function extractNumber(text) {
  if (!text) return null;
  // فحص الأرقام المكتوبة كأرقام أولاً (1, 2, 255...)
  const digitMatch = text.match(/\b\d+\b/);
  if (digitMatch) {
    return parseInt(digitMatch[0], 10);
  }

  // مطابقة الأرقام المركبة المنطوقة
  for (const [word, num] of Object.entries(ARABIC_NUMBERS)) {
    if (text.includes(word)) {
      return num;
    }
  }
  return null;
}

/**
 * تحليل الأمر الصوتي واستخراج النية (Intent Recognition)
 */
export function parseVoiceCommand(rawTranscript) {
  const norm = normalizeArabic(rawTranscript);

  const result = {
    raw: rawTranscript,
    normalized: norm,
    intent: 'UNKNOWN',
    payload: {},
    message: ''
  };

  if (!norm) {
    result.intent = 'EMPTY';
    return result;
  }

  // 1. فحص طلب تغيير القارئ المذكور في الجملة
  let matchedReciter = null;
  for (const reciter of RECITERS) {
    for (const alias of reciter.aliases) {
      const normAlias = normalizeArabic(alias);
      if (norm.includes(normAlias)) {
        matchedReciter = reciter;
        break;
      }
    }
    if (matchedReciter) break;
  }

  // 2. فحص أوامر التحكم البسيطة
  // إيقاف مؤقت
  if (norm.match(/^(وقف|ايقاف|اسكت|اصمت|لحظه|استني|استنى|pause|stop)/) || norm.includes('وقف القراءه') || norm.includes('ايقاف مؤقت')) {
    result.intent = 'PAUSE';
    result.message = 'تم الإيقاف المؤقت';
    return result;
  }

  // استئناف أو متابعة
  if (norm.match(/^(كمل|تابع|استمر|واصل|شغل تاني|استئناف|resume|play)/)) {
    result.intent = 'RESUME';
    result.message = 'متابعة التلاوة';
    return result;
  }

  // الآية التالية
  if (norm.includes('التاليه') || norm.includes('اللي بعدها') || norm.includes('الايه الجايه') || norm.includes('قدم ايه') || norm.includes('تخطي')) {
    result.intent = 'NEXT_AYAH';
    result.message = 'الانتقال للآية التالية';
    return result;
  }

  // الآية السابقة
  if (norm.includes('السابقه') || norm.includes('اللي قبلها') || norm.includes('رجع ايه') || norm.includes('ارجع ورا')) {
    result.intent = 'PREV_AYAH';
    result.message = 'العودة للآية السابقة';
    return result;
  }

  // تكرار الآية
  if (norm.includes('كرر') || norm.includes('عيد') || norm.includes('تكرار') || norm.includes('مره تانيه')) {
    const times = extractNumber(norm) || 3;
    result.intent = 'REPEAT_AYAH';
    result.payload = { times };
    result.message = `سيتم تكرار الآية ${times} مرات`;
    return result;
  }

  // أين أنا / معرفة الموضع الحالي
  if (norm.includes('فين انا') || norm.includes('اين انا') || norm.includes('ما هي السوره') || norm.includes('رقم الايه') || norm.includes('انا فين')) {
    result.intent = 'STATUS_CHECK';
    result.message = 'الاستعلام عن موضع التلاوة الحالي';
    return result;
  }

  // طلب التفسير
  if (norm.includes('تفسير') || norm.includes('فسر') || norm.includes('معنى') || norm.includes('معني')) {
    result.intent = 'TAFSIR';
    result.message = 'قراءة التفسير الميسر للآية';
    return result;
  }

  // فتح صفحة الإدارة ولوحة التحكم
  if (norm.includes('لوحه الاداره') || norm.includes('لوحة الادارة') || norm.includes('صفحه الاداره') || norm.includes('صفحة الادارة') || norm.includes('لوحه التحكم') || norm.includes('لوحة التحكم') || norm.includes('لوحه المشرف') || norm.includes('لوحة المشرف')) {
    result.intent = 'OPEN_ADMIN';
    result.message = 'جاري فتح لوحة تحكم المشرف';
    return result;
  }

  // تغيير القارئ فقط دون تحديد سورة
  if (matchedReciter && (norm.startsWith('بصوت') || norm.includes('غير القارئ') || norm.includes('حول صوت'))) {
    result.intent = 'SET_RECITER';
    result.payload = { reciter: matchedReciter };
    result.message = `تم تغيير القارئ إلى الشيخ ${matchedReciter.name}`;
    return result;
  }

  // استثناء خاص لـ: "اية الكرسي"
  if (norm.includes('اية الكرسي') || norm.includes('ايه الكرسي')) {
    result.intent = 'PLAY_AYAH';
    result.payload = {
      surah: SURAHS.find(s => s.id === 2),
      ayahNumber: 255,
      reciter: matchedReciter
    };
    result.message = 'تشغيل آية الكرسي من سورة البقرة';
    return result;
  }

  // استثناء خاص لـ: "خواتيم سورة البقرة"
  if (norm.includes('خواتيم البقره') || norm.includes('اخر البقره')) {
    result.intent = 'PLAY_AYAH';
    result.payload = {
      surah: SURAHS.find(s => s.id === 2),
      ayahNumber: 284,
      reciter: matchedReciter
    };
    result.message = 'تشغيل أواخر سورة البقرة';
    return result;
  }

  // 3. البحث عن السورة ورقم الآية
  let matchedSurah = null;

  // فحص أسماء السور ومرادفاتها
  for (const surah of SURAHS) {
    const normSurahName = normalizeArabic(surah.name);
    if (norm.includes('سوره ' + normSurahName) || norm.includes('سورة ' + normSurahName) || norm.includes(normSurahName)) {
      matchedSurah = surah;
      break;
    }
    // فحص المرادفات والأسماء المشهورة
    if (surah.aliases) {
      for (const alias of surah.aliases) {
        const normAlias = normalizeArabic(alias);
        if (norm.includes(normAlias)) {
          matchedSurah = surah;
          break;
        }
      }
    }
    if (matchedSurah) break;
  }

  if (matchedSurah) {
    // استخراج رقم الآية إن وجد
    let ayahNum = 1;
    if (norm.includes('ايه') || norm.includes('اية') || norm.includes('رقم')) {
      const extracted = extractNumber(norm);
      if (extracted && extracted <= matchedSurah.ayahs) {
        ayahNum = extracted;
      }
    }

    result.intent = 'PLAY_SURAH';
    result.payload = {
      surah: matchedSurah,
      ayahNumber: ayahNum,
      reciter: matchedReciter
    };
    result.message = `تشغيل سورة ${matchedSurah.name}${ayahNum > 1 ? ` من الآية ${ayahNum}` : ''}${matchedReciter ? ` بصوت الشيخ ${matchedReciter.name}` : ''}`;
    return result;
  }

  // إذا لم نجد سورة ولكن ذكر القارئ فقط
  if (matchedReciter) {
    result.intent = 'SET_RECITER';
    result.payload = { reciter: matchedReciter };
    result.message = `تم اختيار الشيخ ${matchedReciter.name}`;
    return result;
  }

  return result;
}
