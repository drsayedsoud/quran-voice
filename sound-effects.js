/**
 * نظام التغذية الصوتية واللمسية (Haptic & Audio Earcons)
 * يوفر تجربة تفاعلية للمكفوفين بدون الاعتماد على النظر إطلاقاً
 */

class SoundFeedback {
  constructor() {
    this.audioCtx = null;
    this.speechSynth = window.speechSynthesis || null;
    this.arabicVoice = null;
    this.initVoices();
  }

  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  initVoices() {
    if (!this.speechSynth) return;
    const load = () => {
      const voices = this.speechSynth.getVoices();
      this.arabicVoice = voices.find(v => v.lang.startsWith('ar')) || null;
    };
    load();
    if (this.speechSynth.onvoiceschanged !== undefined) {
      this.speechSynth.onvoiceschanged = load;
    }
  }

  // اهتزاز الهاتف بأنماط لمسية مخصصة
  vibrate(pattern = [100]) {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        console.warn('Vibration not permitted or unsupported:', e);
      }
    }
  }

  // نغمة بدء الاستماع (صوت صاعد ناعم)
  playListeningChime() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    this.vibrate([70]);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  }

  // نغمة نجاح التعرف وتنفيذ الأمر (وتر بهيج)
  playSuccessChime() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    this.vibrate([50, 40, 70]);

    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.05);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + index * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + index * 0.05 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + index * 0.05 + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + index * 0.05);
      osc.stop(ctx.currentTime + index * 0.05 + 0.25);
    });
  }

  // نغمة عدم الفهم أو الخطأ (صوت منخفض هادئ)
  playErrorChime() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    this.vibrate([120, 60, 120]);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  }

  // نقرة خفيفة عند الانتقال لآية جديدة
  playAyahTick() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    this.vibrate([30]);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  }

  // صوت فاصل (بيب ناعم / قطرة ماء نقية) عند الانتقال بين مواضع مختلفة في البحث الموضوعي
  playTopicTransitionTone() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    this.vibrate([40, 30, 60]);

    const now = ctx.currentTime;

    // النغمة الأولى (نغمة جرس ناعمة متصاعدة)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now); // A5
    osc1.frequency.exponentialRampToValueAtTime(1174.66, now + 0.12); // D6
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.22);

    // النغمة الثانية (بيب رقيق كقطرة الندى الفاصلة)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.5, now + 0.14); // E6
    osc2.frequency.exponentialRampToValueAtTime(1046.5, now + 0.35); // C6
    gain2.gain.setValueAtTime(0.001, now + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.16, now + 0.17);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.14);
    osc2.stop(now + 0.42);
  }

  // نغمة إيقاف مؤقت للتلاوة (نغمة هابطة ناعمة)
  playPauseChime() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    this.vibrate([60, 40]);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(580, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(360, ctx.currentTime + 0.16);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  }

  // نغمة استئناف التلاوة (نغمة صاعدة مبهجة)
  playResumeChime() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    this.vibrate([70]);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + 0.16);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  }

  // نغمة لتأكيد درجة الصوت للمكفوفين (درجة النغمة تعبر عن علو الصوت)
  playVolumeTone(volume = 1.0) {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    this.vibrate([35]);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const freq = 300 + (Math.max(0, Math.min(1, volume)) * 600);
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  // القراءة الصوتية باللغة العربية للرد على المستخدم
  speak(text) {
    if (!this.speechSynth) return;
    this.speechSynth.cancel(); // إيقاف أي قراءة سابقة

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    if (this.arabicVoice) {
      utterance.voice = this.arabicVoice;
    }
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    this.speechSynth.speak(utterance);
  }
}

export const sound = new SoundFeedback();
