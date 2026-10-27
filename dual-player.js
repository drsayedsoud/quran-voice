/**
 * مشغل القرآن الكريم المزدوج (Dual-Deck Quran Audio Engine)
 * يوفر تلاوة مرسلة خاشعة متصلة بدون أدنى سكتات أو فواصل (Gapless Playback)
 * مع نظام تخزين مؤقت استباقي في الخلفية (Lookahead Buffer) للـ 5 آيات القادمة
 */

import { SURAHS, getAyahAudioUrl, getSurahAudioUrl, getEffectiveReciterFolder } from './quran-data.js';

export class DualQuranPlayer {
  constructor(options = {}) {
    // وضع التوفير الذكي (SoundCloud Data Saver)
    this.isSaverMode = Boolean(options.isSaverMode);

    // مشغلا الصوت التبادليان (Deck A & Deck B)
    this.deckA = new Audio();
    this.deckB = new Audio();

    const initialPreload = this.isSaverMode ? 'metadata' : 'auto';
    this.deckA.preload = initialPreload;
    this.deckB.preload = initialPreload;

    // تعيين المشغل النشط والمشغل الاحتياطي
    this.activeDeck = this.deckA;
    this.standbyDeck = this.deckB;
    this.activeDeckName = 'A';

    // الحالة
    this.currentSurah = options.initialSurah || SURAHS[0];
    this.currentAyah = options.initialAyah || 1;
    this.currentReciter = options.initialReciter || null;
    this.isPlaying = false;
    this.volume = 1.0;
    this.playbackRate = 1.0;
    this.repeatCount = 1;
    this.currentRepeat = 1;

    // منظومة التكرار الذكي وحلقات التحفيظ (Smart Loop & Memorization Engine)
    this.loopState = {
      active: false,
      type: null, // 'CURRENT_AYAH' | 'RANGE' | 'SURAH'
      surah: null,
      fromAyah: 1,
      toAyah: 1,
      totalLoops: 1,
      currentLoop: 1
    };

    // النمط الهجين: 'ayah' للآيات والمواضع والقصص، أو 'surah' للتدفق المتصل لسورة كاملة (SoundCloud-style)
    this.mode = 'ayah';

    // وضع المصحف المعلم التفاعلي (Listen & Repeat Mode)
    this.interactiveRepeat = {
      active: false,
      multiplier: 1.0,
      isWaiting: false,
      timerId: null,
      surah: null,
      fromAyah: 1,
      toAyah: 1
    };

    // وضع اختبار الذاكرة (Blind Memory Prompt Mode)
    this.memoryPrompt = {
      active: false,
      triggered: false,
      surah: null,
      ayah: null,
      pauseTime: 0
    };

    // قوائم التشغيل الموضوعية
    this.topicPlaylist = [];
    this.topicIndex = 0;

    // حالة المسار المحمل في المشغل الاحتياطي
    this.standbyTrack = null;

    // إعدادات التحميل المسبق
    this.prefetchCount = options.prefetchCount !== undefined ? options.prefetchCount : (this.isSaverMode ? 1 : 5);
    this.audioCacheName = 'quran-audio-cache';
    this.prefetchAbortController = null;

    // مسارات ردود الفعل (Callbacks)
    this.onAyahChange = null;        // (surah, ayah, reciter, isAutoTransition)
    this.onSurahChange = null;       // (surah, reciter)
    this.onTimeUpdate = null;        // (currentTime, duration, percent)
    this.onPlayStateChange = null;   // (isPlaying)
    this.onRepeat = null;           // (currentRepeat, repeatCount, loopState)
    this.onLoopFinished = null;     // (finishedLoopState)
    this.onQuranFinished = null;    // ()
    this.onError = null;            // (error, track)
    this.onTopicTransition = null;  // (passage, index, total)
    this.onInteractiveRepeatPause = null;    // (pauseDurationSec, surah, ayah)
    this.onInteractiveRepeatResume = null;   // (surah, ayah)
    this.onMemoryPromptPaused = null;        // (surah, ayah, pauseTime)
    this.onMemoryPromptRevealed = null;      // (surah, ayah)

    this.initListeners();
  }

  initListeners() {
    // ربط أحداث المشغل A
    this.deckA.addEventListener('ended', () => this.handleTrackEnded(this.deckA));
    this.deckA.addEventListener('timeupdate', () => this.handleTimeUpdate(this.deckA));
    this.deckA.addEventListener('error', (e) => this.handleError(this.deckA, e));

    // ربط أحداث المشغل B
    this.deckB.addEventListener('ended', () => this.handleTrackEnded(this.deckB));
    this.deckB.addEventListener('timeupdate', () => this.handleTimeUpdate(this.deckB));
    this.deckB.addEventListener('error', (e) => this.handleError(this.deckB, e));
  }

  // معالجة تحديث شريط التقدم والوقت
  handleTimeUpdate(deck) {
    if (deck !== this.activeDeck) return;

    // فحص اختبار الذاكرة (Blind Memory Prompt Cutoff): إيقاف مفاجئ في أول ثوانٍ للتحقق من حفظ المستخدم
    if (this.memoryPrompt && this.memoryPrompt.active && !this.memoryPrompt.triggered) {
      if (deck.duration && deck.duration > 2.5) {
        const cutoffTime = Math.min(5.5, Math.max(2.8, deck.duration * 0.35));
        if (deck.currentTime >= cutoffTime) {
          this.memoryPrompt.triggered = true;
          this.memoryPrompt.pauseTime = deck.currentTime;
          deck.pause();
          this.isPlaying = false;
          if (this.onPlayStateChange) this.onPlayStateChange(false);
          if (this.onMemoryPromptPaused) {
            this.onMemoryPromptPaused(this.currentSurah, this.currentAyah, deck.currentTime);
          }
          return;
        }
      }
    }

    if (this.onTimeUpdate && deck.duration) {
      const percent = (deck.currentTime / deck.duration) * 100;
      this.onTimeUpdate(deck.currentTime, deck.duration, percent);
    }
  }

  // معالجة الأخطاء
  handleError(deck, e) {
    if (deck !== this.activeDeck) return;
    console.warn(`[DualPlayer] Error on Deck ${this.activeDeckName}:`, e);
    if (this.onError) {
      this.onError(e, {
        surah: this.currentSurah,
        ayah: this.currentAyah,
        reciter: this.currentReciter
      });
    }
  }

  // معالجة نهاية الآية الحالية (التبديل الفوري بدون فواصل)
  handleTrackEnded(deck) {
    if (deck !== this.activeDeck) return;

    // فحص وضع المصحف المعلم التفاعلي (Listen & Repeat): إتاحة وقت سكون يعادل مدة الآية لترديد المستخدم
    if (this.interactiveRepeat && this.interactiveRepeat.active) {
      const ayahDuration = deck.duration || 4.0;
      const pauseDuration = Math.max(3.0, ayahDuration * (this.interactiveRepeat.multiplier || 1.0));

      this.interactiveRepeat.isWaiting = true;
      if (this.onInteractiveRepeatPause) {
        this.onInteractiveRepeatPause(pauseDuration, this.currentSurah, this.currentAyah);
      }

      this.interactiveRepeat.timerId = setTimeout(() => {
        this.interactiveRepeat.isWaiting = false;
        this.interactiveRepeat.timerId = null;
        if (this.onInteractiveRepeatResume) {
          this.onInteractiveRepeatResume(this.currentSurah, this.currentAyah);
        }

        const r = this.interactiveRepeat;
        if (this.currentAyah < r.toAyah) {
          this.playAyah(this.currentSurah, this.currentAyah + 1, this.currentReciter, false);
        } else {
          // انتهاء النطاق المحدد: معاودة التلاوة من آية البداية لتثبيت الحفظ
          this.playAyah(this.currentSurah, r.fromAyah, this.currentReciter, false);
        }
      }, pauseDuration * 1000);

      return;
    }

    // 0. معالجة ختام السورة الكاملة في نمط التدفق المستمر (Surah Streaming Mode)
    if (this.mode === 'surah') {
      if (this.loopState && this.loopState.active && this.loopState.type === 'SURAH') {
        if (this.loopState.currentLoop < this.loopState.totalLoops) {
          this.loopState.currentLoop++;
          if (this.onRepeat) {
            this.onRepeat(this.loopState.currentLoop, this.loopState.totalLoops, this.loopState);
          }
          this.activeDeck.currentTime = 0;
          this.activeDeck.play().catch(e => console.warn('[DualPlayer] Replay surah error:', e));
          return;
        } else {
          // اكتملت دورات تكرار السورة كاملة
          const finishedLoop = { ...this.loopState };
          this.clearLoop();
          if (this.onLoopFinished) this.onLoopFinished(finishedLoop);
          this.isPlaying = false;
          if (this.onPlayStateChange) this.onPlayStateChange(false);
          return;
        }
      }

      const nextSurah = SURAHS.find(s => s.id === this.currentSurah.id + 1);
      if (nextSurah) {
        this.playSurahStream(nextSurah, this.currentReciter);
      } else {
        this.isPlaying = false;
        if (this.onPlayStateChange) this.onPlayStateChange(false);
        if (this.onQuranFinished) this.onQuranFinished();
      }
      return;
    }

    // 1. معالجة تكرار الآية الحالية (Single Ayah Loop)
    if (this.loopState && this.loopState.active && this.loopState.type === 'CURRENT_AYAH') {
      if (this.loopState.currentLoop < this.loopState.totalLoops) {
        this.loopState.currentLoop++;
        if (this.onRepeat) {
          this.onRepeat(this.loopState.currentLoop, this.loopState.totalLoops, this.loopState);
        }
        this.activeDeck.currentTime = 0;
        this.activeDeck.play().catch(e => console.warn('[DualPlayer] Replay error:', e));
        return;
      } else {
        const finishedLoop = { ...this.loopState };
        this.clearLoop();
        if (this.onLoopFinished) this.onLoopFinished(finishedLoop);
        this.executeGaplessSwitch();
        return;
      }
    }

    // للتوافق مع التكرار الكلاسيكي
    if (this.currentRepeat < this.repeatCount) {
      this.currentRepeat++;
      if (this.onRepeat) {
        this.onRepeat(this.currentRepeat, this.repeatCount, null);
      }
      this.activeDeck.currentTime = 0;
      this.activeDeck.play().catch(e => console.warn('[DualPlayer] Replay error:', e));
      return;
    }
    this.currentRepeat = 1;
    this.repeatCount = 1;

    // 2. معالجة تكرار نطاق من الآيات (Range Loop) لحلقات الحفظ والتثبيت
    if (this.loopState && this.loopState.active && this.loopState.type === 'RANGE') {
      if (this.currentAyah >= this.loopState.toAyah) {
        if (this.loopState.currentLoop < this.loopState.totalLoops) {
          this.loopState.currentLoop++;
          if (this.onRepeat) {
            this.onRepeat(this.loopState.currentLoop, this.loopState.totalLoops, this.loopState);
          }
          // التحويل الفوري للمشغل الاحتياطي الذي يحتوي بالفعل على آية البداية (0ms Gapless Loop)
          this.executeGaplessSwitch();
          return;
        } else {
          // اكتملت جميع دورات التكرار المحددة للنطاق
          const finishedLoop = { ...this.loopState };
          this.clearLoop();
          if (this.onLoopFinished) this.onLoopFinished(finishedLoop);
          this.executeGaplessSwitch();
          return;
        }
      }
      this.executeGaplessSwitch();
      return;
    }

    // 2. فحص إذا كان الاستماع لباقة موضوعية أو قصة قرآنية
    if (this.topicPlaylist && this.topicPlaylist.length > 0) {
      if (this.topicIndex < this.topicPlaylist.length - 1) {
        const nextPassage = this.topicPlaylist[this.topicIndex + 1];

        // إذا كانت قفزة لموضع جديد أو سورة أخرى: إطلاق الفاصل الصوتي التنبيهي للمستخدم
        if (nextPassage.isJump !== false) {
          this.topicIndex++;
          if (this.onTopicTransition) {
            this.onTopicTransition(nextPassage, this.topicIndex, this.topicPlaylist.length);
          }
          return;
        }

        // أما إذا كانت الآيات متصلة في نفس المشهد: تلاوة مرسلة فورية 0ms بدون أدنى فاصل!
        this.executeGaplessSwitch();
        return;
      } else {
        // ختام القصة أو الباقة
        this.isPlaying = false;
        if (this.onPlayStateChange) this.onPlayStateChange(false);
        if (this.onQuranFinished) this.onQuranFinished();
        return;
      }
    }

    // 3. التبديل الفوري للمشغل الاحتياطي في التلاوة العادية (0ms Gapless Transition)
    this.executeGaplessSwitch();
  }

  // تنفيذ الانتقال اللحظي للمشغل المزدوج
  executeGaplessSwitch() {
    const nextTrack = this.computeNextTrack();

    if (!nextTrack) {
      // انتهت آخر آية في التلاوة
      this.isPlaying = false;
      if (this.onPlayStateChange) this.onPlayStateChange(false);
      if (this.onQuranFinished) this.onQuranFinished();
      return;
    }

    if (this.topicPlaylist && this.topicPlaylist.length > 0) {
      this.topicIndex++;
    }

    // تبديل المشغلين (Ping-Pong Swap)
    const oldActive = this.activeDeck;
    this.activeDeck = this.standbyDeck;
    this.standbyDeck = oldActive;
    this.activeDeckName = (this.activeDeckName === 'A') ? 'B' : 'A';
    this.standbyTrack = null; // تفريغ المؤشر ليتم تجهيز الآية التالية فوراً دون تطابق زائف

    // تحديث الحالة
    this.currentSurah = nextTrack.surah;
    this.currentAyah = nextTrack.ayah;

    // إذا كان المشغل الاحتياطي يحتوي على نفس الرابط جاهزاً، يعزف فوراً!
    // وإن لم يكن جاهزاً لسبب طارئ، يتم تعيين المصدر ثم التشغيل
    if (!this.activeDeck.src || !this.activeDeck.src.includes(nextTrack.filename)) {
      this.activeDeck.src = nextTrack.url;
    }

    try {
      this.activeDeck.currentTime = 0;
    } catch (e) {}

    this.activeDeck.volume = this.volume;
    if (this.playbackRate && this.playbackRate !== 1.0) {
      this.activeDeck.playbackRate = this.playbackRate;
    }
    const playPromise = this.activeDeck.play();

    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('[DualPlayer] Seamless play error, retrying:', err);
        this.activeDeck.src = nextTrack.url;
        this.activeDeck.play().catch(() => {});
      });
    }

    // إشعار الواجهة بتغير الآية بسلاسة
    if (this.onAyahChange) {
      this.onAyahChange(this.currentSurah, this.currentAyah, this.currentReciter, true);
    }

    this.updateMediaSession();

    // تجهيز المشغل الاحتياطي (الذي أصبح حراً الآن) بالآية التالية (مع مراعاة التكرار والحلقات)
    const trackAfterNext = this.computeNextTrack();
    this.prepareStandby(trackAfterNext);

    // تحديث طابور التحميل المسبق للـ 5 آيات في الخلفية
    this.prefetchUpcoming(this.prefetchCount);
  }

  // تشغيل سورة كاملة بتدفق متصل متزامن مع الآيات المكتوبة (0ms Gapless Playback)
  playSurahStream(surah, reciter = null) {
    this.mode = 'ayah';
    this.topicPlaylist = [];
    this.topicIndex = 0;
    if (!this.loopState || this.loopState.type !== 'SURAH') {
      this.clearLoop();
    }

    if (reciter) this.currentReciter = reciter;
    this.currentSurah = surah || this.currentSurah;
    this.currentAyah = 1;

    // تشغيل السورة آية بآية بالتبديل اللحظي التبادلي المستمر بين المشغلين (0ms Gapless Playback)
    // لضمان التزامن الكامل بين الآية المقروءة والآية المكتوبة بالرسم العثماني وعرض التفسير
    this.playAyah(this.currentSurah, 1, this.currentReciter, true);
  }

  // تشغيل آية محددة
  playAyah(surah, ayah, reciter = null, isManual = false) {
    this.mode = 'ayah';
    if (reciter) this.currentReciter = reciter;
    this.currentSurah = surah;
    this.currentAyah = ayah;

    const folder = this.getEffectiveFolder(this.currentReciter);
    const url = getAyahAudioUrl(folder, surah.id, ayah);
    const filename = `${String(surah.id).padStart(3, '0')}${String(ayah).padStart(3, '0')}.mp3`;

    // إذا كانت الآية المطلوبة هي المحملة بالفعل في الـ standbyDeck
    if (this.standbyTrack && 
        this.standbyTrack.surah.id === surah.id && 
        this.standbyTrack.ayah === ayah && 
        this.standbyTrack.reciter.id === this.currentReciter.id) {
      
      // تبديل فوري مباشرة
      const oldActive = this.activeDeck;
      oldActive.pause();
      oldActive.currentTime = 0;

      this.activeDeck = this.standbyDeck;
      this.standbyDeck = oldActive;
      this.activeDeckName = (this.activeDeckName === 'A') ? 'B' : 'A';
      this.standbyTrack = null;
    } else {
      // تحميل عادي في المشغل النشط
      this.activeDeck.src = url;
      this.activeDeck.preload = this.isSaverMode ? 'metadata' : 'auto';
    }

    // تفعيل أذونات الصوت للمشغل الاحتياطي في المتصفحات المحمولة (Mobile Audio Unlock)
    this.unlockMobileAudio();

    this.activeDeck.volume = this.volume;
    if (this.playbackRate && this.playbackRate !== 1.0) {
      this.activeDeck.playbackRate = this.playbackRate;
    }
    this.isPlaying = true;

    this.activeDeck.play().catch(err => {
      console.warn('[DualPlayer] Play blocked or network delay:', err);
      this.isPlaying = false;
      if (this.onPlayStateChange) this.onPlayStateChange(false);
    });

    if (this.onPlayStateChange) this.onPlayStateChange(true);
    if (this.onAyahChange) {
      this.onAyahChange(this.currentSurah, this.currentAyah, this.currentReciter, !isManual);
    }

    this.updateMediaSession();

    // تجهيز المشغل الاحتياطي بالآية التالية فوراً
    const nextTrack = this.computeNextTrack();
    this.prepareStandby(nextTrack);

    // سحب الـ 5 آيات القادمة في الكاش في الخلفية
    this.prefetchUpcoming(this.prefetchCount);
  }

  // تجهيز المشغل الثاني (Standby Deck) مسبقاً
  prepareStandby(track) {
    if (!track) {
      this.standbyTrack = null;
      return;
    }

    // إذا كان محملاً بنفس الملف بالفعل، لا داعي لإعادة الطلب
    if (this.standbyTrack && 
        this.standbyTrack.surah.id === track.surah.id && 
        this.standbyTrack.ayah === track.ayah &&
        this.standbyTrack.reciter.id === track.reciter.id) {
      return;
    }

    this.standbyTrack = track;
    this.standbyDeck.src = track.url;
    this.standbyDeck.preload = this.isSaverMode ? 'metadata' : 'auto';
    this.standbyDeck.volume = this.volume;
    this.standbyDeck.load(); // فك التشفير والتخزين في ذاكرة المتصفح مسبقاً
  }

  // إلغاء أي مهام تحميل مسبق جارية للآيات في الخلفية
  abortLookahead() {
    if (this.prefetchAbortController) {
      try {
        this.prefetchAbortController.abort();
      } catch (e) {
        // تجاهل
      }
      this.prefetchAbortController = null;
    }
  }

  // سحب الآيات القادمة وتخزينها في الكاش المسبق (Background Lookahead Buffer)
  async prefetchUpcoming(count = 5) {
    const effectiveCount = this.isSaverMode ? Math.min(1, count) : count;
    this.abortLookahead();
    this.prefetchAbortController = new AbortController();
    const signal = this.prefetchAbortController.signal;

    // استخراج قائمة الآيات التالية وفق الحد المسموح
    const upcoming = this.getUpcomingTracksList(effectiveCount);
    if (upcoming.length === 0) return;

    for (const track of upcoming) {
      if (signal.aborted) break;
      try {
        if ('caches' in window) {
          const cache = await caches.open(this.audioCacheName);
          const cached = await cache.match(track.url);
          if (!cached) {
            const resp = await fetch(track.url, { mode: 'cors', signal });
            if (resp.ok) {
              await cache.put(track.url, resp);
            }
          }
        } else {
          // المتصفحات التي لا تدعم CacheStorage مباشرة
          await fetch(track.url, { mode: 'cors', cache: 'force-cache', signal });
        }
      } catch (err) {
        // يتم تجاهل أخطاء التخزين المؤقت في الخلفية دون تعطيل القراءة
      }
    }
  }

  // استخراج قائمة المسارات القادمة
  getUpcomingTracksList(count = 5) {
    const list = [];
    const folder = this.getEffectiveFolder(this.currentReciter);
    let curS = this.currentSurah;
    let curA = this.currentAyah;

    // في حال كانت باقة موضوعية
    if (this.topicPlaylist && this.topicPlaylist.length > 0) {
      for (let i = 1; i <= count; i++) {
        const nextIndex = this.topicIndex + i;
        if (nextIndex < this.topicPlaylist.length) {
          const p = this.topicPlaylist[nextIndex];
          list.push({
            surah: p.surah,
            ayah: p.ayahNumber,
            reciter: this.currentReciter,
            url: getAyahAudioUrl(folder, p.surah.id, p.ayahNumber)
          });
        }
      }
      return list;
    }

    // في حال تكرار نطاق آيات (حلقات الحفظ)
    if (this.loopState && this.loopState.active && this.loopState.type === 'RANGE') {
      const s = this.loopState.surah;
      let nextA = curA;
      for (let i = 1; i <= count; i++) {
        if (nextA < this.loopState.toAyah) {
          nextA++;
        } else {
          nextA = this.loopState.fromAyah;
        }
        list.push({
          surah: s,
          ayah: nextA,
          reciter: this.currentReciter,
          url: getAyahAudioUrl(folder, s.id, nextA)
        });
      }
      return list;
    }

    // في التلاوة العادية
    for (let i = 1; i <= count; i++) {
      if (curA < curS.ayahs) {
        curA++;
      } else {
        const nextIdx = SURAHS.findIndex(s => s.id === curS.id) + 1;
        if (nextIdx < SURAHS.length) {
          curS = SURAHS[nextIdx];
          curA = 1;
        } else {
          break; // نهاية المصحف
        }
      }
      list.push({
        surah: curS,
        ayah: curA,
        reciter: this.currentReciter,
        url: getAyahAudioUrl(folder, curS.id, curA)
      });
    }

    return list;
  }

  // حساب الآية التالية مباشرة
  computeNextTrack() {
    const folder = this.getEffectiveFolder(this.currentReciter);

    if (this.topicPlaylist && this.topicPlaylist.length > 0) {
      if (this.topicIndex < this.topicPlaylist.length - 1) {
        const nextP = this.topicPlaylist[this.topicIndex + 1];
        return {
          surah: nextP.surah,
          ayah: nextP.ayahNumber,
          reciter: this.currentReciter,
          url: getAyahAudioUrl(folder, nextP.surah.id, nextP.ayahNumber),
          filename: `${String(nextP.surah.id).padStart(3, '0')}${String(nextP.ayahNumber).padStart(3, '0')}.mp3`,
          isJump: nextP.isJump,
          sceneTitle: nextP.sceneTitle,
          passageLabel: nextP.passageLabel,
          storyName: nextP.storyName,
          label: nextP.label
        };
      }
      return null;
    }

    // فحص وضع تكرار النطاق (Range Loop) لحلقات الحفظ والتثبيت
    if (this.loopState && this.loopState.active && this.loopState.type === 'RANGE') {
      const s = this.loopState.surah;
      if (this.currentAyah < this.loopState.toAyah) {
        const nextAyah = this.currentAyah + 1;
        return {
          surah: s,
          ayah: nextAyah,
          reciter: this.currentReciter,
          url: getAyahAudioUrl(folder, s.id, nextAyah),
          filename: `${String(s.id).padStart(3, '0')}${String(nextAyah).padStart(3, '0')}.mp3`
        };
      } else {
        // وصلنا لآخر آية في النطاق!
        // إذا كان هناك دورة تكرار قادمة، نجهز آية البداية في المشغل الاحتياطي فوراً (0ms Gapless Loop)
        if (this.loopState.currentLoop < this.loopState.totalLoops) {
          const startAyah = this.loopState.fromAyah;
          return {
            surah: s,
            ayah: startAyah,
            reciter: this.currentReciter,
            url: getAyahAudioUrl(folder, s.id, startAyah),
            filename: `${String(s.id).padStart(3, '0')}${String(startAyah).padStart(3, '0')}.mp3`,
            isLoopReset: true
          };
        } else {
          // انتهت كل دورات التكرار: نحسب الآية التي تلي النطاق
          return this.computeTrackAfter(s, this.loopState.toAyah);
        }
      }
    }

    // فحص تكرار السورة آية بآية
    if (this.loopState && this.loopState.active && this.loopState.type === 'SURAH' && this.mode === 'ayah') {
      const s = this.loopState.surah;
      if (this.currentAyah < s.ayahs) {
        const nextAyah = this.currentAyah + 1;
        return {
          surah: s,
          ayah: nextAyah,
          reciter: this.currentReciter,
          url: getAyahAudioUrl(folder, s.id, nextAyah),
          filename: `${String(s.id).padStart(3, '0')}${String(nextAyah).padStart(3, '0')}.mp3`
        };
      } else {
        if (this.loopState.currentLoop < this.loopState.totalLoops) {
          return {
            surah: s,
            ayah: 1,
            reciter: this.currentReciter,
            url: getAyahAudioUrl(folder, s.id, 1),
            filename: `${String(s.id).padStart(3, '0')}001.mp3`,
            isLoopReset: true
          };
        } else {
          return this.computeTrackAfter(s, s.ayahs);
        }
      }
    }

    return this.computeTrackAfter(this.currentSurah, this.currentAyah);
  }

  // ترخيص تشغيل المشغل الثاني في خلفية الهواتف الذكية (Mobile Gesture Audio Unlock)
  unlockMobileAudio() {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      this.standbyDeck.volume = 0;
      const p = this.standbyDeck.play();
      if (p !== undefined) {
        p.then(() => {
          this.standbyDeck.pause();
          this.standbyDeck.currentTime = 0;
          this.standbyDeck.volume = this.volume;
        }).catch(() => {
          this.standbyDeck.volume = this.volume;
        });
      }
    } catch (e) {
      this.standbyDeck.volume = this.volume;
    }
  }

  // حساب المسار الذي يلي سورة وآية محددتين
  computeTrackAfter(surah, ayah) {
    const folder = this.getEffectiveFolder(this.currentReciter);

    // في حال كانت باقة موضوعية أو قصة قرآنية: نأخذ الآية التالية لما يعزف الآن
    if (this.topicPlaylist && this.topicPlaylist.length > 0) {
      const nextNextIdx = this.topicIndex + 1;
      if (nextNextIdx < this.topicPlaylist.length) {
        const p = this.topicPlaylist[nextNextIdx];
        return {
          surah: p.surah,
          ayah: p.ayahNumber,
          reciter: this.currentReciter,
          url: getAyahAudioUrl(folder, p.surah.id, p.ayahNumber),
          filename: `${String(p.surah.id).padStart(3, '0')}${String(p.ayahNumber).padStart(3, '0')}.mp3`,
          isJump: p.isJump,
          sceneTitle: p.sceneTitle,
          passageLabel: p.passageLabel,
          storyName: p.storyName,
          label: p.label
        };
      }
      return null;
    }

    let nextS = surah;
    let nextA = ayah;

    if (nextA < nextS.ayahs) {
      nextA++;
    } else {
      const nextIdx = SURAHS.findIndex(s => s.id === nextS.id) + 1;
      if (nextIdx < SURAHS.length) {
        nextS = SURAHS[nextIdx];
        nextA = 1;
      } else {
        return null; // نهاية القرآن
      }
    }

    return {
      surah: nextS,
      ayah: nextA,
      reciter: this.currentReciter,
      url: getAyahAudioUrl(folder, nextS.id, nextA),
      filename: `${String(nextS.id).padStart(3, '0')}${String(nextA).padStart(3, '0')}.mp3`
    };
  }

  // تشغيل أو استئناف
  play() {
    if (!this.activeDeck.src || this.activeDeck.src === window.location.href) {
      this.mode = 'ayah';
      this.playAyah(this.currentSurah, this.currentAyah, this.currentReciter);
    } else {
      this.activeDeck.play();
      this.isPlaying = true;
      if (this.onPlayStateChange) this.onPlayStateChange(true);
    }
  }

  // إيقاف مؤقت
  pause() {
    this.clearInteractiveRepeatTimer();
    if (this.deckA) {
      try { this.deckA.pause(); } catch (e) {}
    }
    if (this.deckB) {
      try { this.deckB.pause(); } catch (e) {}
    }
    if (this.activeDeck) {
      try { this.activeDeck.pause(); } catch (e) {}
    }
    this.isPlaying = false;
    if (this.onPlayStateChange) this.onPlayStateChange(false);
  }

  // تبديل التشغيل والإيقاف
  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  // ضبط مستوى الصوت للمشغلين معاً
  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.deckA.volume = this.volume;
    this.deckB.volume = this.volume;
  }

  getVolume() {
    return this.volume;
  }

  // الحصول على مجلد القارئ المعتمد (مع دعم الجودة الاقتصادية تلقائياً في وضع التوفير)
  getEffectiveFolder(reciter = this.currentReciter) {
    return getEffectiveReciterFolder(reciter, this.isSaverMode);
  }

  // تفعيل أو تعطيل وضع توفير استهلاك البيانات الذكي (SoundCloud Data Saver)
  setSaverMode(enabled) {
    this.isSaverMode = Boolean(enabled);
    this.prefetchCount = this.isSaverMode ? 1 : 5;
    const preloadVal = this.isSaverMode ? 'metadata' : 'auto';
    if (this.deckA) this.deckA.preload = preloadVal;
    if (this.deckB) this.deckB.preload = preloadVal;
    return this.isSaverMode;
  }

  getSaverMode() {
    return Boolean(this.isSaverMode);
  }

  // ضبط سرعة القراءة والتلاوة (Playback Rate)
  setPlaybackRate(rate) {
    this.playbackRate = Math.max(0.5, Math.min(2.0, rate));
    if (this.deckA) this.deckA.playbackRate = this.playbackRate;
    if (this.deckB) this.deckB.playbackRate = this.playbackRate;
    return this.playbackRate;
  }

  getPlaybackRate() {
    return this.playbackRate || 1.0;
  }

  // التقديم والترجيع اللحظي بالثواني
  seekRelative(seconds) {
    if (this.activeDeck && !isNaN(this.activeDeck.duration)) {
      const dur = this.activeDeck.duration;
      const cur = this.activeDeck.currentTime || 0;
      const target = Math.max(0, Math.min(dur, cur + seconds));
      this.activeDeck.currentTime = target;
      return target;
    }
    return 0;
  }

  getCurrentTime() {
    return this.activeDeck ? this.activeDeck.currentTime : 0;
  }

  getDuration() {
    return this.activeDeck ? this.activeDeck.duration : 0;
  }

  // الانتقال للآية السابقة
  prev() {
    this.mode = 'ayah';

    // إذا كان في حلقة حفظ (Range Loop) وضغط السابق يدوياً
    if (this.loopState && this.loopState.active && this.loopState.type === 'RANGE') {
      if (this.currentAyah > this.loopState.fromAyah) {
        this.playAyah(this.loopState.surah, this.currentAyah - 1, this.currentReciter, true);
      } else {
        this.playAyah(this.loopState.surah, this.loopState.fromAyah, this.currentReciter, true);
      }
      return;
    }

    if (this.topicPlaylist && this.topicPlaylist.length > 0) {
      if (this.topicIndex > 0) {
        this.topicIndex--;
        const p = this.topicPlaylist[this.topicIndex];
        this.playAyah(p.surah, p.ayahNumber, this.currentReciter, true);
        return;
      }
    }

    let prevS = this.currentSurah;
    let prevA = this.currentAyah;

    if (prevA > 1) {
      prevA--;
    } else {
      const prevIdx = SURAHS.findIndex(s => s.id === prevS.id) - 1;
      if (prevIdx >= 0) {
        prevS = SURAHS[prevIdx];
        prevA = prevS.ayahs;
      }
    }

    this.playAyah(prevS, prevA, this.currentReciter, true);
  }

  // الانتقال للآية التالية
  next() {
    this.mode = 'ayah';

    // إذا كان في حلقة حفظ (Range Loop) وضغط التالي يدوياً
    if (this.loopState && this.loopState.active && this.loopState.type === 'RANGE') {
      if (this.currentAyah < this.loopState.toAyah) {
        this.playAyah(this.loopState.surah, this.currentAyah + 1, this.currentReciter, true);
        return;
      } else {
        if (this.loopState.currentLoop < this.loopState.totalLoops) {
          this.loopState.currentLoop++;
          if (this.onRepeat) this.onRepeat(this.loopState.currentLoop, this.loopState.totalLoops, this.loopState);
          this.playAyah(this.loopState.surah, this.loopState.fromAyah, this.currentReciter, true);
          return;
        } else {
          const finishedLoop = { ...this.loopState };
          this.clearLoop();
          if (this.onLoopFinished) this.onLoopFinished(finishedLoop);
          const trackAfter = this.computeTrackAfter(this.currentSurah, this.currentAyah);
          if (trackAfter) this.playAyah(trackAfter.surah, trackAfter.ayah, this.currentReciter, true);
          return;
        }
      }
    }

    if (this.topicPlaylist && this.topicPlaylist.length > 0) {
      if (this.topicIndex < this.topicPlaylist.length - 1) {
        this.topicIndex++;
        const p = this.topicPlaylist[this.topicIndex];
        this.playAyah(p.surah, p.ayahNumber, this.currentReciter, true);
        return;
      }
    }

    const nextTrack = this.computeNextTrack();
    if (nextTrack) {
      this.playAyah(nextTrack.surah, nextTrack.ayah, this.currentReciter, true);
    }
  }

  // دعم أزرار التحكم في شاشة القفل وإشعارات النظام (MediaSession API)
  updateMediaSession() {
    if ('mediaSession' in navigator && this.currentSurah && this.currentReciter) {
      try {
        const title = this.mode === 'surah'
          ? `سورة ${this.currentSurah.name} (تلاوة متدفقة مستمرة)`
          : `سورة ${this.currentSurah.name} - الآية ${this.currentAyah}`;

        navigator.mediaSession.metadata = new MediaMetadata({
          title: title,
          artist: `الشيخ ${this.currentReciter.name}`,
          album: 'المصحف الصوتي الميسر',
          artwork: [
            { src: 'icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
            { src: 'icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' }
          ]
        });

        navigator.mediaSession.setActionHandler('play', () => this.play());
        navigator.mediaSession.setActionHandler('pause', () => this.pause());
        navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
        navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
      } catch (e) {
        // بعض المتصفحات القديمة قد لا تدعم جميع أفعال MediaSession
      }
    }
  }

  // ==================== منظومة إدارة التكرار وحلقات التحفيظ ====================

  // تفعيل تكرار نطاق من الآيات للحفظ والتثبيت (Range Loop)
  setLoopRange(surah, fromAyah, toAyah, totalLoops = 3) {
    let s = surah || this.currentSurah;
    let fA = Math.max(1, Math.min(Number(fromAyah) || 1, s.ayahs));
    let tA = Math.max(1, Math.min(Number(toAyah) || fA, s.ayahs));
    if (fA > tA) { const tmp = fA; fA = tA; tA = tmp; }

    this.mode = 'ayah';
    this.topicPlaylist = [];
    this.topicIndex = 0;
    this.repeatCount = 1;
    this.currentRepeat = 1;

    this.loopState = {
      active: true,
      type: 'RANGE',
      surah: s,
      fromAyah: fA,
      toAyah: tA,
      totalLoops: Math.max(1, totalLoops),
      currentLoop: 1
    };

    // البدء فوراً بآية البداية في النطاق
    this.playAyah(s, fA, this.currentReciter, true);
  }

  // تفعيل تكرار سورة كاملة (Surah Loop)
  setLoopSurah(surah, totalLoops = 3) {
    let s = surah || this.currentSurah;
    this.topicPlaylist = [];
    this.topicIndex = 0;
    this.repeatCount = 1;
    this.currentRepeat = 1;

    this.loopState = {
      active: true,
      type: 'SURAH',
      surah: s,
      fromAyah: 1,
      toAyah: s.ayahs,
      totalLoops: Math.max(1, totalLoops),
      currentLoop: 1
    };

    // تشغيل السورة كاملة بنمط التدفق السريع
    this.playSurahStream(s, this.currentReciter);
  }

  // تفعيل تكرار الآية الحالية فقط (Current Ayah Loop)
  setLoopAyah(totalLoops = 3) {
    this.loopState = {
      active: true,
      type: 'CURRENT_AYAH',
      surah: this.currentSurah,
      fromAyah: this.currentAyah,
      toAyah: this.currentAyah,
      totalLoops: Math.max(1, totalLoops),
      currentLoop: 1
    };
    this.repeatCount = totalLoops;
    this.currentRepeat = 1;
    this.playAyah(this.currentSurah, this.currentAyah, this.currentReciter, true);
  }

  // إلغاء أي تكرار نشط ومتابعة التلاوة الطبيعية
  clearLoop() {
    this.clearInteractiveRepeatTimer();
    this.cancelMemoryPrompt();
    this.loopState = {
      active: false,
      type: null,
      surah: null,
      fromAyah: 1,
      toAyah: 1,
      totalLoops: 1,
      currentLoop: 1
    };
    this.repeatCount = 1;
    this.currentRepeat = 1;
  }

  // تفعيل أو تعطيل وضع المصحف المعلم التفاعلي (Listen & Repeat Mode)
  setInteractiveRepeat(active, options = {}) {
    this.clearInteractiveRepeatTimer();
    this.cancelMemoryPrompt();
    this.interactiveRepeat = {
      active: !!active,
      multiplier: options.multiplier || 1.0,
      isWaiting: false,
      timerId: null,
      surah: options.surah || this.currentSurah,
      fromAyah: options.fromAyah || 1,
      toAyah: options.toAyah || (options.surah ? options.surah.ayahs : this.currentSurah.ayahs)
    };
    if (active) {
      this.playAyah(this.interactiveRepeat.surah, this.interactiveRepeat.fromAyah, options.reciter || this.currentReciter, true);
    }
  }

  clearInteractiveRepeatTimer() {
    if (this.interactiveRepeat && this.interactiveRepeat.timerId) {
      clearTimeout(this.interactiveRepeat.timerId);
      this.interactiveRepeat.timerId = null;
      this.interactiveRepeat.isWaiting = false;
    }
  }

  skipInteractiveRepeatPause() {
    if (this.interactiveRepeat && this.interactiveRepeat.isWaiting) {
      this.clearInteractiveRepeatTimer();
      if (this.onInteractiveRepeatResume) {
        this.onInteractiveRepeatResume(this.currentSurah, this.currentAyah);
      }
      const r = this.interactiveRepeat;
      if (this.currentAyah < r.toAyah) {
        this.playAyah(this.currentSurah, this.currentAyah + 1, this.currentReciter, false);
      } else {
        this.playAyah(this.currentSurah, r.fromAyah, this.currentReciter, false);
      }
    }
  }

  // بدء اختبار الذاكرة واسترجاع الحفظ (Blind Memory Prompt)
  startMemoryPrompt(surah = null, ayah = null, reciter = null) {
    this.clearInteractiveRepeatTimer();
    this.clearLoop();
    const targetSurah = surah || this.currentSurah;
    const targetAyah = ayah || (surah ? 1 : this.currentAyah);

    this.memoryPrompt = {
      active: true,
      triggered: false,
      surah: targetSurah,
      ayah: targetAyah,
      pauseTime: 0
    };

    this.playAyah(targetSurah, targetAyah, reciter || this.currentReciter, true);
  }

  // إكمال الآية وسماع باقي التلاوة للتأكد من صحة الحفظ
  revealMemoryPrompt() {
    if (this.memoryPrompt && this.memoryPrompt.active && this.memoryPrompt.triggered) {
      this.memoryPrompt.active = false;
      this.memoryPrompt.triggered = false;
      this.activeDeck.play().catch(e => console.warn('[DualPlayer] Resume memory prompt error:', e));
      this.isPlaying = true;
      if (this.onPlayStateChange) this.onPlayStateChange(true);
      if (this.onMemoryPromptRevealed) {
        this.onMemoryPromptRevealed(this.currentSurah, this.currentAyah);
      }
    }
  }

  cancelMemoryPrompt() {
    if (this.memoryPrompt) {
      this.memoryPrompt.active = false;
      this.memoryPrompt.triggered = false;
    }
  }
}
