/**
 * محرك تحليل الأوامر الصوتية باللغة العربية
 * مصمم لفهم اللهجات والتحدث التلقائي لفاقدي البصر وكبار السن
 */

import { SURAHS, RECITERS, JUZ_DATA } from './quran-data.js';
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
  // تصحيح كتابة جزء
  cleaned = cleaned.replace(/\b(جزأ|جزءا)\b/g, 'جزء');
  // تصحيح مؤقت
  cleaned = cleaned.replace(/\b(موقت|مئقت)\b/g, 'مؤقت');
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
    if (norm.includes('سوره') || norm.includes('ايه') || norm.includes('جزء') || norm.includes('القران') || norm.includes('تفسير') || norm.includes('ايات') || norm.includes('موقت') || norm.includes('مؤقت')) {
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

  // إذا ذكر المستخدم كلمة "سورة" أو "جزء"، فهو طلب مباشر وليس بحثاً موضوعياً
  if (norm.includes('سوره') || norm.includes('سورة') || norm.includes('جزء') || norm.includes('الجزء') || norm.includes('جزا') || norm.includes('الجزا')) {
    return false;
  }

  const thematicKeywords = ['ايات', 'موضوع', 'قصة', 'قصه', 'احاديث', 'فضل', 'تحدث عن', 'عايز ايات', 'هات ايات', 'رقيه', 'شفا', 'سكين'];
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

// باقات مدمجة لأشهر الموضوعات والآيات القرآنية للعمل اللحظي الفوري بدون انتظار الشبكة (0ms)
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
    topic: 'آيات الصبر والاحتساب',
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
  },
  'رقيه': {
    topic: 'آيات الرقية الشرعية المباركة',
    passages: [
      { surahId: 1, ayahNumber: 1, label: 'سورة الفاتحة' },
      { surahId: 2, ayahNumber: 255, label: 'آية الكرسي' },
      { surahId: 2, ayahNumber: 284, label: 'أواخر سورة البقرة' },
      { surahId: 112, ayahNumber: 1, label: 'سورة الإخلاص' },
      { surahId: 113, ayahNumber: 1, label: 'سورة الفلق' },
      { surahId: 114, ayahNumber: 1, label: 'سورة الناس' }
    ]
  },
  'شفا': {
    topic: 'آيات الشفاء الست',
    passages: [
      { surahId: 9, ayahNumber: 14, label: 'سورة التوبة (14)' },
      { surahId: 10, ayahNumber: 57, label: 'سورة يونس (57)' },
      { surahId: 16, ayahNumber: 69, label: 'سورة النحل (69)' },
      { surahId: 17, ayahNumber: 82, label: 'سورة الإسراء (82)' },
      { surahId: 26, ayahNumber: 80, label: 'سورة الشعراء (80)' },
      { surahId: 41, ayahNumber: 44, label: 'سورة فصلت (44)' }
    ]
  },
  'سكين': {
    topic: 'آيات السكينة والطمأنينة وتفريج الكرب',
    passages: [
      { surahId: 2, ayahNumber: 248, label: 'سورة البقرة (248)' },
      { surahId: 9, ayahNumber: 26, label: 'سورة التوبة (26)' },
      { surahId: 9, ayahNumber: 40, label: 'سورة التوبة (40)' },
      { surahId: 48, ayahNumber: 4, label: 'سورة الفتح (4)' },
      { surahId: 48, ayahNumber: 18, label: 'سورة الفتح (18)' },
      { surahId: 94, ayahNumber: 1, label: 'سورة الشرح (1)' }
    ]
  }
};

// الآيات والمقاطع القرآنية الشهيرة المستقلة
export const FAMOUS_AYAHS = [
  {
    keys: ['اية الكرسي', 'ايه الكرسي', 'الكرسي'],
    surahId: 2,
    ayahNumber: 255,
    name: 'آية الكرسي'
  },
  {
    keys: ['خواتيم البقرة', 'خواتيم البقره', 'اواخر البقرة', 'اواخر البقره', 'اخر البقرة', 'اخر البقره', 'امن الرسول'],
    surahId: 2,
    ayahNumber: 284,
    name: 'أواخر سورة البقرة'
  },
  {
    keys: ['اوائل البقرة', 'اوائل البقره', 'اول البقرة', 'اول البقره', 'بداية البقرة', 'بداية البقره'],
    surahId: 2,
    ayahNumber: 1,
    name: 'أوائل سورة البقرة'
  },
  {
    keys: ['اية الدين', 'ايه الدين', 'اطول اية', 'اطول ايه'],
    surahId: 2,
    ayahNumber: 282,
    name: 'آية الدَّيْن'
  },
  {
    keys: ['اية النور', 'ايه النور'],
    surahId: 24,
    ayahNumber: 35,
    name: 'آية النور'
  },
  {
    keys: ['اية الملك', 'ايه الملك'],
    surahId: 3,
    ayahNumber: 26,
    name: 'آية الملك'
  },
  {
    keys: ['اية البر', 'ايه البر'],
    surahId: 2,
    ayahNumber: 177,
    name: 'آية البر'
  },
  {
    keys: ['اية الوضوء', 'ايه الوضوء'],
    surahId: 5,
    ayahNumber: 6,
    name: 'آية الوضوء'
  },
  {
    keys: ['اية الصيام', 'ايه الصيام'],
    surahId: 2,
    ayahNumber: 183,
    name: 'آية الصيام'
  },
  {
    keys: ['اية السيف', 'ايه السيف'],
    surahId: 9,
    ayahNumber: 5,
    name: 'آية السيف'
  }
];

// مطالع وبدايات السور المشهورة التي ينطقها المستخدم بدلاً من اسم السورة
export const FAMOUS_OPENINGS = [
  { keys: ['قل هو الله احد'], surahId: 112 },
  { keys: ['قل اعوذ برب الفلق'], surahId: 113 },
  { keys: ['قل اعوذ برب الناس'], surahId: 114 },
  { keys: ['قل يا ايها الكافرون'], surahId: 109 },
  { keys: ['انا اعطيناك الكوثر'], surahId: 108 },
  { keys: ['تبارك الذي بيده الملك'], surahId: 67 },
  { keys: ['عم يتساءلون'], surahId: 78 },
  { keys: ['اذا جاء نصر الله والفتح'], surahId: 110 },
  { keys: ['تبت يدا ابي لهب'], surahId: 111 },
  { keys: ['الم تر كيف فعل ربك باصحاب الفيل', 'الم تر كيف فعل ربك'], surahId: 105 },
  { keys: ['لايلاف قريش', 'لا يلاف قريش'], surahId: 106 },
  { keys: ['ارايت الذي يكذب بالدين', 'ارايت الذي يكذب'], surahId: 107 },
  { keys: ['ويل لكل همزة لمزة', 'ويل لكل همزة'], surahId: 104 },
  { keys: ['والعصر ان الانسان لفي خسر', 'والعصر ان الانسان'], surahId: 103 },
  { keys: ['الهاكم التكاثر'], surahId: 102 },
  { keys: ['القارعة ما القارعة', 'القارعه ما القارعه'], surahId: 101 },
  { keys: ['والعاديات ضبحا'], surahId: 100 },
  { keys: ['اذا زلزلت الارض زلزالها', 'اذا زلزلت الارض'], surahId: 99 },
  { keys: ['لم يكن الذين كفروا من اهل الكتاب', 'لم يكن الذين كفروا'], surahId: 98 },
  { keys: ['انا انزلناه في ليلة القدر'], surahId: 97 },
  { keys: ['اقرا باسم ربك الذي خلق', 'اقرا باسم ربك'], surahId: 96 },
  { keys: ['والتين والزيتون'], surahId: 95 },
  { keys: ['الم نشرح لك صدرك'], surahId: 94 },
  { keys: ['والضحى والليل اذا سجى', 'والضحى والليل'], surahId: 93 },
  { keys: ['والليل اذا يغشى'], surahId: 92 },
  { keys: ['والشمس وضحاها'], surahId: 91 },
  { keys: ['لا اقسم بهذا البلد'], surahId: 90 },
  { keys: ['والفجر وليال عشر'], surahId: 89 },
  { keys: ['هل اتاك حديث الغاشية', 'هل اتاك حديث الغاشيه'], surahId: 88 },
  { keys: ['سبح اسم ربك الاعلى'], surahId: 87 },
  { keys: ['والسماء والطارق'], surahId: 86 },
  { keys: ['والسماء ذات البروج'], surahId: 85 },
  { keys: ['اذا السماء انشقت'], surahId: 84 },
  { keys: ['ويل للمطففين'], surahId: 83 },
  { keys: ['اذا السماء انفطرت'], surahId: 82 },
  { keys: ['اذا الشمس كورت'], surahId: 81 },
  { keys: ['عبس وتولى'], surahId: 80 },
  { keys: ['والنازعات غرقا'], surahId: 79 },
  { keys: ['يس والقران الحكيم'], surahId: 36 },
  { keys: ['طه ما انزلنا عليك القران لتشقى', 'طه ما انزلنا عليك القران'], surahId: 20 },
  { keys: ['الحمد لله رب العالمين'], surahId: 1 }
];

// تحويل واستخراج الأرقام المنطوقة والمكتوبة (بما فيها الأعداد المركبة والمعطوفة)
export function extractNumber(text) {
  if (!text) return null;
  // 1. فحص الأرقام المكتوبة كأرقام أولاً (1, 2, 255...)
  const digitMatch = text.match(/\b\d+(\.\d+)?\b/);
  if (digitMatch) {
    return parseFloat(digitMatch[0]);
  }

  const norm = normalizeArabic(text);

  // 2. الكلمات الكسرية الخاصة
  if (norm.includes('واحد وربع') || norm.includes('واحد و ربع')) return 1.25;
  if (norm.includes('واحد ونص') || norm.includes('واحد ونصف')) return 1.5;
  if (norm.includes('نص') || norm.includes('نصف')) return 0.5;
  if (norm.includes('ربع')) return 0.25;
  if (norm.includes('تلت') || norm.includes('ثلث')) return 0.33;

  // 3. تحليل الكلمات العربية للأعداد (المركبة والمعطوفة: مائتين وخمسة وخمسين)
  let total = 0;
  let matched = false;

  // المئات
  const hundreds = [
    { word: 'ثلاثمائة', val: 300 }, { word: 'تلاتمية', val: 300 },
    { word: 'مائتان', val: 200 }, { word: 'مئتان', val: 200 }, { word: 'ميتين', val: 200 },
    { word: 'مائة', val: 100 }, { word: 'مئة', val: 100 }, { word: 'مية', val: 100 }
  ];
  for (const h of hundreds) {
    if (norm.includes(h.word)) {
      total += h.val;
      matched = true;
      break;
    }
  }

  // العقود (العشرات)
  const tens = [
    { word: 'تسعين', val: 90 }, { word: 'تسعون', val: 90 },
    { word: 'ثمانين', val: 80 }, { word: 'ثمانون', val: 80 }, { word: 'تمانين', val: 80 },
    { word: 'سبعين', val: 70 }, { word: 'سبعون', val: 70 },
    { word: 'ستين', val: 60 }, { word: 'ستون', val: 60 },
    { word: 'خمسين', val: 50 }, { word: 'خمسون', val: 50 },
    { word: 'اربعين', val: 40 }, { word: 'اربعون', val: 40 },
    { word: 'ثلاثين', val: 30 }, { word: 'ثلاثون', val: 30 }, { word: 'تلاتين', val: 30 },
    { word: 'عشرين', val: 20 }, { word: 'عشرون', val: 20 }
  ];
  for (const t of tens) {
    if (norm.includes(t.word)) {
      total += t.val;
      matched = true;
      break;
    }
  }

  // الأعداد من 11 إلى 19
  const teens = [
    { word: 'تسعه عشر', val: 19 }, { word: 'تسع عشر', val: 19 },
    { word: 'ثمانيه عشر', val: 18 }, { word: 'تمانيه عشر', val: 18 }, { word: 'ثمان عشر', val: 18 },
    { word: 'سبعه عشر', val: 17 }, { word: 'سبع عشر', val: 17 },
    { word: 'سته عشر', val: 16 }, { word: 'ست عشر', val: 16 },
    { word: 'خمسه عشر', val: 15 }, { word: 'خمس عشر', val: 15 },
    { word: 'اربعه عشر', val: 14 }, { word: 'اربع عشر', val: 14 },
    { word: 'ثلاثه عشر', val: 13 }, { word: 'تلاته عشر', val: 13 }, { word: 'ثلاث عشر', val: 13 },
    { word: 'اثنا عشر', val: 12 }, { word: 'اثني عشر', val: 12 }, { word: 'اتناشر', val: 12 },
    { word: 'حادي عشر', val: 11 }, { word: 'احد عشر', val: 11 }, { word: 'حداشر', val: 11 }
  ];
  for (const tn of teens) {
    if (norm.includes(tn.word)) {
      total += tn.val;
      return total;
    }
  }

  // الآحاد والترتيبية
  const ones = [
    { word: 'عاشر', val: 10 }, { word: 'عشره', val: 10 }, { word: 'عشر', val: 10 },
    { word: 'تاسع', val: 9 }, { word: 'تسعه', val: 9 }, { word: 'تسع', val: 9 },
    { word: 'ثامن', val: 8 }, { word: 'ثمانيه', val: 8 }, { word: 'تمانيه', val: 8 }, { word: 'ثمان', val: 8 }, { word: 'تمان', val: 8 },
    { word: 'سابع', val: 7 }, { word: 'سبعه', val: 7 }, { word: 'سبع', val: 7 },
    { word: 'سادس', val: 6 }, { word: 'سته', val: 6 }, { word: 'ست', val: 6 },
    { word: 'خامس', val: 5 }, { word: 'خمسه', val: 5 }, { word: 'خمس', val: 5 },
    { word: 'رابع', val: 4 }, { word: 'اربعه', val: 4 }, { word: 'اربع', val: 4 },
    { word: 'ثالث', val: 3 }, { word: 'ثلاثه', val: 3 }, { word: 'تلاته', val: 3 }, { word: 'ثلاث', val: 3 }, { word: 'تلات', val: 3 },
    { word: 'تاني', val: 2 }, { word: 'ثاني', val: 2 }, { word: 'تانيه', val: 2 }, { word: 'ثانيه', val: 2 },
    { word: 'اثنين', val: 2 }, { word: 'اثنان', val: 2 }, { word: 'مرتين', val: 2 }, { word: 'مرتان', val: 2 },
    { word: 'اول', val: 1 }, { word: 'اولى', val: 1 }, { word: 'اولي', val: 1 }, { word: 'واحد', val: 1 }, { word: 'واحده', val: 1 },
    { word: 'صفر', val: 0 }
  ];
  for (const o of ones) {
    const padded = ` ${norm} `;
    if (padded.includes(` ${o.word} `) || norm.startsWith(o.word + ' ') || norm.endsWith(' ' + o.word) || norm === o.word) {
      total += o.val;
      matched = true;
      break;
    }
  }

  if (matched) return total;

  return null;
}

// استخراج ومطابقة أجزاء القرآن الـ 30 بدقة
export function extractJuz(norm) {
  if (!norm || !JUZ_DATA) return null;
  const hasJuzKeyword = norm.includes('جزء') || norm.includes('الجزء') || norm.includes('جزا') || norm.includes('الجزا') || norm.includes('اجزا') || norm.includes('اجزاء');

  // أسماء الأجزاء الشهيرة الشائعة
  if (norm.includes('جزء عم') || norm.includes('جزا عم') || (hasJuzKeyword && (norm.includes('عم') || norm.includes('عما')))) {
    return JUZ_DATA[29]; // الجزء 30
  }
  if (norm.includes('جزء تبارك') || norm.includes('جزا تبارك') || (hasJuzKeyword && norm.includes('تبارك'))) {
    return JUZ_DATA[28]; // الجزء 29
  }
  if (norm.includes('جزء قد سمع') || norm.includes('جزا قد سمع') || (hasJuzKeyword && norm.includes('قد سمع'))) {
    return JUZ_DATA[27]; // الجزء 28
  }

  if (hasJuzKeyword) {
    const ordinalJuz = [
      { text: 'الاول', num: 1 }, { text: 'الاولي', num: 1 },
      { text: 'الثاني', num: 2 }, { text: 'التاني', num: 2 },
      { text: 'الثالث', num: 3 }, { text: 'التالت', num: 3 },
      { text: 'الرابع', num: 4 },
      { text: 'الخامس', num: 5 },
      { text: 'السادس', num: 6 },
      { text: 'السابع', num: 7 },
      { text: 'الثامن', num: 8 }, { text: 'التامن', num: 8 },
      { text: 'التاسع', num: 9 },
      { text: 'العاشر', num: 10 },
      { text: 'الحادي عشر', num: 11 }, { text: 'حداشر', num: 11 },
      { text: 'الثاني عشر', num: 12 }, { text: 'اتناشر', num: 12 },
      { text: 'الثالث عشر', num: 13 },
      { text: 'الرابع عشر', num: 14 },
      { text: 'الخامس عشر', num: 15 },
      { text: 'السادس عشر', num: 16 },
      { text: 'السابع عشر', num: 17 },
      { text: 'الثامن عشر', num: 18 },
      { text: 'التاسع عشر', num: 19 },
      { text: 'العشرون', num: 20 }, { text: 'العشرين', num: 20 },
      { text: 'الحادي والعشرون', num: 21 }, { text: 'الحادي والعشرين', num: 21 },
      { text: 'الثاني والعشرون', num: 22 }, { text: 'الثاني والعشرين', num: 22 },
      { text: 'الثالث والعشرون', num: 23 }, { text: 'الثالث والعشرين', num: 23 },
      { text: 'الرابع والعشرون', num: 24 }, { text: 'الرابع والعشرين', num: 24 },
      { text: 'الخامس والعشرون', num: 25 }, { text: 'الخامس والعشرين', num: 25 },
      { text: 'السادس والعشرون', num: 26 }, { text: 'السادس والعشرين', num: 26 },
      { text: 'السابع والعشرون', num: 27 }, { text: 'السابع والعشرين', num: 27 },
      { text: 'الثامن والعشرون', num: 28 }, { text: 'الثامن والعشرين', num: 28 },
      { text: 'التاسع والعشرون', num: 29 }, { text: 'التاسع والعشرين', num: 29 },
      { text: 'الثلاثون', num: 30 }, { text: 'الثلاثين', num: 30 }
    ];

    for (const item of ordinalJuz) {
      if (norm.includes(item.text)) {
        return JUZ_DATA[item.num - 1];
      }
    }

    const num = extractNumber(norm);
    if (num && num >= 1 && num <= 30) {
      return JUZ_DATA[num - 1];
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
  // لا نعتبره إيقافاً عاماً إذا كان أمراً مستهدفاً لإيقاف وضع محدد (كإيقاف التكرار أو القيادة أو التوفير أو المؤقت)
  const isTargetedStop = norm.includes('تكرار') || norm.includes('تحفيظ') || norm.includes('قياده') || norm.includes('سواقه') || norm.includes('سياره') || norm.includes('سفر') || norm.includes('توفير') || norm.includes('المصحف') || norm.includes('الشاشه') || norm.includes('موقت') || norm.includes('مؤقت') || norm.includes('وقف بعد') || norm.includes('اطفي بعد') || norm.includes('اقفل بعد');
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

  // فحص أجزاء القرآن الكريم الـ 30 (The 30 Quranic Ajzaa)
  const matchedJuz = extractJuz(norm);
  if (matchedJuz) {
    const juzSurah = SURAHS.find(s => s.id === matchedJuz.surahId);
    if (juzSurah) {
      result.intent = 'PLAY_JUZ';
      result.payload = {
        juz: matchedJuz,
        surah: juzSurah,
        ayahNumber: matchedJuz.ayahNumber,
        reciter: matchedReciter
      };
      result.message = `تشغيل ${matchedJuz.name} (${matchedJuz.alias}) من سورة ${juzSurah.name}`;
      return result;
    }
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

  // أوامر التحكم في سرعة التلاوة (Playback Speed)
  if (norm.includes('السرعه العاديه') || norm.includes('السرعه الطبيعيه') || norm.includes('السرعه الاصليه') || norm === 'سرعه 1' || norm === 'سرعه واحد') {
    result.intent = 'SPEED_NORMAL';
    result.payload = { rate: 1.0 };
    result.message = 'تم إعادة سرعة التلاوة إلى الوضع الطبيعي (1.0x)';
    return result;
  }
  if (norm.includes('سرع') || norm.includes('اقرا اسرع') || norm.includes('تلاوة سريعه') || norm.includes('تلاوه سريعه') || norm.includes('زود السرعه')) {
    let rate = 1.25;
    if (norm.includes('واحد ونص') || norm.includes('واحد ونصف') || norm.includes('1.5')) {
      rate = 1.5;
    } else if (norm.includes('اتنين') || norm.includes('ضعف') || norm.includes('2')) {
      rate = 2.0;
    }
    result.intent = 'SPEED_UP';
    result.payload = { rate: rate };
    result.message = `تسريع التلاوة إلى ${rate}x`;
    return result;
  }
  if (norm.includes('بطئ') || norm.includes('اقرا بالراحه') || norm.includes('على مهلك') || norm.includes('تلاوة هاديه') || norm.includes('تلاوه هاديه') || norm.includes('قلل السرعه') || norm.includes('اخفض السرعه')) {
    let rate = 0.75;
    if (norm.includes('نص') || norm.includes('نصف') || norm.includes('0.5')) {
      rate = 0.5;
    }
    result.intent = 'SPEED_DOWN';
    result.payload = { rate: rate };
    result.message = `إبطاء التلاوة إلى ${rate}x`;
    return result;
  }

  // أوامر التقديم والتأخير اللحظي بالثواني (Seek Forward / Backward)
  const isSeekCmd = norm.includes('قدم') || norm.includes('تخطي') || norm.includes('رجع') || norm.includes('تاخير') || norm.includes('اخر');
  const hasSeekUnit = norm.includes('ثواني') || norm.includes('ثانيه') || norm.includes('دقيقه') || norm.includes('دقايق') || norm.includes('شوية') || norm.includes('شويه');
  if (isSeekCmd && hasSeekUnit && !norm.includes('ايه') && !norm.includes('الايه') && !norm.includes('سوره') && !norm.includes('سورة')) {
    let seconds = 15;
    if (norm.includes('دقيقه') || norm.includes('دقيقة')) {
      seconds = 60;
    } else if (norm.includes('نصف دقيقه') || norm.includes('نص دقيقه') || norm.includes('30 ثانيه') || norm.includes('ثلاثين ثانيه')) {
      seconds = 30;
    } else if (norm.includes('عشر ثواني') || norm.includes('10 ثواني')) {
      seconds = 10;
    } else {
      const extractedSec = extractNumber(norm);
      if (extractedSec && extractedSec > 0 && extractedSec <= 300) {
        seconds = extractedSec;
      }
    }

    if (norm.includes('قدم') || norm.includes('تخطي')) {
      result.intent = 'SEEK_FORWARD';
      result.payload = { seconds: seconds };
      result.message = `تقديم التلاوة بمقدار ${seconds} ثانية`;
      return result;
    } else {
      result.intent = 'SEEK_BACKWARD';
      result.payload = { seconds: seconds };
      result.message = `ترجيع التلاوة بمقدار ${seconds} ثانية`;
      return result;
    }
  }

  // أوامر مؤقت النوم والإيقاف المجدول (Sleep Timer)
  const isSleepTimerContext = norm.includes('موقت') || norm.includes('مؤقت') || norm.includes('اطفي بعد') || norm.includes('اقفل بعد') || norm.includes('وقف بعد');
  if (isSleepTimerContext) {
    if (norm.includes('الغا') || norm.includes('الغي') || norm.includes('وقف الموقت') || norm.includes('وقف المؤقت') || norm.includes('تعطيل') || norm.includes('بدون موقت') || norm.includes('بدون مؤقت')) {
      result.intent = 'CANCEL_SLEEP_TIMER';
      result.message = 'تم إلغاء مؤقت النوم ومتابعة التشغيل';
      return result;
    }

    if (norm.includes('تخلص') || norm.includes('تنتهي') || norm.includes('انتهاء السوره') || norm.includes('نهاية السوره') || norm.includes('اخر السوره')) {
      result.intent = 'SLEEP_TIMER';
      result.payload = { type: 'SURAH_END' };
      result.message = 'تم ضبط الإيقاف التلقائي عند اكتمال السورة الحالية';
      return result;
    }

    let minutes = 30; // افتراضي نصف ساعة
    if (norm.includes('ربع ساعه') || norm.includes('15 دقيقه') || norm.includes('خمسة عشر دقيقة')) {
      minutes = 15;
    } else if (norm.includes('نص ساعه') || norm.includes('نصف ساعه') || norm.includes('30 دقيقه') || norm.includes('ثلاثين دقيقة')) {
      minutes = 30;
    } else if (norm.includes('تلت ساعه') || norm.includes('ثلث ساعه') || norm.includes('20 دقيقه') || norm.includes('عشرين دقيقة')) {
      minutes = 20;
    } else if (norm.includes('ساعه الا ربع') || norm.includes('45 دقيقه')) {
      minutes = 45;
    } else if (norm.includes('ساعتين') || norm.includes('ساعتان') || norm.includes('120 دقيقه')) {
      minutes = 120;
    } else if (norm.includes('ساعه') || norm.includes('ساعة') || norm.includes('60 دقيقه') || norm.includes('ستين دقيقة')) {
      minutes = 60;
    } else if (norm.includes('عشر دقائق') || norm.includes('10 دقائق')) {
      minutes = 10;
    } else {
      const extractedMin = extractNumber(norm);
      if (extractedMin && extractedMin > 0 && extractedMin <= 300) {
        minutes = extractedMin;
      }
    }

    result.intent = 'SLEEP_TIMER';
    result.payload = { minutes: minutes, type: 'MINUTES' };
    result.message = `تم ضبط مؤقت النوم للإيقاف بعد ${minutes} دقيقة`;
    return result;
  }

  // إذاعة القرآن الكريم والتشغيل العشوائي (Radio & Shuffle Play)
  if (norm.includes('اذاعه القران') || norm.includes('اذاعة القران') || norm.includes('راديو القران') || norm.includes('شغل عشوائي') || norm.includes('تلاوة عشوائيه') || norm.includes('تلاوه عشوائيه') || norm.includes('اختر لي سوره') || norm.includes('اي سوره على ذوقك') || norm === 'شغل اي حاجه' || norm === 'شغل اي سوره') {
    result.intent = 'SHUFFLE_PLAY';
    result.payload = { reciter: matchedReciter };
    result.message = 'تشغيل تلاوة عشوائية مباركة';
    return result;
  }

  // الاستعلام عن القارئ الحالي (Who is reciting?)
  if (norm.includes('مين بيقرا') || norm.includes('مين بيقرأ') || norm.includes('مين القارئ') || norm.includes('من القارئ') || norm.includes('صوت مين') || norm.includes('مين الشيخ') || norm.includes('من هو القارئ') || norm.includes('اسم القارئ')) {
    result.intent = 'WHO_IS_RECITING';
    result.message = 'الاستعلام عن القارئ الحالي';
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

  // فحص الآيات القرآنية الشهيرة (آية الكرسي، خواتيم البقرة، آية الدين، آية النور، آية الملك...)
  for (const fa of FAMOUS_AYAHS) {
    if (fa.keys.some(k => norm.includes(normalizeArabic(k)))) {
      const s = SURAHS.find(sur => sur.id === fa.surahId);
      if (s) {
        result.intent = 'PLAY_AYAH';
        result.payload = {
          surah: s,
          ayahNumber: fa.ayahNumber,
          reciter: matchedReciter,
          title: fa.name
        };
        result.message = `تشغيل ${fa.name} من سورة ${s.name}`;
        return result;
      }
    }
  }

  // فحص المعوذات والمعوذتين (سورة الفلق وسورة الناس)
  if (norm.includes('المعوذات') || norm.includes('المعوذتين') || norm.includes('المعوذتان')) {
    const falaq = SURAHS.find(s => s.id === 113);
    result.intent = 'PLAY_SURAH';
    result.payload = {
      surah: falaq,
      ayahNumber: 1,
      reciter: matchedReciter
    };
    result.message = 'تشغيل المعوذتين (سورة الفلق وسورة الناس)';
    return result;
  }

  // فحص مطالع وبدايات السور القرآنية المشهورة التي ينطقها المستخدم بدلاً من اسم السورة
  for (const opening of FAMOUS_OPENINGS) {
    if (opening.keys.some(k => norm.includes(normalizeArabic(k)))) {
      const s = SURAHS.find(sur => sur.id === opening.surahId);
      if (s) {
        result.intent = 'PLAY_SURAH';
        result.payload = {
          surah: s,
          ayahNumber: 1,
          reciter: matchedReciter
        };
        result.message = `تشغيل سورة ${s.name}${matchedReciter ? ` بصوت الشيخ ${matchedReciter.name}` : ''}`;
        return result;
      }
    }
  }

  // البحث عن السورة ورقم الآية
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
    // استخراج رقم الآية إن وجد أو فحص أول / آخر السورة
    let ayahNum = 1;
    if (norm.includes('اخر') || norm.includes('اواخر') || norm.includes('نهاية') || norm.includes('نهايه')) {
      ayahNum = Math.max(1, matchedSurah.ayahs - 4);
    } else if (norm.includes('اول') || norm.includes('اوائل') || norm.includes('بداية') || norm.includes('بدايه') || norm.includes('من اول')) {
      ayahNum = 1;
    } else if (norm.includes('ايه') || norm.includes('اية') || norm.includes('رقم')) {
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
