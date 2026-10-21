/**
 * المحرك الرئيسي لتطبيق المصحف الصوتي الميسر
 * يدمج مشغل الصوت، الأوامر الصوتية، الإيماءات، والاتصال بقاعدة البيانات
 */

import { SURAHS, RECITERS, getAyahAudioUrl } from './quran-data.js';
import { parseVoiceCommand, normalizeArabic } from './voice-engine.js';
import { parseWithGemini } from './gemini-service.js';
import { sound } from './sound-effects.js';
import { 
  initUserSession, 
  saveLastPosition, 
  logVoiceCommand, 
  recordAyahListened,
  recordListeningTime,
  listenForAdminBroadcast 
} from './firebase-config.js';

class QuranVoiceApp {
  constructor() {
    // الحالة الأساسية
    this.currentSurah = SURAHS[0]; // الفاتحة
    this.currentAyah = 1;
    this.currentReciter = RECITERS[0]; // الحصري
    this.isPlaying = false;
    this.isListening = false;
    this.repeatCount = 1; // كم مرة تكرر الآية
    this.currentRepeat = 1;
    this.topicPlaylist = []; // قائمة الآيات في البحث الموضوعي
    this.topicIndex = 0; // مؤشر الآية الحالية في الموضوع
    this.accumulatedSeconds = 0; // ثواني الاستماع المتراكمة
    this.listeningTimer = null;

    // عناصر الصوت والتعرف الصوتي
    this.audioPlayer = new Audio();
    this.preloadPlayer = new Audio();
    this.recognition = null;

    // عناصر الواجهة
    this.dom = {
      surahName: document.getElementById('surahName'),
      surahMeta: document.getElementById('surahMeta'),
      ayahBadge: document.getElementById('ayahBadge'),
      reciterName: document.getElementById('reciterName'),
      playBtn: document.getElementById('playBtn'),
      micBtn: document.getElementById('micBtn'),
      prevBtn: document.getElementById('prevBtn'),
      nextBtn: document.getElementById('nextBtn'),
      voiceStatus: document.getElementById('voiceStatus'),
      voiceTranscript: document.getElementById('voiceTranscript'),
      progressBar: document.getElementById('progressBar'),
      reciterSelect: document.getElementById('reciterSelect'),
      surahSelect: document.getElementById('surahSelect'),
      gestureArea: document.getElementById('gestureArea'),
      tafsirModal: document.getElementById('tafsirModal'),
      tafsirText: document.getElementById('tafsirText'),
      closeTafsirBtn: document.getElementById('closeTafsirBtn'),
      adminBanner: document.getElementById('adminBanner')
    };

    this.init();
  }

  async init() {
    this.initAudioPlayer();
    this.initSpeechRecognition();
    this.initTouchGestures();
    this.populateSelectors();
    this.bindEvents();

    // استعادة آخر جلسة محلية
    this.restoreLocalPosition();

    // تهيئة جلسة Firebase
    initUserSession((user) => {
      console.log('Firebase session ready for user:', user.uid);
      this.syncFromFirebaseUser(user);
    });

    // الاستماع لإعلانات وتنبيهات الأدمن
    listenForAdminBroadcast((broadcast) => {
      this.handleAdminBroadcast(broadcast);
    });

    this.updateUI();
  }

  // ملء القوائم المنسدلة للمساعدين ومرافقي كبار السن
  populateSelectors() {
    if (this.dom.surahSelect) {
      this.dom.surahSelect.innerHTML = SURAHS.map(s => 
        `<option value="${s.id}">${s.id}. سورة ${s.name} (${s.ayahs} آية)</option>`
      ).join('');
    }

    if (this.dom.reciterSelect) {
      this.dom.reciterSelect.innerHTML = RECITERS.map(r => 
        `<option value="${r.id}">الشيخ ${r.name} (${r.subname})</option>`
      ).join('');
    }
  }

  initAudioPlayer() {
    this.audioPlayer.preload = 'auto';

    // عند انتهاء الآية الحالية
    this.audioPlayer.addEventListener('ended', () => {
      recordAyahListened();
      this.flushListeningTime();

      if (this.currentRepeat < this.repeatCount) {
        this.currentRepeat++;
        this.dom.voiceStatus.textContent = `تكرار الآية (${this.currentRepeat}/${this.repeatCount})`;
        this.audioPlayer.currentTime = 0;
        this.audioPlayer.play();
        return;
      }

      this.currentRepeat = 1;
      this.repeatCount = 1; // إعادة الضبط بعد التكرار

      // فحص إذا كان المستخدم يستمع لباقة آيات موضوعية من مواضع أو سور مختلفة
      if (this.topicPlaylist && this.topicPlaylist.length > 0 && this.topicIndex < this.topicPlaylist.length - 1) {
        this.topicIndex++;
        const nextPassage = this.topicPlaylist[this.topicIndex];
        this.currentSurah = nextPassage.surah;
        this.currentAyah = nextPassage.ayahNumber;
        this.updateUI();

        // إطلاق صوت البيب / قطرة الندى الفاصلة بين المواضع القرآنية
        sound.playTopicTransitionTone();
        this.dom.voiceStatus.textContent = `انتقال لموضع جديد: سورة ${nextPassage.surah.name} آية ${nextPassage.ayahNumber} (${this.topicIndex + 1}/${this.topicPlaylist.length})`;

        // مهلة 700ms ليسمع المستخدم الصوت الفاصل بوضوح قبل بدء الآية التالية
        setTimeout(() => {
          this.playCurrentAyah();
        }, 700);
        return;
      }

      // إذا انتهت باقة الموضوع أو كانت تلاوة عادية متتالية
      this.nextAyah(true);
    });

    // متابعة وقت الاستماع وتحديث شريط التقدم
    this.audioPlayer.addEventListener('timeupdate', () => {
      if (this.audioPlayer.duration) {
        const percent = (this.audioPlayer.currentTime / this.audioPlayer.duration) * 100;
        if (this.dom.progressBar) {
          this.dom.progressBar.style.width = `${percent}%`;
        }
      }
    });

    // تسجيل مؤقت وقت الاستماع الفعلي
    this.audioPlayer.addEventListener('play', () => {
      this.startListeningTimer();
    });
    this.audioPlayer.addEventListener('pause', () => {
      this.stopListeningTimer(true);
    });
    window.addEventListener('beforeunload', () => {
      this.flushListeningTime();
    });

    // معالجة الأخطاء والتبديل التلقائي
    this.audioPlayer.addEventListener('error', (e) => {
      console.warn('Audio playback error, trying next source:', e);
      sound.playErrorChime();
      this.dom.voiceStatus.textContent = 'جاري إعادة المحاولة...';
    });
  }

  startListeningTimer() {
    this.stopListeningTimer(false);
    this.listeningTimer = setInterval(() => {
      if (this.isPlaying && !this.audioPlayer.paused) {
        this.accumulatedSeconds += 5;
        if (this.accumulatedSeconds >= 25) {
          this.flushListeningTime();
        }
      }
    }, 5000);
  }

  stopListeningTimer(flush = true) {
    if (this.listeningTimer) {
      clearInterval(this.listeningTimer);
      this.listeningTimer = null;
    }
    if (flush) {
      this.flushListeningTime();
    }
  }

  flushListeningTime() {
    if (this.accumulatedSeconds > 0) {
      recordListeningTime(this.accumulatedSeconds);
      this.accumulatedSeconds = 0;
    }
  }

  initSpeechRecognition() {
    const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechClass) {
      console.warn('Web Speech API is not supported in this browser.');
      this.dom.voiceStatus.textContent = 'الميكروفون متاح عبر متصفحات Chrome و Safari الحديثة';
      return;
    }

    this.recognition = new SpeechClass();
    this.recognition.lang = 'ar-SA';
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.dom.micBtn.classList.add('mic-active');
      this.dom.voiceStatus.textContent = 'أنا أستمع إليك الآن... تحدث';
      this.dom.voiceTranscript.textContent = '';
      sound.playListeningChime();
    };

    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      this.dom.voiceTranscript.textContent = `"${transcript}"`;
      this.executeVoiceCommand(transcript);
    };

    this.recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      this.isListening = false;
      this.dom.micBtn.classList.remove('mic-active');
      if (event.error !== 'no-speech') {
        sound.playErrorChime();
        this.dom.voiceStatus.textContent = 'لم أتمكن من سماعك بوضوح، اضغط وتحدث ثانية';
      } else {
        this.dom.voiceStatus.textContent = 'اضغط مطولاً على الشاشة للتحدث';
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.dom.micBtn.classList.remove('mic-active');
    };
  }

  // معالجة وتنفيذ الأمر الصوتي
  async executeVoiceCommand(transcript) {
    this.dom.voiceStatus.textContent = 'جاري الفهم بالذكاء الاصطناعي...';
    
    // استدعاء Gemini مع التراجع التلقائي للمحرك المحلي عند الحاجة
    const parsed = await parseWithGemini(transcript, {
      currentSurah: this.currentSurah,
      currentAyah: this.currentAyah,
      currentReciter: this.currentReciter
    });
    console.log('Voice Command Parsed:', parsed);

    if (parsed.source === 'gemini') {
      this.dom.voiceTranscript.textContent = `✨ "${transcript}"`;
    }

    let success = true;

    switch (parsed.intent) {
      case 'PLAY_TOPIC':
        this.topicPlaylist = parsed.payload.passages || [];
        this.topicIndex = 0;
        if (parsed.payload.reciter) {
          this.currentReciter = parsed.payload.reciter;
        }
        if (this.topicPlaylist.length > 0) {
          const first = this.topicPlaylist[0];
          this.currentSurah = first.surah;
          this.currentAyah = first.ayahNumber;
          this.dom.voiceStatus.textContent = `${parsed.message} (الموضع 1 من ${this.topicPlaylist.length})`;
        } else {
          this.currentSurah = parsed.payload.surah;
          this.currentAyah = parsed.payload.ayahNumber;
          this.dom.voiceStatus.textContent = parsed.message;
        }
        sound.playSuccessChime();
        this.playCurrentAyah();
        break;

      case 'PLAY_SURAH':
        this.topicPlaylist = []; // إلغاء قائمة الموضوع إذا طلب سورة محددة
        this.currentSurah = parsed.payload.surah;
        this.currentAyah = parsed.payload.ayahNumber || 1;
        if (parsed.payload.reciter) {
          this.currentReciter = parsed.payload.reciter;
        }
        this.dom.voiceStatus.textContent = parsed.message;
        sound.playSuccessChime();
        this.playCurrentAyah();
        break;

      case 'PLAY_AYAH':
        this.currentSurah = parsed.payload.surah;
        this.currentAyah = parsed.payload.ayahNumber;
        if (parsed.payload.reciter) {
          this.currentReciter = parsed.payload.reciter;
        }
        this.dom.voiceStatus.textContent = parsed.message;
        sound.playSuccessChime();
        this.playCurrentAyah();
        break;

      case 'SET_RECITER':
        this.currentReciter = parsed.payload.reciter;
        this.dom.voiceStatus.textContent = parsed.message;
        sound.playSuccessChime();
        this.updateUI();
        if (this.isPlaying) {
          this.playCurrentAyah();
        }
        break;

      case 'REPEAT_AYAH':
        this.repeatCount = parsed.payload.times || 3;
        this.currentRepeat = 1;
        this.dom.voiceStatus.textContent = parsed.message;
        sound.playSuccessChime();
        this.playCurrentAyah();
        break;

      case 'PAUSE':
        this.pause();
        this.dom.voiceStatus.textContent = parsed.message;
        sound.playSuccessChime();
        break;

      case 'RESUME':
        this.play();
        this.dom.voiceStatus.textContent = parsed.message;
        sound.playSuccessChime();
        break;

      case 'NEXT_AYAH':
        sound.playSuccessChime();
        this.nextAyah(true);
        break;

      case 'PREV_AYAH':
        sound.playSuccessChime();
        this.prevAyah(true);
        break;

      case 'STATUS_CHECK':
        sound.playSuccessChime();
        const statusMsg = `أنت تستمع إلى سورة ${this.currentSurah.name}، الآية ${this.currentAyah}، بصوت الشيخ ${this.currentReciter.name}`;
        this.dom.voiceStatus.textContent = statusMsg;
        sound.speak(statusMsg);
        break;

      case 'TAFSIR':
        sound.playSuccessChime();
        this.fetchAndShowTafsir();
        break;

      case 'OPEN_ADMIN':
        sound.playSuccessChime();
        sound.speak('جاري فتح لوحة تحكم المشرف');
        this.dom.voiceStatus.textContent = parsed.message;
        setTimeout(() => {
          window.location.href = 'admin.html';
        }, 1200);
        break;

      default:
        success = false;
        sound.playErrorChime();
        this.dom.voiceStatus.textContent = 'عذراً، لم أفهم الأمر. جرب قول: سورة الكهف أو كرر الآية';
        break;
    }

    // تسجيل الأمر الصوتي في Firebase للأدمن لتحسين اللهجات
    logVoiceCommand(transcript, parsed, success);
  }

  // تشغيل الآية الحالية بالصوت
  playCurrentAyah() {
    const url = getAyahAudioUrl(this.currentReciter.folder, this.currentSurah.id, this.currentAyah);
    this.audioPlayer.src = url;
    
    sound.playAyahTick();
    this.isPlaying = true;
    this.updateUI();

    this.audioPlayer.play().catch(err => {
      console.warn('Playback autoplay blocked or network wait:', err);
      this.isPlaying = false;
      this.updateUI();
    });

    // تحميل الآية القادمة مسبقاً (Preloading) لضمان انتقال فوري بلا تقطيع
    this.preloadNextAyah();

    // حفظ الموضع في قاعدة البيانات
    saveLastPosition(this.currentSurah, this.currentAyah, this.currentReciter.id);
  }

  preloadNextAyah() {
    if (this.currentAyah < this.currentSurah.ayahs) {
      const nextUrl = getAyahAudioUrl(this.currentReciter.folder, this.currentSurah.id, this.currentAyah + 1);
      this.preloadPlayer.src = nextUrl;
      this.preloadPlayer.preload = 'auto';
    }
  }

  play() {
    if (!this.audioPlayer.src || this.audioPlayer.src === window.location.href) {
      this.playCurrentAyah();
    } else {
      this.audioPlayer.play();
      this.isPlaying = true;
      this.updateUI();
    }
  }

  pause() {
    this.audioPlayer.pause();
    this.isPlaying = false;
    this.updateUI();
  }

  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  nextAyah(autoPlay = false) {
    // التنقل في مواضع البحث الموضوعي إن وجد
    if (this.topicPlaylist && this.topicPlaylist.length > 0) {
      if (this.topicIndex < this.topicPlaylist.length - 1) {
        this.topicIndex++;
        const nextPassage = this.topicPlaylist[this.topicIndex];
        this.currentSurah = nextPassage.surah;
        this.currentAyah = nextPassage.ayahNumber;
        sound.playTopicTransitionTone();
        this.dom.voiceStatus.textContent = `موضع تالٍ: سورة ${nextPassage.surah.name} آية ${nextPassage.ayahNumber} (${this.topicIndex + 1}/${this.topicPlaylist.length})`;
        if (autoPlay || this.isPlaying) {
          this.playCurrentAyah();
        } else {
          this.updateUI();
        }
        return;
      }
    }

    if (this.currentAyah < this.currentSurah.ayahs) {
      this.currentAyah++;
    } else {
      // الانتقال للسورة التالية
      const nextIndex = SURAHS.findIndex(s => s.id === this.currentSurah.id) + 1;
      if (nextIndex < SURAHS.length) {
        this.currentSurah = SURAHS[nextIndex];
        this.currentAyah = 1;
      } else {
        // انتهى القرآن الكريم كاملاً
        this.currentSurah = SURAHS[0];
        this.currentAyah = 1;
        this.pause();
        sound.speak("ختمت السورة بحمد الله");
        return;
      }
    }
    if (autoPlay || this.isPlaying) {
      this.playCurrentAyah();
    } else {
      this.updateUI();
    }
  }

  prevAyah(autoPlay = false) {
    // التنقل للخلف في مواضع البحث الموضوعي إن وجد
    if (this.topicPlaylist && this.topicPlaylist.length > 0) {
      if (this.topicIndex > 0) {
        this.topicIndex--;
        const prevPassage = this.topicPlaylist[this.topicIndex];
        this.currentSurah = prevPassage.surah;
        this.currentAyah = prevPassage.ayahNumber;
        sound.playTopicTransitionTone();
        this.dom.voiceStatus.textContent = `موضع سابق: سورة ${prevPassage.surah.name} آية ${prevPassage.ayahNumber} (${this.topicIndex + 1}/${this.topicPlaylist.length})`;
        if (autoPlay || this.isPlaying) {
          this.playCurrentAyah();
        } else {
          this.updateUI();
        }
        return;
      }
    }

    if (this.currentAyah > 1) {
      this.currentAyah--;
    } else {
      // الرجوع لآخر آية في السورة السابقة
      const prevIndex = SURAHS.findIndex(s => s.id === this.currentSurah.id) - 1;
      if (prevIndex >= 0) {
        this.currentSurah = SURAHS[prevIndex];
        this.currentAyah = this.currentSurah.ayahs;
      }
    }
    if (autoPlay || this.isPlaying) {
      this.playCurrentAyah();
    } else {
      this.updateUI();
    }
  }

  startListening() {
    if (!this.recognition) return;
    try {
      this.recognition.start();
    } catch (e) {
      // Recognition might already be running
    }
  }

  // نظام إيماءات اللمس للمكفوفين (Touch Gestures)
  initTouchGestures() {
    const area = this.dom.gestureArea || document.body;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let longPressTimer = null;
    let lastTapTime = 0;

    area.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();

      // نقرة مطولة (أكثر من 450ms) = تفعيل الميكروفون فوراً
      longPressTimer = setTimeout(() => {
        sound.vibrate([100]);
        this.startListening();
      }, 450);
    }, { passive: true });

    area.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartX);
      const dy = Math.abs(touch.clientY - touchStartY);
      if (dx > 15 || dy > 15) {
        clearTimeout(longPressTimer);
      }
    }, { passive: true });

    area.addEventListener('touchend', (e) => {
      clearTimeout(longPressTimer);
      const touchEndTime = Date.now();
      const duration = touchEndTime - touchStartTime;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;

      // فحص النقر المزدوج (Double Tap) = تشغيل / إيقاف
      const timeSinceLastTap = touchEndTime - lastTapTime;
      if (timeSinceLastTap < 300 && duration < 250) {
        sound.vibrate([50, 50]);
        this.togglePlayPause();
        lastTapTime = 0;
        return;
      }
      lastTapTime = touchEndTime;

      // إذا كانت سحبة سريعة (Swipe)
      if (Math.abs(deltaX) > 60 && Math.abs(deltaY) < 60) {
        if (deltaX < 0) {
          // سحب لليسار = الآية التالية
          sound.vibrate([40]);
          this.nextAyah(true);
        } else {
          // سحب لليمين = الآية السابقة
          sound.vibrate([40]);
          this.prevAyah(true);
        }
      } else if (Math.abs(deltaY) > 70 && Math.abs(deltaX) < 60) {
        if (deltaY > 0) {
          // سحب لأسفل = تكرار الآية الحالية
          sound.vibrate([60, 40]);
          this.repeatCount = 3;
          this.currentRepeat = 1;
          this.playCurrentAyah();
          sound.speak("تكرار الآية ثلاث مرات");
        } else {
          // سحب لأعلى = معرفة الموضع الحالي
          const status = `سورة ${this.currentSurah.name} الآية ${this.currentAyah}`;
          sound.speak(status);
        }
      }
    }, { passive: true });
  }

  // جلب وقراءة التفسير الميسر
  async fetchAndShowTafsir() {
    this.dom.voiceStatus.textContent = 'جاري جلب التفسير الميسر...';
    try {
      const resp = await fetch(`https://api.alquran.cloud/v1/ayah/${this.currentSurah.id}:${this.currentAyah}/ar.muyassar`);
      const data = await resp.json();
      if (data && data.data && data.data.text) {
        const tafsir = data.data.text;
        this.dom.tafsirText.textContent = tafsir;
        this.dom.tafsirModal.classList.remove('hidden');
        this.dom.voiceStatus.textContent = 'تفسير الآية الميسر';
        sound.speak(tafsir);
      }
    } catch (e) {
      console.warn('Tafsir fetch error:', e);
      sound.speak("عذراً، لم أتمكن من جلب التفسير حالياً");
    }
  }

  handleAdminBroadcast(broadcast) {
    if (!this.dom.adminBanner) return;
    this.dom.adminBanner.textContent = `📢 تنبيه: ${broadcast.message}`;
    this.dom.adminBanner.classList.remove('hidden');
    
    // قراءة صوتية إذا حدد الأدمن ذلك
    if (broadcast.voiceAlert) {
      setTimeout(() => {
        sound.speak(broadcast.message);
      }, 1000);
    }
  }

  restoreLocalPosition() {
    const sId = parseInt(localStorage.getItem('quran_last_surah') || '1', 10);
    const aId = parseInt(localStorage.getItem('quran_last_ayah') || '1', 10);
    const rId = localStorage.getItem('quran_last_reciter') || 'husary';

    const foundSurah = SURAHS.find(s => s.id === sId);
    const foundReciter = RECITERS.find(r => r.id === rId);

    if (foundSurah) this.currentSurah = foundSurah;
    if (aId <= this.currentSurah.ayahs) this.currentAyah = aId;
    if (foundReciter) this.currentReciter = foundReciter;
  }

  syncFromFirebaseUser(user) {
    // إمكانية استرجاع موضع التلاوة المحفوظ في السحابة
    if (user && user.lastPosition && user.lastPosition.surahId) {
      const foundSurah = SURAHS.find(s => s.id === user.lastPosition.surahId);
      if (foundSurah) {
        this.currentSurah = foundSurah;
        this.currentAyah = user.lastPosition.ayahNumber || 1;
        this.updateUI();
      }
    }
  }

  updateUI() {
    if (this.dom.surahName) this.dom.surahName.textContent = `سورة ${this.currentSurah.name}`;
    if (this.dom.surahMeta) this.dom.surahMeta.textContent = `${this.currentSurah.type} • ${this.currentSurah.ayahs} آية`;
    if (this.dom.ayahBadge) this.dom.ayahBadge.textContent = `الآية ${this.currentAyah}`;
    if (this.dom.reciterName) this.dom.reciterName.textContent = `بصوت الشيخ ${this.currentReciter.name}`;

    if (this.dom.playBtn) {
      this.dom.playBtn.innerHTML = this.isPlaying 
        ? `<svg class="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`
        : `<svg class="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
      this.dom.playBtn.setAttribute('aria-label', this.isPlaying ? 'إيقاف مؤقت' : 'تشغيل');
    }

    if (this.dom.surahSelect) this.dom.surahSelect.value = this.currentSurah.id;
    if (this.dom.reciterSelect) this.dom.reciterSelect.value = this.currentReciter.id;
  }

  bindEvents() {
    this.dom.playBtn.addEventListener('click', () => this.togglePlayPause());
    this.dom.prevBtn.addEventListener('click', () => this.prevAyah(true));
    this.dom.nextBtn.addEventListener('click', () => this.nextAyah(true));
    this.dom.micBtn.addEventListener('click', () => this.startListening());

    if (this.dom.surahSelect) {
      this.dom.surahSelect.addEventListener('change', (e) => {
        const selected = SURAHS.find(s => s.id === parseInt(e.target.value, 10));
        if (selected) {
          this.currentSurah = selected;
          this.currentAyah = 1;
          this.playCurrentAyah();
        }
      });
    }

    if (this.dom.reciterSelect) {
      this.dom.reciterSelect.addEventListener('change', (e) => {
        const selected = RECITERS.find(r => r.id === e.target.value);
        if (selected) {
          this.currentReciter = selected;
          this.updateUI();
          if (this.isPlaying) this.playCurrentAyah();
        }
      });
    }

    if (this.dom.closeTafsirBtn) {
      this.dom.closeTafsirBtn.addEventListener('click', () => {
        this.dom.tafsirModal.classList.add('hidden');
      });
    }
  }
}

// تشغيل التطبيق بمجرد اكتمال تحميل الصفحة
window.addEventListener('DOMContentLoaded', () => {
  window.quranApp = new QuranVoiceApp();
});
