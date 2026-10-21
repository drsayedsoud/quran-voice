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
