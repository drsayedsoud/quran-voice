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

  // 1. المطابقة الدقيقة إذا كان النص بالكامل هو اسم السورة أو مرادفها
  if (normText === normCandidate) return true;

  // 2. مطابقة حدود الكلمات والعبارات المركبة (Phrase / Word Boundary Matching)
  // يضمن دعم السور المركبة بدون كلمة سورة مثل: "شغل ال عمران" أو "اقرا قل هو الله احد"
  const paddedText = ` ${normText} `;
  const paddedCandidate = ` ${normCandidate} `;
  if (paddedText.includes(paddedCandidate)) return true;

  // 3. فحص ما بعد كلمة "سورة" أو "صورة"
  const words = normText.split(/\s+/);
  const surahIdx = words.findIndex(w => w === 'سوره' || w === 'سورة');
  if (surahIdx !== -1 && surahIdx < words.length - 1) {
    const afterSurah = words.slice(surahIdx + 1).join(' ');
    if (afterSurah === normCandidate || afterSurah.startsWith(normCandidate + ' ')) {
      return true;
    }
  }

  // 4. مطابقة الكلمة المفردة مع أو بدون "ال" التعريف (مثال: "كهف" و "الكهف")
  if (!normCandidate.includes(' ') && normCandidate.length >= 3) {
    const withAl = normCandidate.startsWith('ال') ? normCandidate : 'ال' + normCandidate;
    const withoutAl = normCandidate.startsWith('ال') ? normCandidate.slice(2) : normCandidate;
    
    if (paddedText.includes(` ${withAl} `) || (withoutAl.length >= 3 && paddedText.includes(` ${withoutAl} `))) {
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

  // إذا ذكر المستخدم كلمة "سورة"، فهو يطلب سورة محددة وليس بحثاً موضوعياً
  if (norm.includes('سوره') || norm.includes('سورة')) {
    return false;
  }

  const thematicKeywords = ['ايات', 'موضوع', 'قصة', 'احاديث', 'فضل', 'تحدث عن', 'عايز ايات', 'هات ايات'];
  if (thematicKeywords.some(kw => norm.includes(kw))) {
    return true;
  }

  // كلمة "عن" يجب أن تكون منفصلة بمسافات لتفادي الكلمات التي تحتوي عليها كـ "العنكبوت"
  const padded = ` ${norm} `;
  if (padded.includes(' عن ') || norm.startsWith('عن ')) {
    return true;
  }

  return false;
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

  // 3. فحص أوامر التحكم العاجلة (إيقاف وتوقف التلاوة)
  // لا نعتبره إيقافاً عاماً إذا كان أمراً مستهدفاً لإيقاف وضع محدد (كإيقاف التكرار أو القيادة أو التوفير)
  const isTargetedStop = norm.includes('تكرار') || norm.includes('تحفيظ') || norm.includes('قياده') || norm.includes('سواقه') || norm.includes('سياره') || norm.includes('سفر') || norm.includes('توفير') || norm.includes('المصحف') || norm.includes('الشاشه');
  if (!isTargetedStop && (norm.match(/^(توقف|وقف|ايقاف|اسكت|اصمت|لحظه|استني|استنى|pause|stop)/) || norm.includes('توقف') || norm.includes('وقف القراءه') || norm.includes('ايقاف مؤقت') || norm === 'كفايه')) {
    result.intent = 'PAUSE';
    result.message = 'تم إيقاف التلاوة وحفظ الموضع';
    return result;
  }

  // 4. طلب التفسير أو شرح المعنى أو معنى كلمة معينة (معالجة سريعة فورية)
  // استثناء سورة الشرح (سورة 94) وسورة ألم نشرح حتى لا يظن أنها طلب شرح تفسير
  const isSharhSurah = norm.includes('سوره الشرح') || norm.includes('سورة الشرح') || norm.includes('الم نشرح') || norm.includes('الشرح');
  if (!isSharhSurah && (norm.includes('تفسير') || norm.includes('فسر') || norm.includes('معنى') || norm.includes('معني') || norm.includes('اشرح') || (norm.includes('شرح') && !norm.includes('سوره') && !norm.includes('سورة')))) {
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
  if (norm.includes('الغاء التكرار') || norm.includes('وقف التكرار') || norm.includes('بطل تكرار') || norm.includes('بدون تكرار') || norm.includes('كمل عادي') || norm.includes('الغي التكرار') || norm.includes('وقف التحفيظ') || norm.includes('الغاء التحفيظ')) {
    result.intent = 'CANCEL_REPEAT';
    result.message = 'تم إلغاء وضع التكرار ومتابعة التلاوة الطبيعية';
    return result;
  }

  // تتبع الورد والحفظ التراكمي (Streak & Audio Journal)
  if (norm.includes('انجازاتي') || norm.includes('إنجازاتي') || norm.includes('وردي') || norm.includes('احصائياتي') || norm.includes('إحصائياتي') || norm.includes('تتبع الحفظ') || norm.includes('تقرير الحفظ') || norm.includes('سجل الحفظ') || norm.includes('الورد اليومي') || norm.includes('كام ايه سمعت') || norm.includes('كم ايه سمعت') || norm.includes('كم حفظت') || norm.includes('كام حفظت')) {
    result.intent = 'JOURNAL_STATS';
    result.message = 'عرض وقراءة سجل الورد والحفظ التراكمي';
    return result;
  }

  // أ. وضع القيادة والسفر الذكي (Car & Travel Mode)
  const isCarModeContext = norm.includes('القياده') || norm.includes('قياده') || norm.includes('السفر') || norm.includes('سفر') || norm.includes('العربيه') || norm.includes('عربيه') || norm.includes('السياره') || norm.includes('سياره') || norm.includes('السواقه') || norm.includes('سواقه');
  const isExitCommand = norm.includes('خروج') || norm.includes('اخرج') || norm.includes('ايقاف') || norm.includes('وقف') || norm.includes('الغا') || norm.includes('الغي') || norm.includes('تعطيل') || norm.includes('عطل') || norm.includes('اقفل') || norm.includes('قفل') || norm.includes('انها');

  if (isCarModeContext && (norm.includes('وضع') || norm.includes('نمط') || isExitCommand || norm.includes('شغل') || norm.includes('تفعيل') || norm.includes('بدء') || norm.startsWith('قياده') || norm.startsWith('سواقه') || norm.startsWith('السواقه') || norm === 'سواقه' || norm === 'القياده')) {
    if (isExitCommand) {
      result.intent = 'DISABLE_CAR_MODE';
      result.message = 'تم الخروج من وضع القيادة والسفر';
    } else {
      result.intent = 'ENABLE_CAR_MODE';
      result.message = 'تفعيل وضع القيادة والسفر الذكي';
    }
    return result;
  }

  // ب. أوامر إظهار وإخفاء نص الآية والمصحف الشريف (Show / Hide Quran & Audio-Only Mode)
  if (
    norm.includes('اظهار') || norm.includes('اظهر') || norm.includes('عرض المصحف') || norm.includes('افتح المصحف') || norm.includes('بين المصحف') ||
    norm.includes('عرض الايه') || norm.includes('شغل المصحف') || norm.includes('شغل الشاشه') || norm.includes('شغل عرض الايه')
  ) {
    result.intent = 'SHOW_AYAH';
    result.message = 'إظهار نص الآية والمصحف الشريف';
    return result;
  }

  if (
    norm.includes('اخفا') || norm.includes('اخفي') || norm.includes('قفل المصحف') || norm.includes('اقفل المصحف') ||
    norm.includes('صوت فقط') || norm.includes('وضع الصوت فقط') || norm.includes('استماع فقط') || norm.includes('وضع الاستماع') ||
    norm.includes('سماع فقط') || norm.includes('بدون شاشه') || norm.includes('بدون نص')
  ) {
    result.intent = 'HIDE_AYAH';
    result.message = 'تفعيل وضع الاستماع والصوت فقط بدون نص';
    return result;
  }

  if (norm.includes('تبديل المصحف') || norm.includes('تبديل عرض الايه') || norm.includes('تبديل الشاشه')) {
    result.intent = 'TOGGLE_AYAH_DISPLAY';
    result.message = 'تبديل عرض المصحف الشريف';
    return result;
  }

  // ج. أوامر وضع توفير البيانات واستهلاك باقة الإنترنت (Data Saver & Usage)
  const isDataTarget = norm.includes('البيانات') || norm.includes('بيانات') || norm.includes('الباقه') || norm.includes('باقه') || norm.includes('النت') || norm.includes('نت');

  if (isDataTarget && (norm.includes('استهلاك') || norm.includes('كام استهلكت') || norm.includes('كم استهلكت') || norm.includes('كام ميجا') || norm.includes('كم ميجا') || norm.includes('تقرير النت') || norm.includes('حجم الاستهلاك') || norm.includes('باقه النت'))) {
    result.intent = 'DATA_STATS';
    result.message = 'عرض وتحديث تفاصيل استهلاك الباقة';
    return result;
  }

  if (norm.includes('توفير') || norm.includes('التوفير') || norm.includes('وفر')) {
    if (isExitCommand) {
      result.intent = 'DISABLE_SAVER_MODE';
      result.message = 'تم إيقاف وضع توفير البيانات';
      return result;
    } else if (isDataTarget || norm.includes('وضع التوفير') || norm.includes('شغل التوفير') || norm.includes('نمط التوفير') || norm.includes('تفعيل التوفير')) {
      result.intent = 'ENABLE_SAVER_MODE';
      result.message = 'تم تشغيل وضع توفير البيانات';
      return result;
    }
  }

  // إكمال الآية وسماع التكملة في اختبار الذاكرة
  if (norm.includes('التكمله') || norm.includes('التكملة') || norm.includes('سمعني الباقي') || norm.includes('سمعني التكمله') || norm.includes('كمل الايه') || norm.includes('اكمل الايه') || norm.includes('صح كده') || norm === 'التكمله') {
    result.intent = 'REVEAL_MEMORY_TEST';
    result.message = 'إكمال الآية للتحقق من صحة الحفظ';
    return result;
  }

  // اختبار الذاكرة واسترجاع الحفظ (Blind Memory Prompt)
  if (norm.includes('سمعلي') || norm.includes('سمع لي') || norm.includes('اختبرني') || norm.includes('اختبر حفظي') || norm.includes('امتحني') || norm.includes('سؤال حفظ') || norm.includes('تسميع')) {
    let testSurah = null;
    for (const surah of SURAHS) {
      if (matchesSurahWord(norm, normalizeArabic(surah.name))) {
        testSurah = surah;
        break;
      }
    }
    result.intent = 'MEMORY_TEST';
    result.payload = {
      surah: testSurah,
      reciter: matchedReciter
    };
    result.message = testSurah ? `بدء اختبار الذاكرة في سورة ${testSurah.name}` : 'بدء اختبار الذاكرة للآية الحالية';
    return result;
  }

  // وضع المصحف المعلم التفاعلي والتحفيظ (Listen & Repeat Mode)
  // أوامر مثل: "حفظني سورة البقرة" أو "حفظني من 1 الى 5 من سورة الكهف" أو "نظام التحفيظ" أو "عاوز احفظ سورة يس" أو "اسمع واردد"
  const isInteractiveMemorization = (
    norm.includes('حفظني') ||
    norm.includes('عاوز احفظ') ||
    norm.includes('عايز احفظ') ||
    norm.includes('اريد حفظ') ||
    norm.includes('نظام التحفيظ') ||
    norm.includes('وضع التحفيظ') ||
    norm.includes('وضع الحفظ') ||
    norm.includes('اسمع واردد') ||
    norm.includes('استمع واردد') ||
    norm.includes('ردد ورايا') ||
    norm.includes('ردد خلفي') ||
    norm.includes('ترديد تفاعلي') ||
    norm.includes('المعلم التفاعلي')
  );

  if (isInteractiveMemorization) {
    let targetSurah = null;
    for (const surah of SURAHS) {
      if (matchesSurahWord(norm, normalizeArabic(surah.name))) {
        targetSurah = surah;
        break;
      }
    }

    // فحص إذا كان هناك نطاق من آية كذا لآية كذا
    const rangeMatch = norm.match(/(?:من\s+(?:ايه\s+)?)(\d+|[^\s]+)\s+(?:الي|إلى|لـ|ل|حتي|حتى)\s+(?:(?:ايه\s+)?)(\d+|[^\s]+)/);
    let fromAyah = 1;
    let toAyah = targetSurah ? targetSurah.ayahs : 1;

    if (rangeMatch) {
      let fromA = extractNumber(rangeMatch[1]);
      let toA = extractNumber(rangeMatch[2]);
      if (fromA && toA) {
        if (fromA > toA) { const tmp = fromA; fromA = toA; toA = tmp; }
        if (targetSurah) {
          fromA = Math.max(1, Math.min(fromA, targetSurah.ayahs));
          toA = Math.max(1, Math.min(toA, targetSurah.ayahs));
        }
        fromAyah = fromA;
        toAyah = toA;
      }
    }

    result.intent = 'LISTEN_AND_REPEAT';
    result.payload = {
      surah: targetSurah,
      fromAyah: fromAyah,
      toAyah: toAyah,
      reciter: matchedReciter,
      multiplier: 1.0 // مدة سكون تعادل مدة تلاوة الآية بالضبط لترديد المستخدم
    };

    const surahText = targetSurah ? `سورة ${targetSurah.name}` : 'الموضع الحالي';
    const rangeText = rangeMatch ? ` (من الآية ${fromAyah} إلى ${toAyah})` : '';
    result.message = `تفعيل وضع المصحف المعلم التفاعلي: ${surahText}${rangeText} - استمع وردد خلف الشيخ`;
    return result;
  }

  if (norm.includes('كرر') || norm.includes('عيد') || norm.includes('تكرار') || norm.includes('مره تانيه') || norm.includes('مرتين')) {
    let times = 3;
    if (norm.includes('مرتين') || norm.includes('مرتان')) {
      times = 2;
    } else {
      // فحص عدد المرات بدقة (مثلاً: "7 مرات" أو "كررهم 5 مرات" أو "عيدها 4")
      const timesByWord = norm.match(/(\d+|[^\s]+)\s*(?:مرات|مره)/);
      if (timesByWord && timesByWord[1]) {
        const num = extractNumber(timesByWord[1]);
        if (num) times = num;
      } else {
        const afterCmd = norm.match(/(?:كررهم|عيدهم|كررها|عيدها|تكرار|كرر|عيد)\s*(?:بقى|يا سيدي)?\s*(\d+|[^\s]+)/);
        if (afterCmd && afterCmd[1]) {
          const num = extractNumber(afterCmd[1]);
          if (num) times = num;
        } else {
          const generalNum = extractNumber(norm);
          if (generalNum) times = generalNum;
        }
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
