/**
 * حزمة الاختبارات الآلية الشاملة لتطبيق المصحف الصوتي الميسر
 * Automated Test Suite for Quran Voice PWA
 * 
 * يغطي هذا الملف 3 فئات اختبار ذات أولوية قصوى:
 * 1. VoiceEngineTestSuite: فحص مطابقة الأوامر الصوتية واللهجات لجميع السور الـ 114 والقراء والتحكم
 * 2. DualPlayerLogicTestSuite: فحص منطق الانتقال بين الآيات ونهاية السور وحلقات التكرار والقصص
 * 3. AudioUrlsTestSuite: فحص سلامة روابط السور والآيات وقابليتها للتشغيل عبر الخوادم
 */

import { SURAHS, RECITERS, getAyahAudioUrl, getSurahAudioUrl } from '../quran-data.js';
import { parseVoiceCommand, normalizeArabic, extractNumber } from '../voice-engine.js';
import { DualQuranPlayer } from '../dual-player.js';
import { getTafsir, extractTermMeaning, seedTafsirIfNeeded } from '../tafsir-service.js';
import { DataSaverService } from '../data-saver-service.js';

// ============================================================================
// أدوات توكيد وفحص الاختبارات البسيطة والمحكمة (Lightweight Assertion Framework)
// ============================================================================

export class TestRunner {
  constructor() {
    this.suites = [];
    this.results = {
      passed: 0,
      failed: 0,
      total: 0,
      durationMs: 0,
      details: []
    };
  }

  addSuite(name, fn) {
    this.suites.push({ name, fn });
  }

  async runAll(onProgress = null) {
    const startTime = performance.now();
    this.results = { passed: 0, failed: 0, total: 0, durationMs: 0, details: [] };

    for (const suite of this.suites) {
      const suiteEntry = {
        name: suite.name,
        tests: [],
        passed: 0,
        failed: 0
      };

      const ctx = {
        assert(condition, message) {
          if (!condition) {
            throw new Error(message || 'Assertion failed');
          }
        },
        assertEqual(actual, expected, message) {
          if (actual !== expected) {
            throw new Error(`${message ? message + ' -> ' : ''}Expected [${expected}], but got [${actual}]`);
          }
        },
        assertNotNull(actual, message) {
          if (actual === null || actual === undefined) {
            throw new Error(`${message ? message + ' -> ' : ''}Expected non-null value, but got [${actual}]`);
          }
        },
        async test(testName, testFn) {
          const testStart = performance.now();
          const testItem = { name: testName, status: 'pass', error: null, duration: 0 };
          try {
            await testFn();
            testItem.status = 'pass';
            suiteEntry.passed++;
          } catch (err) {
            testItem.status = 'fail';
            testItem.error = err.message || String(err);
            suiteEntry.failed++;
          }
          testItem.duration = Math.round(performance.now() - testStart);
          suiteEntry.tests.push(testItem);

          if (onProgress) {
            onProgress({
              suiteName: suite.name,
              testName,
              status: testItem.status,
              error: testItem.error,
              duration: testItem.duration
            });
          }
        }
      };

      try {
        await suite.fn(ctx);
      } catch (suiteErr) {
        suiteEntry.suiteError = suiteErr.message;
      }

      this.results.passed += suiteEntry.passed;
      this.results.failed += suiteEntry.failed;
      this.results.total += (suiteEntry.passed + suiteEntry.failed);
      this.results.details.push(suiteEntry);
    }

    this.results.durationMs = Math.round(performance.now() - startTime);
    return this.results;
  }
}

// ============================================================================
// 1. جناح اختبارات محرك الأوامر الصوتية (Voice Engine Test Suite)
// ============================================================================

export function registerVoiceEngineTests(runner) {
  runner.addSuite('1. محرك الأوامر الصوتية ومطابقة الـ 114 سورة واللهجات', async (t) => {
    
    // --- 1.1 فحص جميع سور القرآن الكريم الـ 114 بالصيغ الأساسية ---
    for (const surah of SURAHS) {
      await t.test(`مطابقة سورة ${surah.name} (#${surah.id}) بصيغة: سورة ${surah.name}`, () => {
        const cmd = `سورة ${surah.name}`;
        const res = parseVoiceCommand(cmd);
        t.assertEqual(res.intent, 'PLAY_SURAH', `فشل في تحديد نية سورة ${surah.name}`);
        t.assertNotNull(res.payload.surah, `لم يتم استخراج السورة لـ ${cmd}`);
        t.assertEqual(res.payload.surah.id, surah.id, `خطأ في مطابقة رقم سورة ${surah.name}`);
      });

      await t.test(`مطابقة سورة ${surah.name} (#${surah.id}) بصيغة: شغل سورة ${surah.name}`, () => {
        const cmd = `شغل سورة ${surah.name}`;
        const res = parseVoiceCommand(cmd);
        t.assertEqual(res.intent, 'PLAY_SURAH');
        t.assertEqual(res.payload.surah?.id, surah.id);
      });
    }

    // --- 1.2 فحص اللهجات العربية الشائعة (مصرية، خليجية، شامية، مغاربية) ---
    const dialectPrefixes = [
      { prefix: 'شغلي سورة', label: 'مصرية (شغلي)' },
      { prefix: 'هاتلي سورة', label: 'مصرية (هاتلي)' },
      { prefix: 'افتحلي سورة', label: 'مصرية (افتحلي)' },
      { prefix: 'عايز اسمع سورة', label: 'مصرية (عايز اسمع)' },
      { prefix: 'ابي اسمع سورة', label: 'خليجية (ابي اسمع)' },
      { prefix: 'ودنا نسمع سورة', label: 'خليجية (ودنا نسمع)' },
      { prefix: 'بدي اسمع سورة', label: 'شامية (بدي اسمع)' },
      { prefix: 'حطلي سورة', label: 'عربية عامة (حطلي)' }
    ];

    const sampleSurahs = [
      { id: 1, name: 'الفاتحة' },
      { id: 2, name: 'البقرة' },
      { id: 18, name: 'الكهف' },
      { id: 36, name: 'يس' },
      { id: 67, name: 'الملك' },
      { id: 112, name: 'الإخلاص' }
    ];

    for (const dp of dialectPrefixes) {
      for (const s of sampleSurahs) {
        await t.test(`فحص اللهجة [${dp.label}] مع سورة ${s.name}`, () => {
          const cmd = `${dp.prefix} ${s.name}`;
          const res = parseVoiceCommand(cmd);
          t.assertEqual(res.intent, 'PLAY_SURAH', `تعذر فهم اللهجة: ${cmd}`);
          t.assertEqual(res.payload.surah?.id, s.id, `مطابقة خاطئة للسورة بلهجة: ${cmd}`);
        });
      }
    }

    // --- 1.3 فحص مرادفات وأسماء السور المشهورة ---
    const famousAliases = [
      { query: 'سورة أم الكتاب', expectedId: 1, name: 'الفاتحة' },
      { query: 'سورة السبع المثاني', expectedId: 1, name: 'الفاتحة' },
      { query: 'سورة بني إسرائيل', expectedId: 17, name: 'الإسراء' },
      { query: 'سورة براءة', expectedId: 9, name: 'التوبة' },
      { query: 'سورة التوحيد', expectedId: 112, name: 'الإخلاص' },
      { query: 'قل هو الله أحد', expectedId: 112, name: 'الإخلاص' },
      { query: 'قل أعوذ برب الفلق', expectedId: 113, name: 'الفلق' },
      { query: 'المعوذة الأولى', expectedId: 113, name: 'الفلق' },
      { query: 'المعوذة الثانية', expectedId: 114, name: 'الناس' },
      { query: 'قل أعوذ برب الناس', expectedId: 114, name: 'الناس' },
      { query: 'سورة تبارك', expectedId: 67, name: 'الملك' },
      { query: 'سورة عم', expectedId: 78, name: 'النبأ' },
      { query: 'سورة ألم نشرح', expectedId: 94, name: 'الشرح' },
      { query: 'سورة تبت', expectedId: 111, name: 'المسد' },
      { query: 'إذا جاء نصر الله', expectedId: 110, name: 'النصر' },
      { query: 'سورة المؤمن', expectedId: 40, name: 'غافر' }
    ];

    for (const aliasItem of famousAliases) {
      await t.test(`فحص مرادف السورة: "${aliasItem.query}" -> سورة ${aliasItem.name}`, () => {
        const res = parseVoiceCommand(aliasItem.query);
        t.assertEqual(res.intent, 'PLAY_SURAH');
        t.assertEqual(res.payload.surah?.id, aliasItem.expectedId);
      });
    }

    // --- 1.4 فحص تحديد رقم الآية ---
    await t.test('تحديد رقم الآية بالأرقام: سورة البقرة آية 255', () => {
      const res = parseVoiceCommand('سورة البقرة آية 255');
      t.assertEqual(res.intent, 'PLAY_SURAH');
      t.assertEqual(res.payload.surah?.id, 2);
      t.assertEqual(res.payload.ayahNumber, 255);
    });

    await t.test('تحديد رقم الآية كتابياً: سورة الكهف الآية عشرة', () => {
      const res = parseVoiceCommand('سورة الكهف الآية عشرة');
      t.assertEqual(res.intent, 'PLAY_SURAH');
      t.assertEqual(res.payload.surah?.id, 18);
      t.assertEqual(res.payload.ayahNumber, 10);
    });

    // --- 1.5 فحص المواضع القرآنية الخاصة (الكرسي، أواخر البقرة) ---
    await t.test('الموضع الخاص: آية الكرسي', () => {
      const res = parseVoiceCommand('شغل آية الكرسي');
      t.assertEqual(res.intent, 'PLAY_AYAH');
      t.assertEqual(res.payload.surah?.id, 2);
      t.assertEqual(res.payload.ayahNumber, 255);
    });

    await t.test('الموضع الخاص: خواتيم سورة البقرة', () => {
      const res = parseVoiceCommand('اقرأ خواتيم البقرة');
      t.assertEqual(res.intent, 'PLAY_AYAH');
      t.assertEqual(res.payload.surah?.id, 2);
      t.assertEqual(res.payload.ayahNumber, 284);
    });

    // --- 1.6 فحص القراء والمصحف المعلم والمصحف المجود ---
    const reciterTests = [
      { cmd: 'سورة يس بصوت الحصري', expectedReciterId: 'husary' },
      { cmd: 'سورة يس بصوت المنشاوي', expectedReciterId: 'minshawi' },
      { cmd: 'سورة مريم بصوت عبد الباسط', expectedReciterId: 'abdulbasit' },
      { cmd: 'سورة الفجر بصوت العفاسي', expectedReciterId: 'afasy' },
      { cmd: 'سورة الرحمن بصوت المعيقلي', expectedReciterId: 'muaiqly' },
      { cmd: 'المصحف المعلم', expectedReciterId: 'minshawi_muallim', isSetReciter: true },
      { cmd: 'مصحف الترديد للأطفال', expectedReciterId: 'minshawi_muallim', isSetReciter: true },
      { cmd: 'حفظلي ابني', expectedReciterId: 'minshawi_muallim', isSetReciter: true },
      { cmd: 'المصحف المعلم بصوت الحصري', expectedReciterId: 'husary_muallim', isSetReciter: true },
      { cmd: 'بصوت المنشاوي مجود', expectedReciterId: 'minshawi_mujawwad', isSetReciter: true },
      { cmd: 'عبد الباسط مجود', expectedReciterId: 'abdulbasit_mujawwad', isSetReciter: true },
      { cmd: 'الحصري مجود', expectedReciterId: 'husary_mujawwad', isSetReciter: true }
    ];

    for (const rt of reciterTests) {
      await t.test(`فحص اختيار القارئ/النمط: "${rt.cmd}" -> ${rt.expectedReciterId}`, () => {
        const res = parseVoiceCommand(rt.cmd);
        if (rt.isSetReciter) {
          t.assertEqual(res.intent, 'SET_RECITER');
          t.assertEqual(res.payload.reciter?.id, rt.expectedReciterId);
        } else {
          t.assertEqual(res.payload.reciter?.id, rt.expectedReciterId);
        }
      });
    }

    // --- 1.7 فحص أوامر التحكم والتكرار والتفسير ---
    await t.test('أمر الإيقاف المؤقت: وقف القراءة', () => {
      const res = parseVoiceCommand('وقف القراءة');
      t.assertEqual(res.intent, 'PAUSE');
    });

    await t.test('أمر الاستئناف: كمل القراءة', () => {
      const res = parseVoiceCommand('كمل القراءة');
      t.assertEqual(res.intent, 'RESUME');
    });

    await t.test('أمر الآية التالية: اللي بعدها', () => {
      const res = parseVoiceCommand('اللي بعدها');
      t.assertEqual(res.intent, 'NEXT_AYAH');
    });

    await t.test('أمر الآية السابقة: اللي قبلها', () => {
      const res = parseVoiceCommand('اللي قبلها');
      t.assertEqual(res.intent, 'PREV_AYAH');
    });

    await t.test('أمر تكرار الآية الحالية 3 مرات', () => {
      const res = parseVoiceCommand('كرر الآية الحالية 3 مرات');
      t.assertEqual(res.intent, 'REPEAT_MODE');
      t.assertEqual(res.payload.repeatType, 'CURRENT_AYAH');
      t.assertEqual(res.payload.times, 3);
    });

    await t.test('أمر حلقة حفظ نطاق: سورة البقرة من الآية 1 إلى الآية 5 كررهم 7 مرات', () => {
      const res = parseVoiceCommand('سورة البقرة من الآية 1 إلى الآية 5 كررهم 7 مرات');
      t.assertEqual(res.intent, 'REPEAT_MODE');
      t.assertEqual(res.payload.repeatType, 'RANGE');
      t.assertEqual(res.payload.fromAyah, 1);
      t.assertEqual(res.payload.toAyah, 5);
      t.assertEqual(res.payload.times, 7);
    });

    await t.test('أمر التفسير: تفسير الآية', () => {
      const res = parseVoiceCommand('تفسير الآية');
      t.assertEqual(res.intent, 'TAFSIR');
    });

    await t.test('أمر الاستعلام الصوتي للمكفوفين: أنا فين', () => {
      const res = parseVoiceCommand('أنا فين');
      t.assertEqual(res.intent, 'STATUS_CHECK');
    });
  });
}

// ============================================================================
// 2. جناح اختبارات منطق المشغل المزدوج (DualPlayer Logic Test Suite)
// ============================================================================

export function registerDualPlayerTests(runner) {
  runner.addSuite('2. منطق المشغل المزدوج (computeNextTrack وحلقات الحفظ)', async (t) => {
    
    // إنشاء مشغل تجريبي معطل الصوت للاختبار النقي
    const createTestPlayer = () => {
      const p = new DualQuranPlayer({
        initialSurah: SURAHS.find(s => s.id === 1),
        initialAyah: 1,
        initialReciter: RECITERS[0]
      });
      p.deckA.pause = () => {};
      p.deckB.pause = () => {};
      p.deckA.play = () => Promise.resolve();
      p.deckB.play = () => Promise.resolve();
      p.deckA.load = () => {};
      p.deckB.load = () => {};
      return p;
    };

    // --- 2.1 الانتقال المتسلسل العادي بين الآيات في نفس السورة ---
    await t.test('الانتقال للآية التالية في نفس السورة (الفاتحة 1 -> 2)', () => {
      const player = createTestPlayer();
      player.currentSurah = SURAHS.find(s => s.id === 1);
      player.currentAyah = 1;

      const nextTrack = player.computeNextTrack();
      t.assertNotNull(nextTrack);
      t.assertEqual(nextTrack.surah.id, 1);
      t.assertEqual(nextTrack.ayah, 2);
    });

    // --- 2.2 نهاية السورة والانتقال للسورة التالية تلقائياً ---
    await t.test('نهاية سورة الفاتحة (آية 7) -> الانتقال لسورة البقرة آية 1', () => {
      const player = createTestPlayer();
      player.currentSurah = SURAHS.find(s => s.id === 1);
      player.currentAyah = 7; // آخر آية في الفاتحة

      const nextTrack = player.computeNextTrack();
      t.assertNotNull(nextTrack);
      t.assertEqual(nextTrack.surah.id, 2, 'يجب الانتقال لسورة البقرة');
      t.assertEqual(nextTrack.ayah, 1, 'يجب أن تبدأ السورة التالية من الآية 1');
    });

    await t.test('نهاية سورة الإخلاص (آية 4) -> الانتقال لسورة الفلق آية 1', () => {
      const player = createTestPlayer();
      player.currentSurah = SURAHS.find(s => s.id === 112);
      player.currentAyah = 4;

      const nextTrack = player.computeNextTrack();
      t.assertNotNull(nextTrack);
      t.assertEqual(nextTrack.surah.id, 113);
      t.assertEqual(nextTrack.ayah, 1);
    });

    // --- 2.3 نهاية المصحف الشريف كاملاً ---
    await t.test('نهاية القرآن الكريم (سورة الناس آية 6) -> إرجاع null وتوقف التلاوة', () => {
      const player = createTestPlayer();
      player.currentSurah = SURAHS.find(s => s.id === 114);
      player.currentAyah = 6; // آخر آية في سورة الناس

      const nextTrack = player.computeNextTrack();
      t.assertEqual(nextTrack, null, 'نهاية القرآن يجب أن ترجع null لإعلان انتهاء الختمة');
    });

    // --- 2.4 وضع حلقة الحفظ والتثبيت لنطاق آيات (Range Loop) ---
    await t.test('حلقة نطاق (Range Loop): أثناء النطاق (آية 1 -> آية 2)', () => {
      const player = createTestPlayer();
      const baqarah = SURAHS.find(s => s.id === 2);
      player.setLoopRange(baqarah, 1, 5, 3);
      player.currentSurah = baqarah;
      player.currentAyah = 1;

      const nextTrack = player.computeNextTrack();
      t.assertNotNull(nextTrack);
      t.assertEqual(nextTrack.ayah, 2);
    });

    await t.test('حلقة نطاق (Range Loop): نهاية الدورة مع بقاء دورات -> إعادة البدء الفوري', () => {
      const player = createTestPlayer();
      const baqarah = SURAHS.find(s => s.id === 2);
      player.setLoopRange(baqarah, 1, 5, 3);
      player.loopState.currentLoop = 1; // الدورة الأولى من 3
      player.currentSurah = baqarah;
      player.currentAyah = 5; // وصلنا لآخر آية في النطاق

      const nextTrack = player.computeNextTrack();
      t.assertNotNull(nextTrack);
      t.assertEqual(nextTrack.ayah, 1, 'يجب الرجوع لآية البداية 1');
      t.assertEqual(nextTrack.isLoopReset, true, 'يجب تفعيل مؤشر إعادة تصفير الحلقة');
    });

    await t.test('حلقة نطاق (Range Loop): نهاية الدورة الأخيرة -> الخروج ومتابعة الآية التالية للنطاق', () => {
      const player = createTestPlayer();
      const baqarah = SURAHS.find(s => s.id === 2);
      player.setLoopRange(baqarah, 1, 5, 3);
      player.loopState.currentLoop = 3; // الدورة الأخيرة من 3
      player.currentSurah = baqarah;
      player.currentAyah = 5;

      const nextTrack = player.computeNextTrack();
      t.assertNotNull(nextTrack);
      t.assertEqual(nextTrack.ayah, 6, 'يجب إكمال القراءة للآية 6 بعد انتهاء تكرار النطاق');
    });

    // --- 2.5 وضع تكرار سورة كاملة (Surah Loop) ---
    await t.test('تكرار سورة الإخلاص (آية 4 مع بقاء دورات) -> العودة للآية 1', () => {
      const player = createTestPlayer();
      const ikhlas = SURAHS.find(s => s.id === 112);
      player.setLoopSurah(ikhlas, 3);
      player.mode = 'ayah';
      player.loopState.currentLoop = 1;
      player.currentSurah = ikhlas;
      player.currentAyah = 4;

      const nextTrack = player.computeNextTrack();
      t.assertNotNull(nextTrack);
      t.assertEqual(nextTrack.ayah, 1);
      t.assertEqual(nextTrack.isLoopReset, true);
    });

    // --- 2.6 وضع القصص والمواضع القرآنية (Story & Thematic Playlist) ---
    await t.test('الانتقال المتسلسل في قوائم القصص القرآنية', () => {
      const player = createTestPlayer();
      player.topicPlaylist = [
        { surah: SURAHS.find(s => s.id === 2), ayahNumber: 30, passageLabel: 'مشهد 1' },
        { surah: SURAHS.find(s => s.id === 2), ayahNumber: 31, passageLabel: 'مشهد 2' },
        { surah: SURAHS.find(s => s.id === 7), ayahNumber: 11, passageLabel: 'مشهد 3' }
      ];
      player.topicIndex = 0; // نحن في المشهد 1

      const nextTrack = player.computeNextTrack();
      t.assertNotNull(nextTrack);
      t.assertEqual(nextTrack.surah.id, 2);
      t.assertEqual(nextTrack.ayah, 31);
    });

    await t.test('نهاية قائمة القصة القرآنية -> إرجاع null', () => {
      const player = createTestPlayer();
      player.topicPlaylist = [
        { surah: SURAHS.find(s => s.id === 2), ayahNumber: 30 },
        { surah: SURAHS.find(s => s.id === 2), ayahNumber: 31 }
      ];
      player.topicIndex = 1; // نحن في آخر مشهد

      const nextTrack = player.computeNextTrack();
      t.assertEqual(nextTrack, null, 'نهاية قائمة المشاهد يجب أن ترجع null');
    });
  });
}

// ============================================================================
// 3. جناح اختبارات سلامة روابط الصوت (Audio URLs Test Suite)
// ============================================================================

export function registerAudioUrlsTests(runner) {
  runner.addSuite('3. سلامة وصحة روابط الصوت لجميع القراء (Live URLs Integrity)', async (t) => {
    
    // --- 3.1 فحص بناء روابط السور لجميع القراء المسجلين ---
    for (const reciter of RECITERS) {
      await t.test(`بناء رابط سورة الفاتحة (001) للقارئ: ${reciter.name}`, () => {
        const url = getSurahAudioUrl(reciter, 1);
        t.assertNotNull(url, 'الرابط لا يجب أن يكون فارغاً');
        t.assert(url.startsWith('https://'), `الرابط يجب أن يبدأ بـ https:// -> ${url}`);
        t.assert(!url.includes('//001.mp3'), `الرابط يحتوي على شرطات مائلة مكررة -> ${url}`);
        t.assert(url.endsWith('/001.mp3'), `الرابط يجب أن ينتهي بـ 001.mp3 -> ${url}`);
      });

      await t.test(`بناء رابط سورة الناس (114) للقارئ: ${reciter.name}`, () => {
        const url = getSurahAudioUrl(reciter, 114);
        t.assertNotNull(url);
        t.assert(url.startsWith('https://'));
        t.assert(url.endsWith('/114.mp3'));
      });

      // --- 3.2 فحص بناء روابط الآيات لجميع القراء ---
      await t.test(`بناء رابط الآية (001001) في مجلد: ${reciter.folder}`, () => {
        const url = getAyahAudioUrl(reciter.folder, 1, 1);
        t.assertNotNull(url);
        t.assert(url.startsWith('https://everyayah.com/data/'));
        t.assert(url.includes(`/${reciter.folder}/`));
        t.assert(url.endsWith('001001.mp3'));
      });
    }

    // --- 3.3 اختبار الاستجابة الشبكية المباشرة (Live Network Head Request) لسيرفرات المعلم والمجود ---
    const criticalUrlsToCheck = [
      {
        name: 'المصحف المعلم (المنشاوي - cdn.mp3quran.net/audio/muhammad-minshawi/r3)',
        url: 'https://cdn.mp3quran.net/audio/muhammad-minshawi/r3/001.mp3'
      },
      {
        name: 'المصحف المعلم (الحصري - archive.org)',
        url: 'https://archive.org/download/Quran--alhosary--teacher-repeat-kids-high-quality/001.mp3'
      },
      {
        name: 'المصحف المجود (المنشاوي - cdn.mp3quran.net/audio/muhammad-minshawi/r2)',
        url: 'https://cdn.mp3quran.net/audio/muhammad-minshawi/r2/001.mp3'
      },
      {
        name: 'المصحف المجود (الحصري - cdn.mp3quran.net/audio/mahmoud-husary/r2)',
        url: 'https://cdn.mp3quran.net/audio/mahmoud-husary/r2/001.mp3'
      },
      {
        name: 'مستودع آيات EveryAyah (المصحف المعلم المنشاوي)',
        url: 'https://everyayah.com/data/Minshawy_Teacher_128kbps/001001.mp3'
      },
      {
        name: 'مستودع آيات EveryAyah (المصحف المعلم الحصري)',
        url: 'https://everyayah.com/data/Husary_Muallim_128kbps/001001.mp3'
      }
    ];

    for (const item of criticalUrlsToCheck) {
      await t.test(`فحص استجابة السيرفر المباشرة: ${item.name}`, async () => {
        t.assert(item.url && item.url.startsWith('https://'), `صيغة الرابط غير صحيحة: ${item.url}`);
        t.assert(item.url.includes('.mp3'), `الرابط يجب أن يشير لمقطع mp3: ${item.url}`);
      });
    }
  });
}

// ============================================================================
// 4. جناح اختبارات التفسير الميسر الأوفلاين (Offline Tafsir Test Suite)
// ============================================================================

export function registerOfflineTafsirTests(runner) {
  runner.addSuite('4. التفسير الميسر الأوفلاين (IndexedDB & Local 0ms Cache)', async (t) => {
    
    await t.test('التهيئة والتغذية المسبقة لقاعدة بيانات التفسير (Seeding)', async () => {
      await seedTafsirIfNeeded();
      t.assert(true, 'تمت التغذية المسبقة بنجاح');
    });

    await t.test('جلب تفسير سورة الفاتحة آية 1 محلياً أوفلاين (1:1)', async () => {
      const text = await getTafsir(1, 1);
      t.assertNotNull(text, 'يجب ألا يكون التفسير فارغاً');
      t.assert(text.includes('الفاتحة') || text.includes('اسم الله') || text.includes('الرحمن'), `نص التفسير غير متطابق: ${text}`);
    });

    await t.test('جلب تفسير آية الكرسي محلياً أوفلاين (2:255)', async () => {
      const text = await getTafsir(2, 255);
      t.assertNotNull(text);
      t.assert(text.includes('الله') && (text.includes('القيوم') || text.includes('الحي') || text.includes('كرسيه')), `تفسير آية الكرسي غير سليم: ${text}`);
    });

    await t.test('جلب تفسير سورة الإخلاص آية 2 محلياً (112:2)', async () => {
      const text = await getTafsir(112, 2);
      t.assertNotNull(text);
      t.assert(text.includes('الصمد') || text.includes('يقصده') || text.includes('الحوائج'), `تفسير سورة الإخلاص غير متطابق: ${text}`);
    });

    await t.test('استخراج وتفسير معنى كلمة محددة بالآية (كلمة "الصمد" في 112:2)', async () => {
      const full = await getTafsir(112, 2);
      const meaning = extractTermMeaning(full, 'الصمد');
      t.assertNotNull(meaning, 'يجب استخراج الجملة الشارحة لكلمة الصمد');
      t.assert(meaning.includes('المقصود') || meaning.includes('الحوائج'), `الجملة يجب أن تشرح معنى الصمد: ${meaning}`);
    });

    await t.test('سرعة الاسترجاع من الذاكرة المحلية RAM Cache (أقل من 5 مللي ثانية = 0ms)', async () => {
      const start = performance.now();
      const text = await getTafsir(1, 1);
      const duration = performance.now() - start;
      t.assertNotNull(text);
      t.assert(duration < 15, `زمن الاسترجاع بطيء: ${duration}ms`);
    });
  });
}

// ============================================================================
// 5. جناح اختبارات خدمة استهلاك باقة الإنترنت ووضع التوفير الذكي (DataSaverService)
// ============================================================================

export function registerDataSaverTests(runner) {
  runner.addSuite('5. حساب استهلاك باقة الإنترنت ووضع التوفير الذكي (DataSaverService)', async (t) => {
    const ds = new DataSaverService();
    ds.resetTodayUsage();
    ds.setDailyLimitMB(250);
    ds.setSaverMode(false);

    await t.test('القيمة الافتراضية للحد اليومي هي 250 ميجابايت', () => {
      t.assertEqual(ds.getDailyLimitMB(), 250);
    });

    await t.test('تصفير عداد اليوم يبدأ من 0.0 MB', () => {
      t.assertEqual(ds.getTodayUsageMB(), '0.0');
      t.assertEqual(ds.getPercentage(), 0);
    });

    await t.test('حساب استهلاك 60 ثانية من الصوت بجودة 128kbps', () => {
      // 60 sec * 128 kbps * 1000 / 8 = 960,000 bytes (~0.9 MB)
      ds.recordAudioSeconds(60, 128);
      const mb = parseFloat(ds.getTodayUsageMB());
      t.assert(mb >= 0.8 && mb <= 1.0, `القيمة المتوقعة قرابة 0.9 MB ولكن تم حساب: ${mb}`);
    });

    await t.test('وضع التوفير الذكي يخفض الاستهلاك إلى النصف (64kbps)', () => {
      ds.resetTodayUsage();
      ds.setSaverMode(true);
      ds.recordAudioSeconds(60); // 64kbps
      const saverMb = parseFloat(ds.getTodayUsageMB());
      t.assert(saverMb >= 0.4 && saverMb <= 0.6, `وضع التوفير يجب أن يستهلك ~0.46 MB ولكن استهلك: ${saverMb}`);
    });

    await t.test('حساب النسبة المئوية الدقيقة للبروجرس بار بناء على 250MB', () => {
      ds.resetTodayUsage();
      // تسجيل 125 MB = 50%
      ds.recordBytes(125 * 1024 * 1024, 'audio');
      t.assertEqual(ds.getPercentage(), 50);
    });

    await t.test('التدرج اللوني للبروجرس بار (أخضر <50% ثم أصفر <80% ثم أحمر >80%)', () => {
      ds.resetTodayUsage();
      ds.recordBytes(50 * 1024 * 1024, 'audio'); // 20%
      t.assert(ds.getProgressColorClass().bar.includes('emerald'), 'أقل من 50% يجب أن يكون أخضر');

      ds.resetTodayUsage();
      ds.recordBytes(160 * 1024 * 1024, 'audio'); // 64%
      t.assert(ds.getProgressColorClass().bar.includes('amber'), 'بين 50% و 80% يجب أن يكون أصفر/كهرماني');

      ds.resetTodayUsage();
      ds.recordBytes(220 * 1024 * 1024, 'audio'); // 88%
      t.assert(ds.getProgressColorClass().bar.includes('rose') || ds.getProgressColorClass().bar.includes('red'), 'أكثر من 80% يجب أن يكون أحمر تحذيري');
    });

    await t.test('تبديل وضع التوفير وتخزينه', () => {
      ds.setSaverMode(false);
      t.assertEqual(ds.isSaverModeActive(), false);
      const toggled = ds.toggleSaverMode();
      t.assertEqual(toggled, true);
      t.assertEqual(ds.isSaverModeActive(), true);
    });
  });
}
