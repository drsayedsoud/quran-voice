/**
 * محرك تحليل الأوامر الصوتية باللغة العربية
 * مصمم لفهم اللهجات والتحدث التلقائي لفاقدي البصر وكبار السن
 */

import { SURAHS, RECITERS } from './quran-data.js';
import { findStoryByQuery, compileStoryPlaylist } from './quran-stories.js';

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

export function matchesSurahWord(normText, normCandidate) {
  if (!normText || !normCandidate) return false;
  
  const words = normText.split(/\s+/);
  if (words.includes(normCandidate)) return true;

  const surahIdx = words.findIndex(w => w === 'سوره' || w === 'سورة');
  if (surahIdx !== -1 && surahIdx < words.length - 1) {
    const afterSurah = words.slice(surahIdx + 1).join(' ');
    if (afterSurah === normCandidate || afterSurah.startsWith(normCandidate + ' ')) {
      return true;
    }
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
  'مرتين': 2, 'مرتان': 2,
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

  // 1. فحص طلب تغيير القارئ المذكور في الجملة (مطابقة الأطول والأكثر دقة لمنع تداخل المعلم مع المرتل والمجود)
  let matchedReciter = null;
  let bestMatchLength = 0;
  for (const reciter of RECITERS) {
    for (const alias of reciter.aliases) {
      const normAlias = normalizeArabic(alias);
      if (normAlias.length > 1 && norm.includes(normAlias)) {
        if (normAlias.length > bestMatchLength) {
          bestMatchLength = normAlias.length;
          matchedReciter = reciter;
        }
      }
    }
  }

  // 2. فحص قصص الأنبياء وقصص القرآن الكريم مرتبة حسب التسلسل الزمني (المسار اللحظي 0ms)
  const matchedStory = findStoryByQuery(norm);
  if (matchedStory) {
    const playlist = compileStoryPlaylist(matchedStory);
    if (playlist.length > 0) {
      result.intent = 'PLAY_STORY';
      result.payload = {
        story: matchedStory,
        passages: playlist,
        surah: playlist[0].surah,
        ayahNumber: playlist[0].ayahNumber,
        reciter: matchedReciter
      };
      result.message = `بدء تلاوة ${matchedStory.name} مرتبة حسب التسلسل الزمني للأحداث`;
      return result;
    }
  }

  // 3. فحص أوامر التحكم العاجلة (إيقاف وتوقف)
  // إيقاف مؤقت / توقف مع حفظ موضع التلاوة
  if (norm.match(/^(توقف|وقف|ايقاف|اسكت|اصمت|لحظه|استني|استنى|pause|stop)/) || norm.includes('توقف') || norm.includes('وقف القراءه') || norm.includes('ايقاف مؤقت') || norm === 'كفايه') {
    result.intent = 'PAUSE';
    result.message = 'تم إيقاف التلاوة وحفظ الموضع';
    return result;
  }

  // 4. طلب التفسير أو شرح المعنى أو معنى كلمة معينة (معالجة سريعة فورية)
  if (norm.includes('تفسير') || norm.includes('فسر') || norm.includes('معنى') || norm.includes('معني') || norm.includes('اشرح') || norm.includes('شرح')) {
    result.intent = 'TAFSIR';
    // استخراج الكلمة أو العبارة المراد معرفة معناها أو تفسيرها إن وجدت
    let term = rawTranscript
      .replace(/^(ما\s+)?(معنى|معني|تفسير|شرح|اشرح|فسر|وضح)\s*(لي|لنا|هذه|هذي|الآية|الايه|الكلمة|الكلمه|قوله|عن)?\s*/i, '')
      .trim();
    result.payload = { term: term };
    result.message = 'قراءة التفسير الميسر للآية';
    return result;
  }

  // 5. استئناف أو متابعة
  if (norm.match(/^(كمل|تابع|استمر|واصل|شغل تاني|استئناف|resume|play)/)) {
    result.intent = 'RESUME';
    result.message = 'متابعة التلاوة';
    return result;
  }

  // 6. الآية التالية
  if (norm.includes('التاليه') || norm.includes('اللي بعدها') || norm.includes('الايه الجايه') || norm.includes('قدم ايه') || norm.includes('تخطي')) {
    result.intent = 'NEXT_AYAH';
    result.message = 'الانتقال للآية التالية';
    return result;
  }

  // 7. الآية السابقة
  if (norm.includes('السابقه') || norm.includes('اللي قبلها') || norm.includes('رجع ايه') || norm.includes('ارجع ورا')) {
    result.intent = 'PREV_AYAH';
    result.message = 'العودة للآية السابقة';
    return result;
  }

  // 8. أوامر التكرار والحفظ وإلغاء التكرار
  if (norm.includes('الغاء التكرار') || norm.includes('وقف التكرار') || norm.includes('بطل تكرار') || norm.includes('بدون تكرار') || norm.includes('كمل عادي') || norm.includes('الغي التكرار')) {
    result.intent = 'CANCEL_REPEAT';
    result.message = 'تم إلغاء وضع التكرار ومتابعة التلاوة الطبيعية';
    return result;
  }

  if (norm.includes('كرر') || norm.includes('عيد') || norm.includes('تكرار') || norm.includes('مره تانيه') || norm.includes('مرتين')) {
    let times = 3;
    if (norm.includes('مرتين') || norm.includes('مرتان')) {
      times = 2;
    } else {
      const timesMatch = norm.match(/(?:كرر|عيد|تكرار|كررهم|عيدهم)\s*(?:بقى|يا سيدي)?\s*(\d+|[^\s]+)?\s*(?:مرات|مره)?/) ||
                         norm.match(/(\d+)\s*(?:مرات|مره)/);
      if (timesMatch && timesMatch[1]) {
        const parsedT = extractNumber(timesMatch[1]);
        if (parsedT) times = parsedT;
      } else {
        const generalNum = extractNumber(norm);
        if (generalNum) times = generalNum;
      }
    }

    // فحص هل يوجد سورة مذكورة
    let matchedSurahForRepeat = null;
    for (const surah of SURAHS) {
      const normName = normalizeArabic(surah.name);
      if (matchesSurahWord(norm, normName)) {
        matchedSurahForRepeat = surah;
        break;
      }
    }

    // فحص هل يوجد نطاق آيات (من آية X إلى آية Y)
    const rangeMatch = norm.match(/من\s*(?:ايه|الايه|الآية|الاية)?\s*(\d+|[^\s]+)\s*(?:الي|إلى|لـ|ل|للايه|للآية|حتى|حتي|لغاية)\s*(?:ايه|الايه|الآية|الاية)?\s*(\d+|[^\s]+)/);
    
    if (rangeMatch) {
      let fromA = extractNumber(rangeMatch[1]) || 1;
      let toA = extractNumber(rangeMatch[2]) || fromA;
      if (fromA > toA) { const tmp = fromA; fromA = toA; toA = tmp; }
      if (matchedSurahForRepeat) {
        fromA = Math.max(1, Math.min(fromA, matchedSurahForRepeat.ayahs));
        toA = Math.max(1, Math.min(toA, matchedSurahForRepeat.ayahs));
      }

      result.intent = 'REPEAT_MODE';
      result.payload = {
        repeatType: 'RANGE',
        surah: matchedSurahForRepeat,
        fromAyah: fromA,
        toAyah: toA,
        times: times,
        reciter: matchedReciter
      };
      const surahNamePart = matchedSurahForRepeat ? `سورة ${matchedSurahForRepeat.name} ` : '';
      result.message = `تكرار ${surahNamePart}من الآية ${fromA} إلى الآية ${toA} (${times} مرات)`;
      return result;
    }

    // فحص تكرار سورة كاملة
    if (matchedSurahForRepeat && (norm.includes('سوره') || !norm.includes('ايه'))) {
      result.intent = 'REPEAT_MODE';
      result.payload = {
        repeatType: 'SURAH',
        surah: matchedSurahForRepeat,
        fromAyah: 1,
        toAyah: matchedSurahForRepeat.ayahs,
        times: times,
        reciter: matchedReciter
      };
      result.message = `تكرار سورة ${matchedSurahForRepeat.name} كاملة (${times} مرات)`;
      return result;
    }

    // تكرار الآية الحالية
    result.intent = 'REPEAT_MODE';
    result.payload = {
      repeatType: 'CURRENT_AYAH',
      times: times,
      reciter: matchedReciter
    };
    result.message = `تكرار الآية الحالية (${times} مرات)`;
    return result;
  }

  // 9. أين أنا / معرفة الموضع الحالي
  if (norm.includes('فين انا') || norm.includes('اين انا') || norm.includes('ما هي السوره') || norm.includes('رقم الايه') || norm.includes('انا فين')) {
    result.intent = 'STATUS_CHECK';
    result.message = 'الاستعلام عن موضع التلاوة الحالي';
    return result;
  }

  // 10. فحص الاستفسارات والبحث الموضوعي (مثل "آيات الصلاة", "آيات الصبر")
  if (isThematicQuery(norm)) {
    for (const [key, topicData] of Object.entries(COMMON_TOPICS)) {
      if (norm.includes(key)) {
        const passages = topicData.passages.map(p => {
          const s = SURAHS.find(sur => sur.id === p.surahId);
          return s ? { surah: s, ayahNumber: p.ayahNumber, label: p.label, isJump: true } : null;
        }).filter(Boolean);

        if (passages.length > 0) {
          result.intent = 'PLAY_TOPIC';
          result.payload = {
            topic: topicData.topic,
            passages: passages,
            surah: passages[0].surah,
            ayahNumber: passages[0].ayahNumber,
            reciter: matchedReciter
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

  // أوامر ضبط مستوى الصوت للمكفوفين
  if (norm.includes('اعلي صوت') || norm.includes('اقصي صوت') || norm.includes('الصوت كامل') || norm.includes('صوت ميه') || norm.includes('صوت 100')) {
    result.intent = 'VOLUME_MAX';
    result.message = 'رفع الصوت لأقصى درجة';
    return result;
  }
  if (norm.includes('ارفع الصوت') || norm.includes('علي الصوت') || norm.includes('رفع الصوت') || norm.includes('صوت عالي') || norm.includes('اعلي الصوت') || norm.includes('زود الصوت') || norm.includes('زياده الصوت') || norm === 'اعلي' || norm === 'ارفع') {
    result.intent = 'VOLUME_UP';
    result.message = 'رفع مستوى الصوت';
    return result;
  }
  if (norm.includes('وطي الصوت') || norm.includes('خفض الصوت') || norm.includes('اخفض الصوت') || norm.includes('صوت واطي') || norm.includes('صوت هادي') || norm.includes('نقص الصوت') || norm.includes('قلل الصوت') || norm === 'اوطي' || norm === 'اخفض') {
    result.intent = 'VOLUME_DOWN';
    result.message = 'خفض مستوى الصوت';
    return result;
  }
  if (norm.includes('اكتم الصوت') || norm.includes('كتم الصوت') || norm.includes('صامت') || norm === 'كتم') {
    result.intent = 'VOLUME_MUTE';
    result.message = 'كتم الصوت';
    return result;
  }

  // فتح صفحة الإدارة ولوحة التحكم
  if (norm.includes('ادمن') || norm.includes('admin') || norm.includes('لوحه الاداره') || norm.includes('صفحه الاداره') || norm.includes('لوحه التحكم') || norm.includes('صفحه التحكم') || norm.includes('لوحه المشرف') || norm.includes('صفحه المشرف') || norm.includes('افتح الاداره') || norm.includes('افتح التحكم') || norm.includes('الاداره') || norm === 'اداره') {
    result.intent = 'OPEN_ADMIN';
    result.message = 'جاري فتح لوحة تحكم المشرف';
    return result;
  }

  // تغيير القارئ أو التبديل إلى وضع المصحف المعلم للأطفال أو المجود
  if (matchedReciter && (
    norm.startsWith('بصوت') ||
    norm.includes('غير القارئ') ||
    norm.includes('حول صوت') ||
    norm.includes('المصحف المعلم') ||
    norm.includes('مصحف المعلم') ||
    norm.includes('وضع المعلم') ||
    norm.includes('حفظلي ابني') ||
    norm.includes('حفظ الطفل') ||
    norm.includes('تحفيظ') ||
    norm.includes('ترديد') ||
    norm.includes('المعلم') ||
    norm.includes('مجود') ||
    norm.includes('المجود')
  )) {
    let hasSurahMentioned = false;
    for (const surah of SURAHS) {
      if (matchesSurahWord(norm, normalizeArabic(surah.name))) {
        hasSurahMentioned = true;
        break;
      }
    }
    if (!hasSurahMentioned) {
      result.intent = 'SET_RECITER';
      result.payload = { reciter: matchedReciter };
      result.message = matchedReciter.id.includes('muallim')
        ? `تم التبديل إلى ${matchedReciter.name} مع ترديد الأطفال`
        : (matchedReciter.id.includes('mujawwad')
            ? `تم التبديل إلى ${matchedReciter.name}`
            : `تم تغيير القارئ إلى الشيخ ${matchedReciter.name}`);
      return result;
    }
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

  // إذا لم نجد سورة ولكن ذكر القارئ أو نمط المعلم فقط
  if (matchedReciter) {
    result.intent = 'SET_RECITER';
    result.payload = { reciter: matchedReciter };
    result.message = matchedReciter.id.includes('muallim')
      ? `تم التبديل إلى ${matchedReciter.name} مع ترديد الأطفال`
      : (matchedReciter.id.includes('mujawwad')
          ? `تم التبديل إلى ${matchedReciter.name}`
          : `تم اختيار الشيخ ${matchedReciter.name}`);
    return result;
  }

  return result;
}
