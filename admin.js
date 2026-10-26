/**
 * وحدة التحكم والتحليلات الخاصة بالمشرف (Admin Dashboard Controller)
 * تتيح مراقبة كل تفاصيل المستخدمين والأوامر الصوتية في الوقت الفعلي
 */

import { db } from './firebase-config.js';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { RECITERS } from './quran-data.js';
import { getGeminiApiKey, setGeminiApiKey, testGeminiConnection } from './gemini-service.js';

class AdminDashboard {
  constructor() {
    this.isAuthenticated = false;
    this.usersData = [];
    this.voiceLogs = [];

    this.dom = {
      loginOverlay: document.getElementById('loginOverlay'),
      pinInput: document.getElementById('pinInput'),
      pinSubmitBtn: document.getElementById('pinSubmitBtn'),
      pinError: document.getElementById('pinError'),
      dashboardContent: document.getElementById('dashboardContent'),
      logoutBtn: document.getElementById('logoutBtn'),

      // إحصائيات
      statTotalUsers: document.getElementById('statTotalUsers'),
      statTotalMinutes: document.getElementById('statTotalMinutes'),
      statTotalAyahs: document.getElementById('statTotalAyahs'),
      statVoiceAccuracy: document.getElementById('statVoiceAccuracy'),
      statVoiceCount: document.getElementById('statVoiceCount'),
      statTopReciter: document.getElementById('statTopReciter'),

      // تنبيهات البث
      broadcastInput: document.getElementById('broadcastInput'),
      broadcastVoiceToggle: document.getElementById('broadcastVoiceToggle'),
      sendBroadcastBtn: document.getElementById('sendBroadcastBtn'),
      clearBroadcastBtn: document.getElementById('clearBroadcastBtn'),
      broadcastStatus: document.getElementById('broadcastStatus'),

      // سجلات الصوت
      voiceLogsTableBody: document.getElementById('voiceLogsTableBody'),
      voiceSearchInput: document.getElementById('voiceSearchInput'),
      voiceFilterSelect: document.getElementById('voiceFilterSelect'),
      exportVoiceLogsBtn: document.getElementById('exportVoiceLogsBtn'),

      // إعدادات Gemini AI
      geminiApiKeyInput: document.getElementById('geminiApiKeyInput'),
      toggleGeminiKeyVisBtn: document.getElementById('toggleGeminiKeyVisBtn'),
      saveGeminiKeyBtn: document.getElementById('saveGeminiKeyBtn'),
      testGeminiKeyBtn: document.getElementById('testGeminiKeyBtn'),
      resetGeminiKeyBtn: document.getElementById('resetGeminiKeyBtn'),
      geminiTestResult: document.getElementById('geminiTestResult'),
      geminiLiveStatusBadge: document.getElementById('geminiLiveStatusBadge'),
      adminSpeechLangSelect: document.getElementById('adminSpeechLangSelect'),

      // المستخدمين
      usersTableBody: document.getElementById('usersTableBody')
    };

    this.init();
  }

  init() {
    this.bindAuthEvents();
    // التحقق من جلسة الأدمن المخزنة محلياً
    if (sessionStorage.getItem('quran_admin_auth') === 'true' || localStorage.getItem('quran_admin_auth') === 'true') {
      this.unlockDashboard();
    }
  }

  bindAuthEvents() {
    const handleLogin = () => {
      const pin = this.dom.pinInput ? this.dom.pinInput.value.trim() : '';
      // يقبل فقط الرمز 1153 لا غير ذلك
      if (pin === '1153') {
        sessionStorage.setItem('quran_admin_auth', 'true');
        localStorage.setItem('quran_admin_auth', 'true');
        this.unlockDashboard();
      } else {
        if (this.dom.pinError) {
          this.dom.pinError.textContent = 'رمز المرور غير صحيح';
          this.dom.pinError.classList.remove('hidden');
        }
      }
    };

    if (this.dom.pinSubmitBtn) {
      this.dom.pinSubmitBtn.addEventListener('click', handleLogin);
    }
    if (this.dom.pinInput) {
      this.dom.pinInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
      });
    }

    if (this.dom.logoutBtn) {
      this.dom.logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('quran_admin_auth');
        localStorage.removeItem('quran_admin_auth');
        window.location.href = 'index.html';
      });
    }
  }

  unlockDashboard() {
    this.isAuthenticated = true;
    if (this.dom.loginOverlay) {
      this.dom.loginOverlay.style.setProperty('display', 'none', 'important');
      this.dom.loginOverlay.classList.add('hidden');
      this.dom.loginOverlay.classList.remove('flex');
    }
    if (this.dom.dashboardContent) {
      this.dom.dashboardContent.style.setProperty('display', 'block', 'important');
      this.dom.dashboardContent.classList.remove('hidden');
    }

    if (this.initializedSubscribers) return;
    this.initializedSubscribers = true;

    this.subscribeToUsers();
    this.subscribeToVoiceLogs();
    this.subscribeToBroadcastConfig();
    this.bindDashboardEvents();
  }

  // 1. مراقبة المستخدمين والأجهزة الفعلية لحظياً من Firestore
  subscribeToUsers() {
    try {
      const usersCol = collection(db, "users");
      onSnapshot(usersCol, (snapshot) => {
        // تجميع السجلات حسب الأجهزة الفعلية الفريدة لاستبعاد التكرارات الناتجة عن تكرار الدخول
        const deviceMap = new Map();
        let totalAyahs = 0;
        let totalMinutes = 0;
        const reciterCounts = {};

        snapshot.forEach((docSnap) => {
          const user = docSnap.data();
          const visits = user.visitCount || 1;

          // بصمة تمييز الجهاز الفعلي الفريد:
          // إما معرف الجهاز المباشر (deviceId)، أو بصمة المتصفح والشاشة
          const deviceKey = user.deviceId || 
            (user.deviceInfo?.userAgent ? `${user.deviceInfo.userAgent}_${user.deviceInfo.screen}` : user.uid);

          if (!deviceMap.has(deviceKey)) {
            deviceMap.set(deviceKey, {
              ...user,
              deviceKey,
              visitCount: visits
            });
          } else {
            // دمج الجلسات المتكررة من نفس الجهاز الفعلي
            const existing = deviceMap.get(deviceKey);
            existing.visitCount = (existing.visitCount || 1) + visits;

            const existingAyahs = existing.stats?.totalAyahsListened || 0;
            const newAyahs = user.stats?.totalAyahsListened || 0;
            if (!existing.stats) existing.stats = {};
            existing.stats.totalAyahsListened = Math.max(existingAyahs, newAyahs);

            const existingSecs = existing.stats?.totalSeconds || 0;
            const newSecs = user.stats?.totalSeconds || 0;
            existing.stats.totalSeconds = Math.max(existingSecs, newSecs);

            if (user.lastActiveAt && (!existing.lastActiveAt || user.lastActiveAt > existing.lastActiveAt)) {
              existing.lastActiveAt = user.lastActiveAt;
              if (user.lastPosition) existing.lastPosition = user.lastPosition;
              if (user.preferences) existing.preferences = user.preferences;
            }
          }
        });

        this.usersData = Array.from(deviceMap.values());

        // حساب الإحصائيات التراكمية على مستوى الأجهزة الفعلية
        this.usersData.forEach((device) => {
          const ayahs = device.stats?.totalAyahsListened || 0;
          totalAyahs += ayahs;

          const secs = device.stats?.totalSeconds || ((device.stats?.totalMinutes || 0) * 60);
          totalMinutes += Math.round(secs / 60);

          const reciter = device.preferences?.reciterId || 'husary';
          reciterCounts[reciter] = (reciterCounts[reciter] || 0) + 1;
        });

        // تحديث كروت المؤشرات: عدد الأجهزة الفعلية الحقيقية فقط
        this.dom.statTotalUsers.textContent = this.usersData.length.toLocaleString('ar-EG');
        this.dom.statTotalAyahs.textContent = totalAyahs.toLocaleString('ar-EG');

        if (this.dom.statTotalMinutes) {
          if (totalMinutes < 60) {
            this.dom.statTotalMinutes.textContent = `${totalMinutes.toLocaleString('ar-EG')} دقيقة`;
          } else {
            const h = Math.floor(totalMinutes / 60);
            const m = totalMinutes % 60;
            this.dom.statTotalMinutes.textContent = `${h.toLocaleString('ar-EG')} س و ${m.toLocaleString('ar-EG')} د`;
          }
        }

        // استخراج القارئ الأكثر اختياراً
        let topReciterId = 'husary';
        let maxCount = 0;
        for (const [rId, count] of Object.entries(reciterCounts)) {
          if (count > maxCount) {
            maxCount = count;
            topReciterId = rId;
          }
        }
        const foundReciter = RECITERS.find(r => r.id === topReciterId);
        this.dom.statTopReciter.textContent = foundReciter ? foundReciter.name : topReciterId;

        this.renderUsersTable();
      }, (err) => {
        console.warn('Firestore users subscribe error:', err.message);
        this.dom.usersTableBody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-amber-400">تأكد من تطبيق قواعد Firestore Security Rules للمعاينة الحية</td></tr>`;
      });
    } catch (e) {
      console.error(e);
    }
  }

  renderUsersTable() {
    if (!this.usersData.length) {
      this.dom.usersTableBody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500">لا توجد أجهزة مسجلة حتى الآن</td></tr>`;
      return;
    }

    this.dom.usersTableBody.innerHTML = this.usersData.map((u) => {
      const uidShort = u.deviceId ? u.deviceId.replace('dev_', 'جهاز ') : (u.uid ? u.uid.substring(0, 10) + '...' : 'مجهول');
      const device = u.deviceInfo?.userAgent ? u.deviceInfo.userAgent.substring(0, 32) + '...' : 'غير معروف';
      const isPwa = u.deviceInfo?.isPwa ? '<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">نعم PWA</span>' : '<span class="text-slate-500">متصفح</span>';
      const visits = `<span class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold">${u.visitCount || 1} زيارة</span>`;
      const lastPos = u.lastPosition ? `سورة ${u.lastPosition.surahName || u.lastPosition.surahId} (آية ${u.lastPosition.ayahNumber})` : 'لم يبدأ';
      const reciter = RECITERS.find(r => r.id === u.preferences?.reciterId)?.name || u.preferences?.reciterId || 'الحصري';
      const ayahs = u.stats?.totalAyahsListened || 0;
      
      // حساب وقت الاستماع التراكمي للمستخدم بدقة
      const totalSecs = u.stats?.totalSeconds || ((u.stats?.totalMinutes || 0) * 60);
      let timeSpentStr = '<span class="text-slate-500">0 دقيقة</span>';
      if (totalSecs > 0) {
        if (totalSecs < 60) {
          timeSpentStr = `<span class="text-emerald-400 font-bold">${totalSecs} ثانية</span>`;
        } else {
          const mins = Math.floor(totalSecs / 60);
          const remSecs = totalSecs % 60;
          if (mins < 60) {
            timeSpentStr = `<span class="text-emerald-400 font-bold">${mins} د${remSecs > 0 ? ` و ${remSecs}ث` : ''}</span>`;
          } else {
            const hours = Math.floor(mins / 60);
            const remMins = mins % 60;
            timeSpentStr = `<span class="text-emerald-400 font-bold">${hours} س و ${remMins} د</span>`;
          }
        }
      }

      let lastActive = 'الآن';
      if (u.lastActiveAt && u.lastActiveAt.toDate) {
        lastActive = u.lastActiveAt.toDate().toLocaleTimeString('ar-EG');
      }

      return `
        <tr class="hover:bg-slate-900/60 transition-colors">
          <td class="p-3 font-mono text-amber-400">${uidShort}</td>
          <td class="p-3 text-slate-300" title="${u.deviceInfo?.userAgent || ''}">${device}</td>
          <td class="p-3">${isPwa}</td>
          <td class="p-3">${visits}</td>
          <td class="p-3 text-emerald-300 font-semibold">${lastPos}</td>
          <td class="p-3 text-slate-200">الشيخ ${reciter}</td>
          <td class="p-3 font-bold text-amber-300">${ayahs}</td>
          <td class="p-3">${timeSpentStr}</td>
          <td class="p-3 text-slate-400">${lastActive}</td>
        </tr>
      `;
    }).join('');
  }

  // 2. مراقبة سجلات الأوامر الصوتية لحظياً
  subscribeToVoiceLogs() {
    try {
      const logsQuery = query(
        collection(db, "voice_logs"),
        orderBy("timestamp", "desc"),
        limit(100)
      );

      onSnapshot(logsQuery, (snapshot) => {
        this.voiceLogs = [];
        let successCount = 0;

        snapshot.forEach((docSnap) => {
          const log = docSnap.data();
          this.voiceLogs.push(log);
          if (log.success) successCount++;
        });

        // تحديث نسبة الدقة
        const total = this.voiceLogs.length;
        const accuracy = total > 0 ? Math.round((successCount / total) * 100) : 100;
        this.dom.statVoiceAccuracy.textContent = `${accuracy}%`;
        this.dom.statVoiceCount.textContent = `${total} أمر صوتي مسجل`;

        this.renderVoiceLogsTable();
      }, (err) => {
        console.warn('Voice logs snapshot error:', err.message);
        this.dom.voiceLogsTableBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-amber-400">بانتظار تفعيل قواعد أمان Firestore</td></tr>`;
      });
    } catch (e) {
      console.error(e);
    }
  }

  renderVoiceLogsTable() {
    const search = this.dom.voiceSearchInput.value.trim().toLowerCase();
    const filter = this.dom.voiceFilterSelect.value;

    const filtered = this.voiceLogs.filter((log) => {
      const matchSearch = !search || (log.rawTranscript && log.rawTranscript.toLowerCase().includes(search));
      const matchFilter = filter === 'all' || 
        (filter === 'success' && log.success) || 
        (filter === 'failed' && !log.success);
      return matchSearch && matchFilter;
    });

    if (!filtered.length) {
      this.dom.voiceLogsTableBody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-500">لا توجد أوامر مطابقة للفلتر</td></tr>`;
      return;
    }

    this.dom.voiceLogsTableBody.innerHTML = filtered.map((l) => {
      const time = l.timeString || (l.timestamp?.toDate ? l.timestamp.toDate().toLocaleTimeString('ar-EG') : 'الآن');
      const uid = l.uid ? l.uid.substring(0, 8) + '...' : 'ضيف';
      const statusBadge = l.success 
        ? `<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">فُهِم بنجاح</span>`
        : `<span class="px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">غير مفهوم</span>`;

      return `
        <tr class="hover:bg-slate-900/60 transition-colors">
          <td class="p-3 text-slate-400">${time}</td>
          <td class="p-3 font-mono text-slate-400">${uid}</td>
          <td class="p-3 text-white font-bold">"${l.rawTranscript || ''}"</td>
          <td class="p-3 text-amber-300 font-mono">${l.intent || 'UNKNOWN'}</td>
          <td class="p-3">${statusBadge}</td>
          <td class="p-3 text-slate-400">${l.device || 'Mobile'}</td>
        </tr>
      `;
    }).join('');
  }

  // 3. مراقبة وإرسال تنبيه البث المباشر
  subscribeToBroadcastConfig() {
    try {
      const alertRef = doc(db, "system_config", "broadcast");
      onSnapshot(alertRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.active && data.message) {
            this.dom.broadcastStatus.textContent = 'نشط حالياً';
            this.dom.broadcastStatus.className = 'text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold';
            this.dom.broadcastInput.value = data.message;
            this.dom.broadcastVoiceToggle.checked = !!data.voiceAlert;
          } else {
            this.dom.broadcastStatus.textContent = 'متوقف';
            this.dom.broadcastStatus.className = 'text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-400';
          }
        }
      });
    } catch (e) {
      console.warn('Broadcast config error:', e);
    }
  }

  bindDashboardEvents() {
    // إرسال تنبيه البث
    this.dom.sendBroadcastBtn.addEventListener('click', async () => {
      const message = this.dom.broadcastInput.value.trim();
      if (!message) return;
      try {
        const alertRef = doc(db, "system_config", "broadcast");
        await setDoc(alertRef, {
          message: message,
          voiceAlert: this.dom.broadcastVoiceToggle.checked,
          active: true,
          updatedAt: serverTimestamp()
        });
        alert('تم نشر التنبيه بنجاح، وسيظهر لجميع المستخدمين فوراً!');
      } catch (err) {
        alert('حدث خطأ في حفظ التنبيه: ' + err.message);
      }
    });

    // مسح التنبيه
    this.dom.clearBroadcastBtn.addEventListener('click', async () => {
      try {
        const alertRef = doc(db, "system_config", "broadcast");
        await setDoc(alertRef, {
          message: '',
          active: false,
          updatedAt: serverTimestamp()
        });
        this.dom.broadcastInput.value = '';
        alert('تم إيقاف التنبيه.');
      } catch (err) {
        alert('حدث خطأ: ' + err.message);
      }
    });

    // فلترة وبحث سجلات الصوت
    this.dom.voiceSearchInput.addEventListener('input', () => this.renderVoiceLogsTable());
    this.dom.voiceFilterSelect.addEventListener('change', () => this.renderVoiceLogsTable());

    // تصدير سجلات الصوت
    this.dom.exportVoiceLogsBtn.addEventListener('click', () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.voiceLogs, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `quran-voice-logs-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });

    // تفعيل إعدادات Gemini AI
    this.initGeminiSettings();
  }

  initGeminiSettings() {
    if (!this.dom.geminiApiKeyInput) return;

    // ملء المفتاح الحالي
    this.dom.geminiApiKeyInput.value = getGeminiApiKey();

    // ربط اختيار لهجة التعرف الصوتي الافتراضية
    if (this.dom.adminSpeechLangSelect) {
      const currentLang = localStorage.getItem('speech_lang') || 'ar-EG';
      this.dom.adminSpeechLangSelect.value = currentLang;
      this.dom.adminSpeechLangSelect.onchange = (e) => {
        localStorage.setItem('speech_lang', e.target.value);
        this.showGeminiResult('success', `تم ضبط لهجة التعرف الصوتي إلى: ${e.target.options[e.target.selectedIndex].text}`);
      };
    }

    // إظهار/إخفاء
    if (this.dom.toggleGeminiKeyVisBtn) {
      this.dom.toggleGeminiKeyVisBtn.onclick = () => {
        const isPass = this.dom.geminiApiKeyInput.type === 'password';
        this.dom.geminiApiKeyInput.type = isPass ? 'text' : 'password';
        this.dom.toggleGeminiKeyVisBtn.textContent = isPass ? '🙈 إخفاء' : '👁️ إظهار';
      };
    }

    // حفظ المفتاح
    if (this.dom.saveGeminiKeyBtn) {
      this.dom.saveGeminiKeyBtn.onclick = () => {
        const val = this.dom.geminiApiKeyInput.value.trim();
        setGeminiApiKey(val);
        this.showGeminiResult('success', 'تم حفظ مفتاح Gemini API بنجاح في الإعدادات!');
      };
    }

    // استعادة المفتاح الافتراضي
    if (this.dom.resetGeminiKeyBtn) {
      this.dom.resetGeminiKeyBtn.onclick = () => {
        setGeminiApiKey('');
        this.dom.geminiApiKeyInput.value = getGeminiApiKey();
        this.showGeminiResult('info', 'تمت استعادة مفتاح Gemini الافتراضي المدمج في النظام.');
      };
    }

    // اختبار الاتصال الحي
    if (this.dom.testGeminiKeyBtn) {
      this.dom.testGeminiKeyBtn.onclick = async () => {
        const val = this.dom.geminiApiKeyInput.value.trim();
        this.dom.testGeminiKeyBtn.disabled = true;
        this.dom.testGeminiKeyBtn.innerHTML = '<span>⏳</span><span>جاري الفحص...</span>';
        this.showGeminiResult('loading', 'جاري إرسال طلب تجريبي لـ Google Gemini للتأكد من استجابة المفتاح...');

        const res = await testGeminiConnection(val);
        this.dom.testGeminiKeyBtn.disabled = false;
        this.dom.testGeminiKeyBtn.innerHTML = '<span>⚡</span><span>فحص الاتصال الحي</span>';

        if (res.success) {
          this.showGeminiResult('success', `✅ الاتصال ناجح ومستقر! استجابة Gemini: "${res.message}"`);
          if (this.dom.geminiLiveStatusBadge) {
            this.dom.geminiLiveStatusBadge.textContent = 'متصل بنجاح 🟢';
            this.dom.geminiLiveStatusBadge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
          }
        } else {
          this.showGeminiResult('error', `❌ فشل الاتصال: ${res.error}`);
          if (this.dom.geminiLiveStatusBadge) {
            this.dom.geminiLiveStatusBadge.textContent = 'خطأ في الاتصال 🔴';
            this.dom.geminiLiveStatusBadge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40';
          }
        }
      };
    }
  }

  showGeminiResult(type, text) {
    if (!this.dom.geminiTestResult) return;
    this.dom.geminiTestResult.classList.remove('hidden', 'bg-emerald-950/80', 'border-emerald-500/50', 'text-emerald-200', 'bg-red-950/80', 'border-red-500/50', 'text-red-200', 'bg-slate-900', 'border-slate-700', 'text-slate-300');
    
    if (type === 'success') {
      this.dom.geminiTestResult.classList.add('bg-emerald-950/80', 'border-emerald-500/50', 'text-emerald-200');
    } else if (type === 'error') {
      this.dom.geminiTestResult.classList.add('bg-red-950/80', 'border-red-500/50', 'text-red-200');
    } else {
      this.dom.geminiTestResult.classList.add('bg-slate-900', 'border-slate-700', 'text-slate-300');
    }
    this.dom.geminiTestResult.textContent = text;
  }
}

function initAdminDashboard() {
  if (!window.adminDashboardInstance) {
    window.adminDashboardInstance = new AdminDashboard();
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initAdminDashboard);
} else {
  initAdminDashboard();
}
