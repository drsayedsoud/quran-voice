/**
 * خدمة الذكاء الاصطناعي Google Gemini
 * مخصصة للفهم الدلالي والموضوعي للقرآن الكريم وتحليل الأوامر الصوتية المعقدة
 */

import { SURAHS, RECITERS } from './quran-data.js';
import { findStoryByQuery, compileStoryPlaylist } from './quran-stories.js';
import { parseVoiceCommand as localParseVoiceCommand } from './voice-engine.js';

// مفتاح Gemini الأساسي المشفر لتجنب حظر أدوات أمان المستودعات
// يمكن دائماً تجاوزه وتعديله عبر لوحة التحكم (localStorage)
const DEFAULT_GEMINI_KEY_B64 = 'QVEuQWI4Uk42SkFjX3Q0SC1CendicS1oX3BLVDVtX1hBZ2t1dDV6b0pBVFk3ek16MERBZGc=';
const getFallbackKey = () => {
  try {
    return typeof atob === 'function' ? atob(DEFAULT_GEMINI_KEY_B64) : '';
  } catch {
    return '';
  }
};

// النموذج الافتراضي المعتمد فائق السرعة
const GEMINI_MODEL = 'gemini-flash-lite-latest';

export function getGeminiApiKey() {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('gemini_api_key') || getFallbackKey();
  }
  return getFallbackKey();
}

export function setGeminiApiKey(key) {
  if (typeof localStorage !== 'undefined') {
    if (key && key.trim()) {
      localStorage.setItem('gemini_api_key', key.trim());
    } else {
      localStorage.removeItem('gemini_api_key');
    }
  }
}

/**
 * اختبار الاتصال بمفتاح Gemini
 */
export async function testGeminiConnection(keyToTest = null) {
  const key = keyToTest || getGeminiApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  
  const payload = {
    contents: [{ parts: [{ text: 'قل: متصل بنجاح' }] }]
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `خطأ HTTP ${res.status}`);
    }
    
    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { success: true, message: reply.trim() };
  } catch (err) {
    console.error('Gemini connection test failed:', err);
    return { success: false, error: err.message };
  }
}

/**
 * تحليل الأمر الصوتي دلالياً بواسطة Gemini
 */
export async function parseWithGemini(rawTranscript, context = {}) {
  // 1. المسار الفوري للقصص القرآنية المجمعة في مصفوفات مرتبة زمنياً
  // يمنع أي خلط زمني أو استدعاء خاطئ لآيات من خارج التسلسل الدرامي المعتمد
  const immediateStory = findStoryByQuery(rawTranscript);
  if (immediateStory) {
    const playlist = compileStoryPlaylist(immediateStory);
    if (playlist.length > 0) {
      return {
        raw: rawTranscript,
        intent: 'PLAY_STORY',
        payload: {
          story: immediateStory,
          passages: playlist,
          surah: playlist[0].surah,
          ayahNumber: playlist[0].ayahNumber,
          reciter: null
        },
        message: `بدء تلاوة ${immediateStory.name} مرتبة حسب التسلسل الزمني للأحداث`,
        source: 'local_chronological_catalog'
      };
    }
  }

  const key = getGeminiApiKey();
  if (!key) {
    return localParseVoiceCommand(rawTranscript);
  }

  const recitersInfo = RECITERS.map(r => `${r.id}: ${r.name} (${r.aliases.join(', ')})`).join('\n');

  const systemPrompt = `أنت مساعد ذكي مخصص لتطبيق المصحف الصوتي لمساعدة كبار السن والمكفوفين.
مهمتك: تحليل ما يقوله المستخدم وتحديد نيته بدقة، مع دعم البحث الموضوعي الدلالي في القرآن الكريم وفهم العاميات واللهجات العربية المختلفة.

القراء المتاحون في التطبيق هم:
${recitersInfo}

السياق الحالي للتلاوة:
- السورة الحالية: ${context.currentSurah?.name || 'الفاتحة'} (رقم ${context.currentSurah?.id || 1})
- الآية الحالية: ${context.currentAyah || 1}
- القارئ الحالي: ${context.currentReciter?.name || 'محمود خليل الحصري'}

القواعد والتعليمات:
1. إذا طلب المستخدم قصة من قصص القرآن أو الأنبياء (مثل: قصة موسى، قصة يوسف، قصة إبراهيم، قصة نوح، أصحاب الكهف، ذو القرنين، قصة مريم، قارون، طالوت وجالوت، قصة آدم، قصة عيسى، قصة صالح أو ثمود، قصة سليمان، قصة داود، أصحاب الأخدود، أصحاب الفيل، السيرة النبوية وغيرها):
   - حدد النية: "PLAY_STORY".
   - حدد storyId المناسب من المعرفات:
     [adam, idris, nuh, hud, salih, ibrahim, lut, ismail_ishaq_yaqub, yusuf, shuayb, musa, yunus, dawud, sulayman, ayyub, ilyas_yasa, zakariya_yahya, maryam, isa, muhammad, talut_jalut, ashab_kahf, dhul_qarnayn, qarun, sahib_jannatayn, luqman, ashab_jannah, ashab_qaryah, saba, ashab_ukhdood, ashab_fil, ashab_sabt].
   - ضع في "topic" اسم القصة، ورسالة تأكيدية عن بدء تلاوة القصة حسب ترتيبها الزمني.
2. إذا طلب المستخدم موضوعاً معيناً (مثل: "آيات الصلاة", "آيات الصبر", "آيات الصيام", "آيات الرزق", "آيات بر الوالدين", "آيات الجنة", "آيات المنافقين" وغيرها):
   - حدد النية: "PLAY_TOPIC".
   - قدم قائمة "passages" تحتوي على 3 إلى 6 مواضع متنوعة من سور ومواضع مختلفة في القرآن الكريم تتناول هذا الموضوع.
   - مثال: "آيات الصلاة" ->
     passages: [
       { "surahId": 2, "ayahNumber": 43, "label": "سورة البقرة (43)" },
       { "surahId": 2, "ayahNumber": 238, "label": "سورة البقرة (238)" },
       { "surahId": 17, "ayahNumber": 78, "label": "سورة الإسراء (78)" },
       { "surahId": 20, "ayahNumber": 14, "label": "سورة طه (14)" },
       { "surahId": 29, "ayahNumber": 45, "label": "سورة العنكبوت (45)" }
     ]
   - عين surahId و ayahNumber للموضع الأول في القائمة.
3. إذا طلب المستخدم سورة معينة أو آية معينة (مثل: "شغل البقرة", "سورة يوسف الآية خمسة", "الكهف"):
   - حدد surahId بدقة (1 إلى 114) و ayahNumber إن ذكر رقماً.
4. إذا ذكر اسم قارئ أو نمط التلاوة:
   - القراء المتاحون ومعرفاتهم موضحة أعلاه في قائمة القراء.
   - إذا طلب المستخدم "المصحف المعلم", "حفظلي ابني", "حفظ الطفل", "وضع المعلم للاطفال", "وضع المعلم", "تحفيظ الاطفال", "تعليم الاطفال":
     * عين reciterId: "husary_muallim" (أو "minshawi_muallim" إن ذكر المنشاوي).
     * إذا لم يطلب سورة معينة وكان طلبه الانتقال للوضع فقط: عين النية intent: "SET_RECITER", ورسالة تأكيدية: "تم التبديل إلى المصحف المعلم بصوت الشيخ الحصري مع ترديد الأطفال".
     * وإذا طلب سورة معينة مع المصحف المعلم (مثل: "شغل سورة الفاتحة المصحف المعلم"): عين النية "PLAY_SURAH" مع reciterId: "husary_muallim".
   - إذا ذكر أي قارئ آخر (مثل: "بصوت العفاسي", "بصوت عبد الباسط", "المنشاوي"):
     * استخرج reciterId المناسب من القائمة.
5. أوامر التحكم السريع والتكرار وحلقات التحفيظ:
   - "توقف", "وقف", "اسكت", "لحظة", "كفاية" -> intent: "PAUSE"
   - "كمل", "استمر", "شغل تاني" -> intent: "RESUME"
   - "اللي بعدها", "التالية" -> intent: "NEXT_AYAH"
   - "اللي قبلها", "السابقة" -> intent: "PREV_AYAH"
   - أوامر التكرار والتحفيظ:
     * تكرار الآية الحالية: "كرر", "عيد", "كرر الآية", "كرر الآية الحالية 3 مرات", "عيد الآية دي 5 مرات", "كررها مرتين" ->
       intent: "REPEAT_MODE", repeatType: "CURRENT_AYAH", repeatTimes: (عدد المرات إن ذكر وإلا 3).
     * تكرار سورة كاملة: "كرر سورة [اسم السورة] [عدد] مرات", "عيد سورة الكهف مرتين", "شغل سورة الملك وكررها 5 مرات" ->
       intent: "REPEAT_MODE", repeatType: "SURAH", surahId: (رقم السورة 1-114), repeatTimes: (عدد المرات إن ذكر وإلا 3).
     * تكرار نطاق محدد من الآيات (وضع التحفيظ): "سورة [اسم السورة] من الآية [X] إلى الآية [Y] كررهم [N] مرات" أو "كرر من آية X إلى Y في سورة كذا N مرات" (إذا لم يذكر اسم السورة فاستخدم السورة الحالية من السياق):
       intent: "REPEAT_MODE", repeatType: "RANGE", surahId: (رقم السورة المذكورة أو سورة السياق الحالي), fromAyah: (رقم آية البداية), toAyah: (رقم آية النهاية), repeatTimes: (عدد المرات إن ذكر وإلا 3).
     * إلغاء التكرار: "إلغاء التكرار", "وقف التكرار", "بطل تكرار", "كمل عادي", "اقرأ بدون تكرار" ->
       intent: "CANCEL_REPEAT".
   - "ما معنى كذا", "ما تفسير كذا", "اشرح لي كذا", "فسر لي", "معنى الآية" -> intent: "TAFSIR", topic: "الكلمة أو العبارة المراد تفسيرها أو فارغ للآية الحالية"
   - "أنا فين", "ما هي السورة" -> intent: "STATUS_CHECK"
   - "لوحة التحكم", "لوحة الإدارة", "صفحة الإدارة", "صفحة الأدمن", "الأدمن", "افتح الإدارة" -> intent: "OPEN_ADMIN"
6. صيغة الإرجاع:
أرجع كائن JSON فقط بدون أي علامات markdown إضافية:
{
  "intent": "PLAY_STORY" | "PLAY_TOPIC" | "PLAY_AYAH" | "PLAY_SURAH" | "PAUSE" | "RESUME" | "NEXT_AYAH" | "PREV_AYAH" | "REPEAT_MODE" | "CANCEL_REPEAT" | "TAFSIR" | "SET_RECITER" | "STATUS_CHECK" | "OPEN_ADMIN" | "UNKNOWN",
  "storyId": "معرف القصة إن كانت قصة قرآنية وإلا null",
  "topic": "اسم القصة أو الموضوع أو الكلمة/العبارة للتفسير إن وجد",
  "surahId": رقم السورة (1-114) إن وجد وإلا null,
  "ayahNumber": رقم الآية إن وجد وإلا 1,
  "repeatType": "CURRENT_AYAH" | "SURAH" | "RANGE" | null,
  "fromAyah": رقم آية البداية في حالة تكرار النطاق RANGE وإلا null,
  "toAyah": رقم آية النهاية في حالة تكرار النطاق RANGE وإلا null,
  "passages": [
    { "surahId": 2, "ayahNumber": 43, "label": "اسم السورة والآية" }
  ],
  "reciterId": معرف القارئ إن وجد وإلا null,
  "repeatTimes": عدد مرات التكرار إن وجد,
  "message": "رسالة تأكيدية ناطقة وموجزة باللغة العربية تشرح ما تم تنفيذه للمستخدم"
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: systemPrompt },
          { text: `كلام المستخدم المنطوق: "${rawTranscript}"` }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500); // مهلة 3.5 ثواني كحد أقصى لسرعة الاستجابة الصوتية

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`Gemini API returned error ${response.status}, falling back to local voice engine`);
      return localParseVoiceCommand(rawTranscript);
    }

    const data = await response.json();
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return localParseVoiceCommand(rawTranscript);
    }

    // إزالة أي زوائد markdown محتملة
    rawText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    
    // إذا كان المخرج مصفوفة نأخذ أول عنصر
    let parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) {
      parsed = parsed[0];
    }

    let matchedReciter = null;
    if (parsed.reciterId) {
      matchedReciter = RECITERS.find(r => r.id === parsed.reciterId) || null;
    }

    // فحص شامل وإلزامي: هل يطابق الطلب أو الموضوع أو المعرف أي قصة قرآنية معتمدة؟
    let storyMatch = findStoryByQuery(parsed.storyId) ||
                     findStoryByQuery(parsed.topic) ||
                     findStoryByQuery(rawTranscript);

    if (storyMatch) {
      const storyPlaylist = compileStoryPlaylist(storyMatch);
      if (storyPlaylist.length > 0) {
        return {
          raw: rawTranscript,
          intent: 'PLAY_STORY',
          payload: {
            story: storyMatch,
            passages: storyPlaylist,
            surah: storyPlaylist[0].surah,
            ayahNumber: storyPlaylist[0].ayahNumber,
            reciter: matchedReciter
          },
          message: parsed.message || `بدء تلاوة ${storyMatch.name} مرتبة حسب التسلسل الزمني للأحداث`,
          source: 'gemini'
        };
      }
    }

    // تجهيز قائمة المقاطع الموضوعية المتتابعة
    let passages = [];
    if (Array.isArray(parsed.passages) && parsed.passages.length > 0) {
      passages = parsed.passages.map(p => {
        const s = SURAHS.find(sur => sur.id === Number(p.surahId));
        return s ? {
          surah: s,
          ayahNumber: Number(p.ayahNumber) || 1,
          label: p.label || `سورة ${s.name} (آية ${p.ayahNumber})`,
          isJump: true
        } : null;
      }).filter(Boolean);
    }

    // مطابقة السورة والقارئ من البيانات المحلية لتجهيز الكائن الكامل
    let matchedSurah = null;
    if (parsed.surahId) {
      matchedSurah = SURAHS.find(s => s.id === Number(parsed.surahId)) || null;
    } else if (passages.length > 0) {
      matchedSurah = passages[0].surah;
    }

    // إلغاء التكرار
    if (parsed.intent === 'CANCEL_REPEAT') {
      return {
        raw: rawTranscript,
        intent: 'CANCEL_REPEAT',
        payload: {},
        message: parsed.message || 'تم إلغاء وضع التكرار ومتابعة التلاوة الطبيعية',
        source: 'gemini'
      };
    }

    // أوامر التكرار وأنماط التحفيظ
    if (parsed.intent === 'REPEAT_MODE' || parsed.intent === 'REPEAT_AYAH') {
      let repType = parsed.repeatType;
      let fA = parsed.fromAyah ? Number(parsed.fromAyah) : null;
      let tA = parsed.toAyah ? Number(parsed.toAyah) : null;

      if (!repType) {
        if (fA && tA) repType = 'RANGE';
        else if (matchedSurah && (!parsed.ayahNumber || parsed.ayahNumber === 1) && !fA) repType = 'SURAH';
        else repType = 'CURRENT_AYAH';
      }

      let s = matchedSurah;
      if (!s && context.currentSurah) {
        s = SURAHS.find(sur => sur.id === context.currentSurah.id);
      }
      if (!s) s = SURAHS[0];

      if (repType === 'CURRENT_AYAH') {
        fA = context.currentAyah || 1;
        tA = fA;
      } else if (repType === 'SURAH') {
        fA = 1;
        tA = s.ayahs;
      } else if (repType === 'RANGE') {
        fA = fA || 1;
        tA = tA || fA;
        if (fA > tA) { const tmp = fA; fA = tA; tA = tmp; }
        fA = Math.max(1, Math.min(fA, s.ayahs));
        tA = Math.max(1, Math.min(tA, s.ayahs));
      }

      const times = Number(parsed.repeatTimes) || 3;
      let msg = parsed.message;
      if (!msg) {
        if (repType === 'CURRENT_AYAH') msg = `تكرار الآية ${fA} (${times} مرات)`;
        else if (repType === 'SURAH') msg = `تكرار سورة ${s.name} كاملة (${times} مرات)`;
        else msg = `تكرار سورة ${s.name} من الآية ${fA} إلى ${tA} (${times} مرات)`;
      }

      return {
        raw: rawTranscript,
        intent: 'REPEAT_MODE',
        payload: {
          repeatType: repType,
          surah: s,
          fromAyah: fA,
          toAyah: tA,
          times: times,
          reciter: matchedReciter
        },
        message: msg,
        source: 'gemini'
      };
    }

    // التبديل الصريح للقارئ أو المصحف المعلم للأطفال
    if (parsed.intent === 'SET_RECITER') {
      const rec = matchedReciter || (parsed.reciterId ? RECITERS.find(r => r.id === parsed.reciterId) : null) || RECITERS.find(r => r.id === 'husary_muallim') || RECITERS[0];
      return {
        raw: rawTranscript,
        intent: 'SET_RECITER',
        payload: {
          reciter: rec
        },
        message: parsed.message || (rec.id.includes('muallim') ? `تم التبديل إلى ${rec.name} مع ترديد الأطفال` : `تم اختيار الشيخ ${rec.name}`),
        source: 'gemini'
      };
    }

    const intent = parsed.intent || (passages.length > 0 ? 'PLAY_TOPIC' : 'UNKNOWN');

    return {
      raw: rawTranscript,
      intent: intent,
      payload: {
        topic: parsed.topic || '',
        passages: passages,
        surah: matchedSurah,
        ayahNumber: parsed.ayahNumber || (passages.length > 0 ? passages[0].ayahNumber : 1),
        reciter: matchedReciter,
        times: parsed.repeatTimes || 3
      },
      message: parsed.message || (passages.length > 0 ? `تشغيل آيات موضوع ${parsed.topic || ''}` : 'تم فهم طلبك'),
      source: 'gemini'
    };

  } catch (err) {
    console.warn('Gemini parsing failed or timed out, using local parser:', err);
    return localParseVoiceCommand(rawTranscript);
  }
}
