/**
 * نظام تتبع الورد والحفظ التراكمي (Streak & Audio Journal Service)
 * يسجل إنجازات المسلم اليومية والتراكمية في الاستماع والحفظ
 * ويولد إحصائيات تحفيزية تُقرأ صوتياً وتُعرض في واجهات عصرية
 */

const STORAGE_KEY = 'quran_voice_journal_v1';

function getTodayString() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function getWeekId(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${weekNo}`;
}

const DEFAULT_STATE = {
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: '',
  todayDate: '',
  todayAyahs: 0,
  weekId: '',
  weekAyahs: 0,
  totalAyahs: 0,
  totalMemorizedAyahs: 0,
  history: [] // [{ date: 'YYYY-MM-DD', count: N }]
};

export class QuranJournalService {
  constructor() {
    this.state = this.loadState();
    this.refreshDates();
  }

  loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_STATE, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('[JournalService] تعذر قراءة بيانات السجل من localStorage:', e);
    }
    return { ...DEFAULT_STATE };
  }

  saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[JournalService] تعذر حفظ بيانات السجل في localStorage:', e);
    }
  }

  refreshDates() {
    const today = getTodayString();
    const currentWeek = getWeekId();

    // إعادة تعيين عداد اليوم إذا تغير التاريخ
    if (this.state.todayDate !== today) {
      this.state.todayDate = today;
      this.state.todayAyahs = 0;
    }

    // إعادة تعيين عداد الأسبوع إذا تغير الأسبوع
    if (this.state.weekId !== currentWeek) {
      this.state.weekId = currentWeek;
      this.state.weekAyahs = 0;
    }

    // فحص انقطاع الـ Streak إذا مر أكثر من يوم بدون نشاط
    if (this.state.lastActiveDate) {
      const last = new Date(this.state.lastActiveDate);
      const now = new Date(today);
      const diffDays = Math.round((now - last) / (1000 * 60 * 60 * 24));
      if (diffDays > 1) {
        // انقطع السلسلة
        this.state.currentStreak = 0;
      }
    }

    this.saveState();
  }

  /**
   * تسجيل آية تم الاستماع إليها أو تكرارها
   */
  recordAyah(surahId, ayahNumber, isMemorization = false) {
    this.refreshDates();
    const today = getTodayString();

    // تحديث سلسلة الأيام المتتالية (Streak)
    if (this.state.lastActiveDate !== today) {
      if (this.state.lastActiveDate) {
        const last = new Date(this.state.lastActiveDate);
        const now = new Date(today);
        const diffDays = Math.round((now - last) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          this.state.currentStreak += 1;
        } else {
          this.state.currentStreak = 1;
        }
      } else {
        this.state.currentStreak = 1;
      }

      this.state.lastActiveDate = today;
      if (this.state.currentStreak > this.state.longestStreak) {
        this.state.longestStreak = this.state.currentStreak;
      }
    }

    // زيادة العدادات
    this.state.todayAyahs += 1;
    this.state.weekAyahs += 1;
    this.state.totalAyahs += 1;
    if (isMemorization) {
      this.state.totalMemorizedAyahs += 1;
    }

    // تحديث السجل التاريخي (آخر 30 يوم)
    let todayEntry = this.state.history.find(h => h.date === today);
    if (todayEntry) {
      todayEntry.count += 1;
    } else {
      this.state.history.push({ date: today, count: 1 });
      if (this.state.history.length > 30) {
        this.state.history.shift();
      }
    }

    this.saveState();
    return this.getSummary();
  }

  /**
   * الحصول على ملخص الإحصائيات
   */
  getSummary() {
    this.refreshDates();
    const streak = this.state.currentStreak;
    const today = this.state.todayAyahs;
    const week = this.state.weekAyahs;
    const total = this.state.totalAyahs;
    const memorized = this.state.totalMemorizedAyahs;

    // صياغة رسالة صوتية تحفيزية بليغة
    let speechMessage = '';
    if (streak > 1) {
      speechMessage = `ما شاء الله! أتممت ${streak} أيام متتالية في وردك القرآني. واستمعت إلى ${today} آية اليوم، و ${week} آية هذا الأسبوع، وإجمالي ما استمعت إليه ${total} آية. بارك الله في همتك وحفظك.`;
    } else if (today > 0) {
      speechMessage = `أحسنت! استمعت اليوم إلى ${today} آية، و ${week} آية هذا الأسبوع، وإجمالي استماعك ${total} آية. استمر على هذا الورد المبارك.`;
    } else {
      speechMessage = `مرحباً بك! إجمالي ما استمعت إليه ${total} آية في رصيدك القرآني. ابدأ وردك اليوم لمواصلة سلسلة الأيام المتتالية.`;
    }

    return {
      currentStreak: streak,
      longestStreak: this.state.longestStreak,
      todayAyahs: today,
      weekAyahs: week,
      totalAyahs: total,
      totalMemorizedAyahs: memorized,
      speechMessage
    };
  }

  /**
   * إعادة تعيين السجل (لأغراض الاختبار وإدارة البيانات)
   */
  reset() {
    this.state = { ...DEFAULT_STATE };
    this.saveState();
  }
}

export const journalService = new QuranJournalService();
