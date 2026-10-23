/**
 * المحرك الرئيسي لتطبيق المصحف الصوتي الميسر
 * يدمج مشغل الصوت، الأوامر الصوتية، الإيماءات، والاتصال بقاعدة البيانات
 */

import { SURAHS, RECITERS, getAyahAudioUrl } from './quran-data.js';
import { DualQuranPlayer } from './dual-player.js';
import { 
  parseVoiceCommand, 
  normalizeArabic, 
  cleanQuranicTranscript, 
  pickBestAlternative, 
  isThematicQuery 
} from './voice-engine.js';
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
    this.speechLang = localStorage.getItem('speech_lang') || 'ar-EG'; // الافتراضي اللهجة المصرية

    // مشغل الصوت المزدوج والتعرف الصوتي
    this.player = null;
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
      adminBanner: document.getElementById('adminBanner'),
      dialectToggleBtn: document.getElementById('dialectToggleBtn'),
      dialectFlag: document.getElementById('dialectFlag'),
      dialectLabel: document.getElementById('dialectLabel'),
      adminGearBtn: document.getElementById('adminGearBtn'),
      adminPinModal: document.getElementById('adminPinModal'),
      adminModalPinInput: document.getElementById('adminModalPinInput'),
      adminModalPinError: document.getElementById('adminModalPinError'),
      adminModalSubmitBtn: document.getElementById('adminModalSubmitBtn'),
      adminModalCancelBtn: document.getElementById('adminModalCancelBtn')
    };

    this.init();
  }

  async init() {
    this.initAudioPlayer();
    this.initSpeechRecognition();
    this.initTouchGestures();
    this.initAdminLongPress();
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
    this.player = new DualQuranPlayer({
      initialSurah: this.currentSurah,
      initialAyah: this.currentAyah,
      initialReciter: this.currentReciter,
      prefetchCount: 5
    });

    // عند تغير الآية (تبديل فوري 0ms بين المشغلين أو انتقال يدوي)
    this.player.onAyahChange = (surah, ayah, reciter, isAutoTransition) => {
      this.currentSurah = surah;
      this.currentAyah = ayah;
      this.currentReciter = reciter;
      this.isPlaying = true;
      if (this.player.topicPlaylist && this.player.topicPlaylist.length > 0) {
        this.topicIndex = this.player.topicIndex;
      }

      recordAyahListened();
      this.flushListeningTime();
      saveLastPosition(this.currentSurah, this.currentAyah, this.currentReciter.id);

      this.updateUI();

      // اهتزاز لمسي صامت فقط عند النقر اليدوي، بدون أي نغمة صوتية تزعج التلاوة
      if (!isAutoTransition) {
        sound.playAyahTick(false);
      }
    };

    // متابعة وقت الاستماع وتحديث شريط التقدم
    this.player.onTimeUpdate = (currentTime, duration, percent) => {
      if (this.dom.progressBar) {
        this.dom.progressBar.style.width = `${percent}%`;
      }
    };

    // متابعة حالة التشغيل والإيقاف لمؤقت الإحصائيات والأزرار
    this.player.onPlayStateChange = (playing) => {
      this.isPlaying = playing;
      this.updateUI();
      if (playing) {
        this.startListeningTimer();
      } else {
        this.stopListeningTimer(true);
      }
    };

    // عند تكرار الآية
    this.player.onRepeat = (currentRepeat, repeatCount) => {
      this.dom.voiceStatus.textContent = `تكرار الآية (${currentRepeat}/${repeatCount})`;
    };

    // عند الانتقال لموضع جديد في باقة البحث الموضوعي أو قصة قرآنية
    this.player.onTopicTransition = (nextPassage, index, total) => {
      this.currentSurah = nextPassage.surah;
      this.currentAyah = nextPassage.ayahNumber;
      this.updateUI();

      // إطلاق نغمة الفاصل التنبيهي (صوت قطرة الندى الفاصلة)
      sound.playTopicTransitionTone();

      const sceneLabel = nextPassage.sceneTitle ? `مشهد جديد: ${nextPassage.sceneTitle} • ` : '';
      const passageInfo = nextPassage.passageLabel ? ` (${nextPassage.passageLabel})` : ` (${index + 1}/${total})`;
      this.dom.voiceStatus.textContent = `انتقال لموضع جديد: ${sceneLabel}سورة ${nextPassage.surah.name} آية ${nextPassage.ayahNumber}${passageInfo}`;

      // مهلة 700ms ليميز المستمع الفاصل بين المشاهد والمواضع غير المتتالية
      setTimeout(() => {
        this.player.playAyah(nextPassage.surah, nextPassage.ayahNumber, this.currentReciter, false);
      }, 700);
    };

    // عند ختام السورة أو المصحف
    this.player.onQuranFinished = () => {
      this.currentSurah = SURAHS[0];
      this.currentAyah = 1;
      this.isPlaying = false;
      this.updateUI();
      sound.speak("ختمت السورة بحمد الله");
    };

    // معالجة الأخطاء
    this.player.onError = (e) => {
      console.warn('[App] Playback error caught:', e);
      sound.playErrorChime();
      this.dom.voiceStatus.textContent = 'جاري إعادة المحاولة...';
    };

    window.addEventListener('beforeunload', () => {
      this.flushListeningTime();
    });
  }

  startListeningTimer() {
    this.stopListeningTimer(false);
    this.listeningTimer = setInterval(() => {
      if (this.isPlaying && this.player && this.player.isPlaying) {
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
    this.recognition.lang = this.speechLang;
    this.recognition.continuous = false;
    this.recognition.interimResults = true; // إظهار الكلمات لحظياً أثناء النطق
    this.recognition.maxAlternatives = 5;   // جلب 5 احتمالات للمفاضلة واختيار السورة الصحيحة

    this.recognition.onstart = () => {
      this.isListening = true;
      this.dom.micBtn.classList.add('mic-active');
      this.dom.voiceStatus.textContent = 'أنا أستمع إليك الآن... تحدث';
      this.dom.voiceTranscript.textContent = '';
      sound.vibrate([60]);
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i];
        if (res.isFinal) {
          finalTranscript = pickBestAlternative(res) || res[0].transcript;
        } else {
          interimTranscript += res[0].transcript;
        }
      }

      // إظهار الكلمات المنطوقة لحظة بلحظة مع تصحيح الألفاظ القرآنية
      if (interimTranscript) {
        const cleanedInterim = cleanQuranicTranscript(interimTranscript);
        this.dom.voiceTranscript.textContent = `🎤 "${cleanedInterim}"`;
        this.dom.voiceStatus.textContent = 'جاري الاستماع...';
      }

      // عند اكتمال نطق الجملة
      if (finalTranscript) {
        const cleanedFinal = cleanQuranicTranscript(finalTranscript);
        this.dom.voiceTranscript.textContent = `"${cleanedFinal}"`;
        this.executeVoiceCommand(cleanedFinal);
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      this.isListening = false;
      this.dom.micBtn.classList.remove('mic-active');
      if (event.error !== 'no-speech') {
        sound.playErrorChime();
        this.dom.voiceStatus.textContent = 'لم أتمكن من سماعك بوضوح، اضغط وتحدث ثانية';
      } else {
        this.dom.voiceStatus.textContent = 'اضغط مطولاً على الشاشة أو انقر الميكروفون';
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.dom.micBtn.classList.remove('mic-active');
    };
  }

  // معالجة وتنفيذ الأمر الصوتي
  async executeVoiceCommand(transcript) {
    const cleaned = cleanQuranicTranscript(transcript);
    console.log('Voice Command Input:', cleaned);

    // 1. المسار فائق السرعة اللحظي (Fast-Path 0ms): فحص المحرك المحلي أولاً بدون انتظار الشبكة
    const localParsed = parseVoiceCommand(cleaned);

    // إذا كان أمراً مباشراً معلوماً محلياً أو باقة مدمجة لموضوع شائع: نفذه فوراً!
    if (localParsed && localParsed.intent !== 'UNKNOWN' && localParsed.intent !== 'EMPTY' && localParsed.intent !== 'THEMATIC_QUERY') {
      console.log('Executed via Instant Local Fast-Path (0ms):', localParsed);
      this.dom.voiceTranscript.textContent = `"${cleaned}"`;
      this.dispatchVoiceResult(localParsed, cleaned);
      return;
    }

    // 2. إذا كان بحثاً موضوعياً عاماً أو أمراً معقداً غير معروف محلياً: الذكاء الاصطناعي Gemini AI
    this.dom.voiceStatus.textContent = 'جاري البحث الذكي بالذكاء الاصطناعي...';
    
    try {
      const geminiParsed = await parseWithGemini(cleaned, {
        currentSurah: this.currentSurah,
        currentAyah: this.currentAyah,
        currentReciter: this.currentReciter
      });

      if (geminiParsed && geminiParsed.intent !== 'UNKNOWN') {
        console.log('Executed via Gemini AI:', geminiParsed);
        this.dom.voiceTranscript.textContent = `✨ "${cleaned}"`;
        this.dispatchVoiceResult(geminiParsed, cleaned);
        return;
      }
    } catch (e) {
      console.warn('Gemini query error, falling back:', e);
    }

    // 3. التراجع الآمن في حال تعذر اتصال الذكاء الاصطناعي
    if (localParsed && localParsed.intent !== 'UNKNOWN' && localParsed.intent !== 'THEMATIC_QUERY') {
      this.dispatchVoiceResult(localParsed, cleaned);
    } else {
      sound.playErrorChime();
      sound.speak('لم أتمكن من فهم طلبك، يرجى تحديد اسم السورة أو الموضوع بوضوح');
      this.dom.voiceStatus.textContent = 'لم يتم التعرف على الطلب، اضغط للتحدث ثانية';
      logVoiceCommand(cleaned, localParsed || { intent: 'UNKNOWN' }, false);
    }
  }

  // تنفيذ نتيجة التحليل الصوتي وتوجيه المشغل
  dispatchVoiceResult(parsed, transcript) {
    let success = true;

    switch (parsed.intent) {
      case 'PLAY_STORY':
        this.topicPlaylist = parsed.payload.passages || [];
        this.topicIndex = 0;
        if (parsed.payload.reciter) {
          this.currentReciter = parsed.payload.reciter;
        }
        if (this.topicPlaylist.length > 0) {
          const first = this.topicPlaylist[0];
          this.currentSurah = first.surah;
          this.currentAyah = first.ayahNumber;
          const storyName = parsed.payload.story?.name || parsed.payload.topic || 'القصة القرآنية';
          const scene = first.sceneTitle ? ` (${first.sceneTitle})` : '';
          this.dom.voiceStatus.textContent = `📖 ${storyName}${scene}`;
        } else {
          this.currentSurah = parsed.payload.surah;
          this.currentAyah = parsed.payload.ayahNumber;
          this.dom.voiceStatus.textContent = parsed.message;
        }
        sound.playSuccessChime();
        this.playCurrentAyah();
        break;

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

      case 'VOLUME_MAX':
        if (this.player) this.player.setVolume(1.0);
        if (sound.playVolumeTone) sound.playVolumeTone(1.0);
        sound.speak('تم رفع الصوت لأقصى درجة');
        this.dom.voiceStatus.textContent = 'مستوى الصوت: 100%';
        break;

      case 'VOLUME_UP':
        if (this.player) {
          const newVol = Math.min(1.0, +(this.player.getVolume() + 0.2).toFixed(2));
          this.player.setVolume(newVol);
          if (sound.playVolumeTone) sound.playVolumeTone(newVol);
          const pct = Math.round(newVol * 100);
          sound.speak(`مستوى الصوت ${pct} بالمئة`);
          this.dom.voiceStatus.textContent = `مستوى الصوت: ${pct}%`;
        }
        break;

      case 'VOLUME_DOWN':
        if (this.player) {
          const newVol = Math.max(0.1, +(this.player.getVolume() - 0.2).toFixed(2));
          this.player.setVolume(newVol);
          if (sound.playVolumeTone) sound.playVolumeTone(newVol);
          const pct = Math.round(newVol * 100);
          sound.speak(`مستوى الصوت ${pct} بالمئة`);
          this.dom.voiceStatus.textContent = `مستوى الصوت: ${pct}%`;
        }
        break;

      case 'VOLUME_MUTE':
        if (this.player) this.player.setVolume(0);
        if (sound.playVolumeTone) sound.playVolumeTone(0);
        sound.speak('تم كتم الصوت');
        this.dom.voiceStatus.textContent = 'الصوت صامت';
        break;

      case 'OPEN_ADMIN':
        sound.playErrorChime();
        sound.speak('صفحة الإدارة محمية برمز مرور سري، يمكن الوصول إليها فقط بالضغط المطول على الترس');
        this.dom.voiceStatus.textContent = '🔒 الإدارة محمية برمز سري (اضغط مطولاً على الترس)';
        this.openAdminPinModal();
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

  // تشغيل الآية الحالية بالصوت عبر المشغل المزدوج بدون فواصل (Gapless Playback)
  playCurrentAyah() {
    this.isPlaying = true;
    if (this.player) {
      this.player.topicPlaylist = this.topicPlaylist || [];
      this.player.topicIndex = this.topicIndex || 0;
      this.player.repeatCount = this.repeatCount;
      this.player.currentRepeat = this.currentRepeat;
      this.player.playAyah(this.currentSurah, this.currentAyah, this.currentReciter, true);
    }
    this.updateUI();
    saveLastPosition(this.currentSurah, this.currentAyah, this.currentReciter.id);
  }

  play() {
    if (this.player) {
      this.player.play();
    }
    this.isPlaying = true;
    this.updateUI();
  }

  pause() {
    if (this.player) {
      this.player.pause();
    }
    this.isPlaying = false;
    this.updateUI();
  }

  togglePlayPause() {
    if (this.player) {
      this.player.togglePlayPause();
      this.isPlaying = this.player.isPlaying;
    } else {
      this.isPlaying = !this.isPlaying;
    }
    this.updateUI();
  }

  nextAyah(autoPlay = false) {
    if (this.dom.voiceStatus) {
      this.dom.voiceStatus.textContent = 'الآية التالية';
    }
    if (this.player) {
      this.player.next();
    }
  }

  prevAyah(autoPlay = false) {
    if (this.dom.voiceStatus) {
      this.dom.voiceStatus.textContent = 'الآية السابقة';
    }
    if (this.player) {
      this.player.prev();
    }
  }

  startListening() {
    if (!this.recognition) return;

    // Toggle: إذا كان الميكروفون يستمع بالفعل، نوقفه
    if (this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {}
      return;
    }

    // إيقاف مؤقت لأي تلاوة جارية فوراً لمنع تداخل صوت القارئ مع لاقط الصوت
    if (this.isPlaying && this.player && this.player.isPlaying) {
      this.player.pause();
    }

    // عزف نغمة التنبيه أولاً قبل فتح الميكروفون
    sound.playListeningChime();

    // تشغيل الميكروفون بعد انتهاء النغمة لتفادي التقاط صوتها في الميكروفون
    setTimeout(() => {
      try {
        this.recognition.start();
      } catch (e) {
        console.warn('Recognition start error:', e);
      }
    }, 220);
  }

  // نظام إيماءات اللمس للمكفوفين (Touch Gestures) المتجاوب على كامل شاشات الهواتف
  initTouchGestures() {
    const area = document.body;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let longPressTimer = null;
    let lastTapTime = 0;

    area.addEventListener('touchstart', (e) => {
      // إذا كان اللمس على عنصر تحكم تفاعلي مباشر نتركه يتفاعل طبيعياً
      if (e.target.closest('button, select, input, a, #adminModalPinInput, #closeTafsirBtn')) {
        return;
      }

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

  // نظام الضغط المطول الحصري على الترس لفتح نافذة كلمة مرور الإدارة (1153)
  initAdminLongPress() {
    const gearBtn = this.dom.adminGearBtn;
    const modal = this.dom.adminPinModal;
    const pinInput = this.dom.adminModalPinInput;
    const pinError = this.dom.adminModalPinError;
    const submitBtn = this.dom.adminModalSubmitBtn;
    const cancelBtn = this.dom.adminModalCancelBtn;

    if (!gearBtn || !modal) return;

    let pressTimer = null;
    let isLongPressTriggered = false;
    const LONG_PRESS_DURATION = 1400; // 1.4 ثانية ضغط مستمر

    const startPress = () => {
      isLongPressTriggered = false;
      gearBtn.classList.add('scale-110', 'text-amber-400');
      
      pressTimer = setTimeout(() => {
        isLongPressTriggered = true;
        gearBtn.classList.remove('scale-110', 'text-amber-400');
        sound.vibrate([100, 50, 100]);
        sound.playListeningChime();
        this.openAdminPinModal();
      }, LONG_PRESS_DURATION);
    };

    const cancelPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      gearBtn.classList.remove('scale-110', 'text-amber-400');
    };

    // منع النقر العادي السريع
    gearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    // أحداث اللمس على الهواتف والأجهزة الذكية
    gearBtn.addEventListener('touchstart', (e) => {
      startPress();
    }, { passive: true });

    gearBtn.addEventListener('touchend', (e) => {
      cancelPress();
      if (isLongPressTriggered) {
        e.preventDefault();
      }
    });

    gearBtn.addEventListener('touchcancel', cancelPress);

    // أحداث الفأرة للكمبيوتر والمتصفحات العادية
    gearBtn.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // الزر الأيسر للفأرة فقط
        startPress();
      }
    });

    gearBtn.addEventListener('mouseup', cancelPress);
    gearBtn.addEventListener('mouseleave', cancelPress);

    // التحقق من رمز المرور 1153 عند التأكيد
    const handleVerifyPin = () => {
      const entered = pinInput ? pinInput.value.trim() : '';
      if (entered === '1153') {
        sessionStorage.setItem('quran_admin_auth', 'true');
        localStorage.setItem('quran_admin_auth', 'true');
        sound.playSuccessChime();
        sound.speak('تم التحقق بنجاح، جاري فتح لوحة الإدارة');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        setTimeout(() => {
          window.location.href = 'admin.html';
        }, 500);
      } else {
        sound.playErrorChime();
        if (pinError) {
          pinError.textContent = 'رمز المرور غير صحيح';
          pinError.classList.remove('hidden');
        }
        if (pinInput) {
          pinInput.value = '';
          pinInput.focus();
        }
      }
    };

    if (submitBtn) {
      submitBtn.addEventListener('click', handleVerifyPin);
    }

    if (pinInput) {
      pinInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleVerifyPin();
      });
    }

    // إغلاق النافذة
    const closeModal = () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      if (pinInput) pinInput.value = '';
      if (pinError) pinError.classList.add('hidden');
    };

    if (cancelBtn) {
      cancelBtn.addEventListener('click', closeModal);
    }

    // إغلاق عند النقر في الخلفية المظلمة
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  openAdminPinModal() {
    if (!this.dom.adminPinModal) return;
    this.dom.adminPinModal.classList.remove('hidden');
    this.dom.adminPinModal.classList.add('flex');
    if (this.dom.adminModalPinError) {
      this.dom.adminModalPinError.classList.add('hidden');
    }
    if (this.dom.adminModalPinInput) {
      this.dom.adminModalPinInput.value = '';
      setTimeout(() => {
        this.dom.adminModalPinInput.focus();
      }, 150);
    }
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

    if (this.player) {
      this.player.currentSurah = this.currentSurah;
      this.player.currentAyah = this.currentAyah;
      this.player.currentReciter = this.currentReciter;
      this.player.prepareStandby(this.player.computeNextTrack());
      this.player.prefetchUpcoming(5);
    }
  }

  syncFromFirebaseUser(user) {
    // إمكانية استرجاع موضع التلاوة المحفوظ في السحابة
    if (user && user.lastPosition && user.lastPosition.surahId) {
      const foundSurah = SURAHS.find(s => s.id === user.lastPosition.surahId);
      if (foundSurah) {
        this.currentSurah = foundSurah;
        this.currentAyah = user.lastPosition.ayahNumber || 1;
        if (this.player) {
          this.player.currentSurah = this.currentSurah;
          this.player.currentAyah = this.currentAyah;
          this.player.prepareStandby(this.player.computeNextTrack());
          this.player.prefetchUpcoming(5);
        }
        this.updateUI();
      }
    }
  }

  updateUI() {
    if (this.dom.surahName) this.dom.surahName.textContent = `سورة ${this.currentSurah.name}`;

    // إذا كان التشغيل ضمن قصة قرآنية مرتبة زمنياً أو باقة موضوعية
    if (this.topicPlaylist && this.topicPlaylist.length > 0 && this.topicIndex >= 0 && this.topicIndex < this.topicPlaylist.length) {
      const passage = this.topicPlaylist[this.topicIndex];
      const storyTitle = passage.storyName ? `قصة ${passage.storyName} • ` : '';
      const scene = passage.passageLabel || passage.sceneTitle || '';
      if (this.dom.surahMeta) {
        this.dom.surahMeta.textContent = `${storyTitle}${scene ? scene + ' • ' : ''}سورة ${this.currentSurah.name} (${this.topicIndex + 1} من ${this.topicPlaylist.length})`;
      }
      if (this.dom.ayahBadge) {
        this.dom.ayahBadge.textContent = `الآية ${this.currentAyah}`;
      }
    } else {
      if (this.dom.surahMeta) this.dom.surahMeta.textContent = `${this.currentSurah.type} • ${this.currentSurah.ayahs} آية`;
      if (this.dom.ayahBadge) this.dom.ayahBadge.textContent = `الآية ${this.currentAyah}`;
    }

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

    if (this.dom.dialectToggleBtn) {
      this.dom.dialectToggleBtn.addEventListener('click', () => this.toggleSpeechLang());
      this.updateDialectUI();
    }
  }

  toggleSpeechLang() {
    this.speechLang = (this.speechLang === 'ar-EG') ? 'ar-SA' : 'ar-EG';
    localStorage.setItem('speech_lang', this.speechLang);
    if (this.recognition) {
      this.recognition.lang = this.speechLang;
    }
    this.updateDialectUI();
    const name = this.speechLang === 'ar-EG' ? 'اللهجة المصرية' : 'العربية الفصحى';
    sound.speak(`تم التحويل إلى ${name}`);
    this.dom.voiceStatus.textContent = `لغة التعرف الصوتي: ${name}`;
  }

  updateDialectUI() {
    const isEg = this.speechLang === 'ar-EG';
    if (this.dom.dialectFlag) {
      this.dom.dialectFlag.textContent = isEg ? '🇪🇬' : '🇸🇦';
    }
    if (this.dom.dialectLabel) {
      this.dom.dialectLabel.textContent = isEg ? 'مصرية' : 'فصحى';
    }
    if (this.dom.dialectToggleBtn) {
      this.dom.dialectToggleBtn.title = isEg 
        ? 'التعرف الصوتي: اللهجة المصرية (انقر للتحويل إلى الفصحى)' 
        : 'التعرف الصوتي: العربية الفصحى (انقر للتحويل للمصرية)';
    }
  }
}

// تشغيل التطبيق بمجرد اكتمال تحميل الصفحة
window.addEventListener('DOMContentLoaded', () => {
  window.quranApp = new QuranVoiceApp();
});
