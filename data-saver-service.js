/**
 * خدمة حساب استهلاك باقة الإنترنت ووضع التوفير الذكي
 * (Data Usage Tracker & Smart Saver Service)
 *
 * تحسب حجم البيانات المستخدمة اليومية بدقة (بالميجابايت)،
 * وتدير وضع توفير البيانات والطاقة مع حد أقصى افتراضي 250 ميجابايت يومياً.
 */

const STORAGE_KEY = 'quran_voice_data_tracker_v1';
const DEFAULT_LIMIT_MB = 250;

function getTodayString() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

const DEFAULT_STATE = {
  todayDate: '',
  todayBytes: 0,
  todayAudioBytes: 0,
  todayApiBytes: 0,
  totalBytes: 0,
  dailyLimitMB: DEFAULT_LIMIT_MB,
  saverMode: false
};

export class DataSaverService {
  constructor() {
    this.state = this.loadState();
    this.listeners = new Set();
    this.refreshDate();
    this.initNetworkObserver();
  }

  loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_STATE, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('[DataSaverService] فشل قراءة بيانات الاستهلاك:', e);
    }
    return { ...DEFAULT_STATE };
  }

  saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[DataSaverService] فشل حفظ بيانات الاستهلاك:', e);
    }
    this.notify();
  }

  refreshDate() {
    const today = getTodayString();
    if (this.state.todayDate !== today) {
      this.state.todayDate = today;
      this.state.todayBytes = 0;
      this.state.todayAudioBytes = 0;
      this.state.todayApiBytes = 0;
      this.saveState();
    }
  }

  // مراقبة موارد الشبكة الحقيقية عبر PerformanceObserver
  initNetworkObserver() {
    if (typeof window === 'undefined' || !window.PerformanceObserver) return;
    try {
      const observer = new PerformanceObserver((list) => {
        this.refreshDate();
        let addedBytes = 0;
        let isAudio = false;

        for (const entry of list.getEntries()) {
          const size = entry.transferSize || entry.encodedBodySize || 0;
          if (size > 0) {
            addedBytes += size;
            if (entry.name && (entry.name.endsWith('.mp3') || entry.name.includes('/audio/'))) {
              isAudio = true;
            }
          }
        }

        if (addedBytes > 0) {
          this.recordBytes(addedBytes, isAudio ? 'audio' : 'api');
        }
      });

      observer.observe({ type: 'resource', buffered: false });
    } catch (e) {
      // المتصفحات التي لا تدعم PerformanceObserver لموارد الشبكة
    }
  }

  // تسجيل البايتات المستهلكة
  recordBytes(bytes, category = 'audio') {
    if (!bytes || bytes <= 0) return;
    this.refreshDate();

    this.state.todayBytes += bytes;
    this.state.totalBytes += bytes;

    if (category === 'audio') {
      this.state.todayAudioBytes += bytes;
    } else {
      this.state.todayApiBytes += bytes;
    }

    this.saveState();
  }

  // حساب بيانات الاستماع الصوتي بناءً على المدة ومعدل البت (Bitrate)
  // لتغطية الخوادم الخارجية التي تحجب transferSize عبر CORS
  recordAudioSeconds(seconds, customBitrateKbps = null) {
    if (!seconds || seconds <= 0) return;
    this.refreshDate();

    // في وضع التوفير نعتمد معدلاً اقتصادياً 64kbps، وفي الوضع العادي 128kbps
    const bitrate = customBitrateKbps || (this.state.saverMode ? 64 : 128);
    // bytes = (seconds * kbps * 1000) / 8
    const bytes = Math.round((seconds * bitrate * 1000) / 8);

    this.recordBytes(bytes, 'audio');
  }

  // تفعيل / إلغاء وضع التوفير الذكي
  toggleSaverMode() {
    this.state.saverMode = !this.state.saverMode;
    this.saveState();
    return this.state.saverMode;
  }

  setSaverMode(enabled) {
    this.state.saverMode = Boolean(enabled);
    this.saveState();
  }

  isSaverModeActive() {
    return Boolean(this.state.saverMode);
  }

  // تعديل الحد اليومي
  setDailyLimitMB(limitMB) {
    const val = parseInt(limitMB, 10);
    if (!isNaN(val) && val > 0) {
      this.state.dailyLimitMB = val;
      this.saveState();
    }
  }

  getDailyLimitMB() {
    return this.state.dailyLimitMB || DEFAULT_LIMIT_MB;
  }

  // تصفير استهلاك اليوم يدوياً
  resetTodayUsage() {
    this.state.todayBytes = 0;
    this.state.todayAudioBytes = 0;
    this.state.todayApiBytes = 0;
    this.saveState();
  }

  // التحويل للميجابايت
  bytesToMB(bytes) {
    return (bytes / (1024 * 1024)).toFixed(1);
  }

  getTodayUsageMB() {
    this.refreshDate();
    return this.bytesToMB(this.state.todayBytes);
  }

  getTodayAudioMB() {
    return this.bytesToMB(this.state.todayAudioBytes);
  }

  getTodayApiMB() {
    return this.bytesToMB(this.state.todayApiBytes);
  }

  // النسبة المئوية للبروجرس بار (0 إلى 100%)
  getPercentage() {
    this.refreshDate();
    const limitBytes = (this.state.dailyLimitMB || DEFAULT_LIMIT_MB) * 1024 * 1024;
    if (limitBytes <= 0) return 0;
    const pct = (this.state.todayBytes / limitBytes) * 100;
    return Math.min(100, Math.max(0, Math.round(pct)));
  }

  // ألوان شريط التقدم المتجاوبة مع نسبة الاستهلاك
  getProgressColorClass() {
    const pct = this.getPercentage();
    if (pct < 50) {
      return {
        bar: 'bg-gradient-to-r from-emerald-500 to-teal-400',
        text: 'text-emerald-400',
        badge: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/50'
      };
    } else if (pct < 80) {
      return {
        bar: 'bg-gradient-to-r from-amber-500 to-yellow-400',
        text: 'text-amber-400',
        badge: 'bg-amber-900/60 text-amber-300 border-amber-700/50'
      };
    } else {
      return {
        bar: 'bg-gradient-to-r from-rose-500 to-red-500 animate-pulse',
        text: 'text-rose-400 font-black',
        badge: 'bg-rose-900/60 text-rose-300 border-rose-700/50 animate-pulse'
      };
    }
  }

  // الاشتراك في تحديثات البيانات
  subscribe(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback);
      // إرسال الحالة الحالية فوراً
      callback(this.getSummary());
    }
    return () => this.listeners.delete(callback);
  }

  notify() {
    const summary = this.getSummary();
    for (const cb of this.listeners) {
      try {
        cb(summary);
      } catch (err) {
        console.error('[DataSaverService] خطأ في مستمع البيانات:', err);
      }
    }
  }

  getSummary() {
    return {
      todayMB: this.getTodayUsageMB(),
      audioMB: this.getTodayAudioMB(),
      apiMB: this.getTodayApiMB(),
      limitMB: this.getDailyLimitMB(),
      percentage: this.getPercentage(),
      saverMode: this.isSaverModeActive(),
      colorClass: this.getProgressColorClass()
    };
  }
}

// تصدير نسخة أحادية (Singleton)
export const dataSaver = new DataSaverService();
