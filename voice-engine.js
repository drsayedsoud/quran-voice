/**
 * محرك تحليل الأوامر الصوتية باللغة العربية
 * مصمم لفهم اللهجات والتحدث التلقائي لفاقدي البصر وكبار السن
 */

import { SURAHS, RECITERS } from './quran-data.js';

// تنظيف وتوحيد النص العربي لتسهيل المطابقة الدقيقة
export function normalizeArabic(text) {
  if (!text) return '';
  let cleaned = text
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

  // تحويل "صوره" إلى "سوره" لضمان المطابقة في حال اشتبه التعرف الصوتي بين الصاد والسين
  cleaned = cleaned.replace(/\b(صوره|صورة)\b/g, 'سوره');
  return cleaned;
}

// تصحيح الأخطاء الشائعة في تحويل الصوت لكتابة (Speech-to-Text) للألفاظ القرآنية
export function cleanQuranicTranscript(text) {
  if (!text) return '';
  let cleaned = text.trim();
  // تصحيح الأخطاء الشائعة لكلمة سورة
  cleaned = cleaned.replace(/\b(صورة|صوره)\b/g, 'سورة');
  // تصحيح كتابة آية
  cleaned = cleaned.replace(/\b(ايه|اية|أيه|أية)\b/g, 'آية');
  // تصحيح أسماء السور المشهورة بأخطاء الإملاء الصوتي
  cleaned = cleaned.replace(/\b(طاها|طاهه)\b/g, 'طه');
  cleaned = cleaned.replace(/\b(ياسين)\b/g, 'يس');
  cleaned = cleaned.replace(/\b(ال عمران|ال عِمران)\b/g, 'آل عمران');
  cleaned = cleaned.replace(/\b(الكرسى)\b/g, 'الكرسي');
  return cleaned;
}

// مطابقة اسم السورة ككلمة كاملة لتفادي تشابه الحروف القصيرة (مثل "ص" في "الصلاة" أو "ق" في "وقف")
export function matchesSurahWord(normText, normCandidate) {
  if (!normText || !normCandidate) return false;
  if (normText.includes('سوره ' + normCandidate) || normText.includes('سورة ' + normCandidate)) {
    return true;
  }
  const words = normText.split(/\s+/);
  if (words.includes(normCandidate)) {
    return true;
  }
  if (normCandidate.length >= 3) {
    if (words.some(w => w === normCandidate || w === ('ال' + normCandidate) || ('ال' + w) === normCandidate)) {
      return true;
    }
  }
  return false;
}

// اختيار أفضل بديل مقترح من متصفح التعرف الصوتي (Chrome / Safari Web Speech)
export function pickBestAlternative(resultItem) {
  if (!resultItem || !resultItem.length) return '';
  if (resultItem.length === 1) return resultItem[0].transcript;

  for (let i = 0; i < resultItem.length; i++) {
    const raw = resultItem[i].transcript || '';
    const norm = normalizeArabic(raw);
    if (norm.includes('سوره') || norm.includes('ايه') || norm.includes('القران') || norm.includes('تفسير') || norm.includes('ايات')) {
      return raw;
    }
    for (const surah of SURAHS) {
      const normName = normalizeArabic(surah.name);
      if (matchesSurahWord(norm, normName)) {
        return raw;
      }
    }
  }
  return resultItem[0].transcript;
}

// فحص إذا كان الأمر بحثاً موضوعياً (Thematic Query)
export function isThematicQuery(text) {
  if (!text) return false;
  const norm = normalizeArabic(text);
  const thematicKeywords = ['ايات', 'موضوع', 'عن', 'قصة', 'احاديث', 'فضل', 'تحدث عن', 'عايز ايات', 'هات ايات'];
  return thematicKeywords.some(kw => norm.includes(kw));
}

// باقات مدمجة لأشهر الموضوعات القرآنية للعمل اللحظي الفوري بدون انتظار الشبكة
export const COMMON_TOPICS = {
  'صلاه': {
    topic: 'آيات الصلاة',
    passages: [
      { surahId: 2, ayahNumber: 43, label: 'سورة البقرة (43)' },
      { surahId: 2, ayahNumber: 238, label: 'سورة البقرة (238)' },
      { surahId: 17, ayahNumber: 78, label: 'سورة الإسراء (78)' },
      { surahId: 20, ayahNumber: 14, label: 'سورة طه (14)' },
      { surahId: 29, ayahNumber: 45, label: 'سورة العنكبوت (45)' }
    ]
  },
  'صبر': {
    topic: 'آيات الصبر',
    passages: [
      { surahId: 2, ayahNumber: 153, label: 'سورة البقرة (153)' },
      { surahId: 2, ayahNumber: 155, label: 'سورة البقرة (155)' },
      { surahId: 3, ayahNumber: 200, label: 'سورة آل عمران (200)' },
      { surahId: 39, ayahNumber: 10, label: 'سورة الزمر (10)' }
    ]
  },
  'والدين': {
    topic: 'آيات بر الوالدين',
    passages: [
      { surahId: 17, ayahNumber: 23, label: 'سورة الإسراء (23)' },
      { surahId: 31, ayahNumber: 14, label: 'سورة لقمان (14)' },
      { surahId: 46, ayahNumber: 15, label: 'سورة الأحقاف (15)' }
    ]
  },
  'جنه': {
    topic: 'آيات الجنة ونعيمها',
    passages: [
      { surahId: 2, ayahNumber: 25, label: 'سورة البقرة (25)' },
      { surahId: 18, ayahNumber: 107, label: 'سورة الكهف (107)' },
      { surahId: 55, ayahNumber: 46, label: 'سورة الرحمن (46)' }
    ]
  },
  'رزق': {
    topic: 'آيات الرزق والبركة',
    passages: [
      { surahId: 51, ayahNumber: 22, label: 'سورة الذاريات (22)' },
      { surahId: 65, ayahNumber: 3, label: 'سورة الطلاق (3)' },
      { surahId: 11, ayahNumber: 6, label: 'سورة هود (6)' }
    ]
  }
};

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

  // 0. فحص الاستفسارات والبحث الموضوعي (مثل "آيات الصلاة", "آيات الصبر")
  if (isThematicQuery(norm)) {
    for (const [key, topicData] of Object.entries(COMMON_TOPICS)) {
      if (norm.includes(key)) {
        const passages = topicData.passages.map(p => {
          const s = SURAHS.find(sur => sur.id === p.surahId);
          return s ? { surah: s, ayahNumber: p.ayahNumber, label: p.label } : null;
        }).filter(Boolean);

        if (passages.length > 0) {
          result.intent = 'PLAY_TOPIC';
          result.payload = {
            topic: topicData.topic,
            passages: passages,
            surah: passages[0].surah,
            ayahNumber: passages[0].ayahNumber,
            reciter: null
          };
          result.message = `تشغيل ${topicData.topic} من مواضع متفرقة في القرآن الكريم`;
          return result;
        }
      }
    }

    result.intent = 'THEMATIC_QUERY';
    result.payload = { query: rawTranscript };
    result.message = 'جاري البحث الموضوعي الذكي بالذكاء الاصطناعي...';
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
  if (norm.includes('ادمن') || norm.includes('admin') || norm.includes('لوحه الاداره') || norm.includes('صفحه الاداره') || norm.includes('لوحه التحكم') || norm.includes('صفحه التحكم') || norm.includes('لوحه المشرف') || norm.includes('صفحه المشرف') || norm.includes('افتح الاداره') || norm.includes('افتح التحكم') || norm.includes('الاداره') || norm === 'اداره') {
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

  // فحص أسماء السور ومرادفاتها بالمطابقة الدقيقة للكلمة لتفادي تشابه الحروف
  for (const surah of SURAHS) {
    const normSurahName = normalizeArabic(surah.name);
    if (matchesSurahWord(norm, normSurahName)) {
      matchedSurah = surah;
      break;
    }
    // فحص المرادفات والأسماء المشهورة
    if (surah.aliases) {
      for (const alias of surah.aliases) {
        const normAlias = normalizeArabic(alias);
        if (matchesSurahWord(norm, normAlias)) {
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
