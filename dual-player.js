/**
 * مشغل القرآن الكريم المزدوج (Dual-Deck Quran Audio Engine)
 * يوفر تلاوة مرسلة خاشعة متصلة بدون أدنى سكتات أو فواصل (Gapless Playback)
 * مع نظام تخزين مؤقت استباقي في الخلفية (Lookahead Buffer) للـ 5 آيات القادمة
 */

import { SURAHS, getAyahAudioUrl } from './quran-data.js';

export class DualQuranPlayer {
  constructor(options = {}) {
    // مشغلا الصوت التبادليان (Deck A & Deck B)
    this.deckA = new Audio();
    this.deckB = new Audio();

    this.deckA.preload = 'auto';
    this.deckB.preload = 'auto';

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
    this.repeatCount = 1;
    this.currentRepeat = 1;

    // قوائم التشغيل الموضوعية
    this.topicPlaylist = [];
    this.topicIndex = 0;

    // حالة المسار المحمل في المشغل الاحتياطي
    this.standbyTrack = null;

    // إعدادات التحميل المسبق
    this.prefetchCount = options.prefetchCount || 5;
    this.audioCacheName = 'quran-audio-cache';
    this.prefetchAbortController = null;

    // مسارات ردود الفعل (Callbacks)
    this.onAyahChange = null;        // (surah, ayah, reciter, isAutoTransition)
    this.onTimeUpdate = null;        // (currentTime, duration, percent)
    this.onPlayStateChange = null;   // (isPlaying)
    this.onRepeat = null;           // (currentRepeat, repeatCount)
    this.onQuranFinished = null;    // ()
    this.onError = null;            // (error, track)
    this.onTopicTransition = null;  // (passage, index, total)

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

    // 1. معالجة تكرار الآية إن كان مفعلاً
    if (this.currentRepeat < this.repeatCount) {
      this.currentRepeat++;
      if (this.onRepeat) {
        this.onRepeat(this.currentRepeat, this.repeatCount);
      }
      this.activeDeck.currentTime = 0;
      this.activeDeck.play().catch(e => console.warn('[DualPlayer] Replay error:', e));
      return;
    }

    this.currentRepeat = 1;
    this.repeatCount = 1;

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

    // تجهيز المشغل الاحتياطي (الذي أصبح حراً الآن) بالآية التالية لما بعد الحالية
    const trackAfterNext = this.computeTrackAfter(nextTrack.surah, nextTrack.ayah);
    this.prepareStandby(trackAfterNext);

    // تحديث طابور التحميل المسبق للـ 5 آيات في الخلفية
    this.prefetchUpcoming(this.prefetchCount);
  }

  // تشغيل آية محددة
  playAyah(surah, ayah, reciter = null, isManual = false) {
    if (reciter) this.currentReciter = reciter;
    this.currentSurah = surah;
    this.currentAyah = ayah;

    const url = getAyahAudioUrl(this.currentReciter.folder, surah.id, ayah);
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
      this.activeDeck.preload = 'auto';
    }

    // تفعيل أذونات الصوت للمشغل الاحتياطي في المتصفحات المحمولة (Mobile Audio Unlock)
    this.unlockMobileAudio();

    this.activeDeck.volume = this.volume;
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
    this.standbyDeck.preload = 'auto';
    this.standbyDeck.volume = this.volume;
    this.standbyDeck.load(); // فك التشفير والتخزين في ذاكرة المتصفح مسبقاً
  }

  // سحب الـ 5 آيات القادمة وتخزينها في الكاش المسبق (Background Lookahead Buffer)
  async prefetchUpcoming(count = 5) {
    if (this.prefetchAbortController) {
      this.prefetchAbortController.abort();
    }
    this.prefetchAbortController = new AbortController();
    const signal = this.prefetchAbortController.signal;

    // استخراج قائمة الآيات الخمس التالية
    const upcoming = this.getUpcomingTracksList(count);
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
            url: getAyahAudioUrl(this.currentReciter.folder, p.surah.id, p.ayahNumber)
          });
        }
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
        url: getAyahAudioUrl(this.currentReciter.folder, curS.id, curA)
      });
    }

    return list;
  }

  // حساب الآية التالية مباشرة
  computeNextTrack() {
    if (this.topicPlaylist && this.topicPlaylist.length > 0) {
      if (this.topicIndex < this.topicPlaylist.length - 1) {
        const nextP = this.topicPlaylist[this.topicIndex + 1];
        return {
          surah: nextP.surah,
          ayah: nextP.ayahNumber,
          reciter: this.currentReciter,
          url: getAyahAudioUrl(this.currentReciter.folder, nextP.surah.id, nextP.ayahNumber),
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
    // في حال كانت باقة موضوعية أو قصة قرآنية: نأخذ الآية التالية لما يعزف الآن
    if (this.topicPlaylist && this.topicPlaylist.length > 0) {
      const nextNextIdx = this.topicIndex + 1;
      if (nextNextIdx < this.topicPlaylist.length) {
        const p = this.topicPlaylist[nextNextIdx];
        return {
          surah: p.surah,
          ayah: p.ayahNumber,
          reciter: this.currentReciter,
          url: getAyahAudioUrl(this.currentReciter.folder, p.surah.id, p.ayahNumber),
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
      url: getAyahAudioUrl(this.currentReciter.folder, nextS.id, nextA),
      filename: `${String(nextS.id).padStart(3, '0')}${String(nextA).padStart(3, '0')}.mp3`
    };
  }

  // تشغيل أو استئناف
  play() {
    if (!this.activeDeck.src || this.activeDeck.src === window.location.href) {
      this.playAyah(this.currentSurah, this.currentAyah, this.currentReciter);
    } else {
      this.activeDeck.play();
      this.isPlaying = true;
      if (this.onPlayStateChange) this.onPlayStateChange(true);
    }
  }

  // إيقاف مؤقت
  pause() {
    this.activeDeck.pause();
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

  getCurrentTime() {
    return this.activeDeck ? this.activeDeck.currentTime : 0;
  }

  getDuration() {
    return this.activeDeck ? this.activeDeck.duration : 0;
  }

  // الانتقال للآية السابقة
  prev() {
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

  // الانتقال للآية التالية يدوياً
  next() {
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
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `سورة ${this.currentSurah.name} - الآية ${this.currentAyah}`,
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
}
