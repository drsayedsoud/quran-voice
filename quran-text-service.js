/**
 * خدمة نصوص القرآن الكريم بالرسم العثماني الأصيل
 * معتمدة على مصحف المدينة النبوية (مجمع الملك فهد لطباعة المصحف الشريف)
 * تعمل أوفلاين 100% وبسرعة استجابة 0ms
 */

class QuranTextService {
  constructor() {
    this.verses = null;
    this.isLoading = false;
    this.loadPromise = null;
    this.fontSizeLevel = 0; // -1: أصغر, 0: افتراضي, 1: أكبر, 2: كبير جداً
  }

  /**
   * تهيئة وتحميل بيانات المصحف الشريف في الذاكرة
   */
  async init() {
    if (this.verses) return this.verses;
    if (this.loadPromise) return this.loadPromise;

    this.isLoading = true;
    this.loadPromise = (async () => {
      try {
        const response = await fetch('./quran-uthmani.json');
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        this.verses = await response.json();
        this.isLoading = false;
        return this.verses;
      } catch (err) {
        console.error('[QuranTextService] خطأ في تحميل بيانات المصحف:', err);
        this.isLoading = false;
        return null;
      }
    })();

    return this.loadPromise;
  }

  /**
   * تحويل الأرقام الإنجليزية إلى أرقام مشرقية عربية
   */
  toArabicDigits(num) {
    const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    return String(num).replace(/[0-9]/g, d => arabicDigits[d]);
  }

  /**
   * جلب بيانات الآية الحالية مع معالجة البسملة ورقم الآية
   */
  getAyah(surahNumber, ayahNumber) {
    if (!this.verses) return null;
    const key = `${surahNumber}:${ayahNumber}`;
    let rawText = this.verses[key] || '';
    if (!rawText) return null;

    // إزالة أية مسافات أو علامات تحكم خفية
    rawText = rawText.trim().replace(/^\uFEFF/, '');

    let hasBasmalahHeader = false;
    let basmalahText = null;
    const BASMALAH_PREFIX = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

    // في السور من 2 إلى 114 (باستثناء التوبة) تكون البسملة مدمجة في بداية الآية 1
    if (surahNumber > 1 && surahNumber !== 9 && ayahNumber === 1) {
      if (rawText.startsWith(BASMALAH_PREFIX)) {
        hasBasmalahHeader = true;
        basmalahText = BASMALAH_PREFIX;
        rawText = rawText.substring(BASMALAH_PREFIX.length).trim();
      }
    }

    const arabicNum = this.toArabicDigits(ayahNumber);

    return {
      surahNumber,
      ayahNumber,
      arabicNum,
      hasBasmalahHeader,
      basmalahText,
      text: rawText,
      formattedText: `${rawText} ﴿${arabicNum}﴾`
    };
  }
}

export const quranTextService = new QuranTextService();
