/**
 * وحدة التحكم والتحليلات الخاصة بالمشرف (Admin Dashboard Controller)
 * تتيح مراقبة كل تفاصيل المستخدمين والأجهزة الفعلية والأوامر الصوتية فورياً ولحظياً
 */

import { db, firebaseConfig } from './firebase-config.js';
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs,
  onSnapshot, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { RECITERS } from './quran-data.js';
import { getGeminiApiKey, setGeminiApiKey, testGeminiConnection } from './gemini-service.js';

class AdminDashboard {
  constructor() {
    this.isAuthenticated = false;
    this.usersData = [];
    this.voiceLogs = [];
    this.isFetching = false;
    this.unsubUsers = null;
    this.unsubLogs = null;
    this.unsubBroadcast = null;

    this.dom = {
      loginOverlay: document.getElementById('loginOverlay'),
      pinInput: document.getElementById('pinInput'),
      pinSubmitBtn: document.getElementById('pinSubmitBtn'),
      pinError: document.getElementById('pinError'),
      dashboardContent: document.getElementById('dashboardContent'),
      logoutBtn: document.getElementById('logoutBtn'),
      refreshDataBtn: document.getElementById('refreshDataBtn'),
      refreshBtnIcon: document.getElementById('refreshBtnIcon'),
      adminDataStatusBar: document.getElementById('adminDataStatusBar'),
      adminDataStatusDot: document.getElementById('adminDataStatusDot'),
      adminDataStatusText: document.getElementById('adminDataStatusText'),
      adminDataLastUpdated: document.getElementById('adminDataLastUpdated'),

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
    if (sessionStorage.getItem('quran_admin_auth') === 'true' || localStorage.getItem('quran_admin_auth') === 'true') {
      this.unlockDashboard();
    }
  }

  bindAuthEvents() {
    const handleLogin = () => {
      const pin = this.dom.pinInput ? this.dom.pinInput.value.trim() : '';
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

    this.bindDashboardEvents();
    this.fetchAllData(false);
    this.startRealtimeSubscriptions();
  }

  updateStatus(status, text, lastUpdated) {
    if (this.dom.adminDataStatusText) {
      this.dom.adminDataStatusText.textContent = text;
    }
    if (this.dom.adminDataStatusDot) {
      this.dom.adminDataStatusDot.className = 'w-2.5 h-2.5 rounded-full ' + (
        status === 'loading' ? 'bg-amber-400 animate-pulse' :
        status === 'error' ? 'bg-red-400' :
        'bg-emerald-400 animate-pulse'
      );
    }
    if (this.dom.adminDataLastUpdated && lastUpdated) {
      this.dom.adminDataLastUpdated.textContent = `آخر تحديث: ${lastUpdated}`;
    }
  }

  // جلب شامل وفوري لكافة البيانات (Direct Fetch + REST API Fallback)
  async fetchAllData(isManual = false) {
    if (this.isFetching) return;
    this.isFetching = true;

    if (this.dom.refreshBtnIcon) {
      this.dom.refreshBtnIcon.classList.add('animate-spin');
    }
    this.updateStatus('loading', 'جاري جلب أحدث البيانات من Firestore...');

    try {
      await Promise.allSettled([
        this.fetchUsersData(),
        this.fetchVoiceLogsData(),
        this.fetchBroadcastConfig()
      ]);

      const nowTime = new Date().toLocaleTimeString('ar-EG');
      this.updateStatus(
        'success', 
        `🟢 متصل بنجاح: تم مزامنة ${this.usersData.length} جهازاً و ${this.voiceLogs.length} أمراً صوتياً`,
        nowTime
      );
    } catch (err) {
      console.error('Data fetch error:', err);
      this.updateStatus('error', `⚠️ تعذر إكمال المزامنة: ${err.message}`);
    } finally {
      this.isFetching = false;
      if (this.dom.refreshBtnIcon) {
        this.dom.refreshBtnIcon.classList.remove('animate-spin');
      }
    }
  }

  // 1. جلب ومعالجة بيانات المستخدمين والأجهزة الفعلية
  async fetchUsersData() {
    let rawUsers = [];

    // محاولة 1: عبر Firestore SDK المباشر
    try {
      const snap = await getDocs(collection(db, "users"));
      snap.forEach(docSnap => {
        rawUsers.push({ id: docSnap.id, ...docSnap.data() });
      });
    } catch (sdkErr) {
      console.warn('Firestore SDK getDocs(users) failed, attempting REST API fallback:', sdkErr.message);
      // محاولة 2: عبر Firestore REST API المباشر (تتجاوز أي حظر لحزم WebChannel)
      rawUsers = await this.fetchUsersViaRestApi();
    }

    if (rawUsers && rawUsers.length > 0) {
      this.processAndRenderUsers(rawUsers);
    } else {
      if (this.dom.usersTableBody && this.usersData.length === 0) {
        this.dom.usersTableBody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500">لا توجد أجهزة مسجلة في قاعدة البيانات حتى الآن</td></tr>`;
      }
    }
  }

  // جلب المستخدمين عبر REST API في حال حظر حزم الويب سوكيت
  async fetchUsersViaRestApi() {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users?pageSize=300`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const docs = json.documents || [];
      return docs.map(d => this.parseFirestoreRestDoc(d));
    } catch (err) {
      console.warn('REST API users fetch error:', err);
      return [];
    }
  }

  // معالجة بيانات الأجهزة وحساب المؤشرات
  processAndRenderUsers(rawUsers) {
    const deviceMap = new Map();
    let totalAyahs = 0;
    let totalMinutes = 0;
    const reciterCounts = {};

    rawUsers.forEach((user) => {
      // معرف الجهاز الفعلي الفريد:
      // استخدام deviceId العتادي، أو uid للمستخدم، أو id الوثيقة
      const deviceKey = user.deviceId || user.uid || user.id || 'dev_unknown';
      const visits = user.visitCount || 1;

      if (!deviceMap.has(deviceKey)) {
        deviceMap.set(deviceKey, {
          ...user,
          deviceKey,
          visitCount: visits
        });
      } else {
        // دمج الجلسات المتكررة لنفس الجهاز الفعلي بدقة
        const existing = deviceMap.get(deviceKey);
        existing.visitCount = (existing.visitCount || 1) + visits;

        const existingAyahs = existing.stats?.totalAyahsListened || 0;
        const newAyahs = user.stats?.totalAyahsListened || 0;
        if (!existing.stats) existing.stats = {};
        existing.stats.totalAyahsListened = Math.max(existingAyahs, newAyahs);

        const existingSecs = existing.stats?.totalSeconds || 0;
        const newSecs = user.stats?.totalSeconds || 0;
        existing.stats.totalSeconds = Math.max(existingSecs, newSecs);

        if (user.lastActiveAt) {
          existing.lastActiveAt = user.lastActiveAt;
          if (user.lastPosition) existing.lastPosition = user.lastPosition;
          if (user.preferences) existing.preferences = user.preferences;
        }
      }
    });

    this.usersData = Array.from(deviceMap.values());

    // ترتيب الأجهزة حسب آخر نشاط
    this.usersData.sort((a, b) => {
      const tA = this.extractTimestamp(a.lastActiveAt);
      const tB = this.extractTimestamp(b.lastActiveAt);
      return tB - tA;
    });

    // حساب الإحصائيات التراكمية على مستوى الأجهزة الفعلية
    this.usersData.forEach((device) => {
      const ayahs = device.stats?.totalAyahsListened || 0;
      totalAyahs += ayahs;

      const secs = device.stats?.totalSeconds || ((device.stats?.totalMinutes || 0) * 60);
      totalMinutes += Math.round(secs / 60);

      const reciter = device.preferences?.reciterId || 'husary';
      reciterCounts[reciter] = (reciterCounts[reciter] || 0) + 1;
    });

    // تحديث بطاقات المؤشرات بأرقام حقيقية ودقيقة
    if (this.dom.statTotalUsers) {
      this.dom.statTotalUsers.textContent = this.usersData.length.toLocaleString('ar-EG');
    }
    if (this.dom.statTotalAyahs) {
      this.dom.statTotalAyahs.textContent = totalAyahs.toLocaleString('ar-EG');
    }
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
    if (this.dom.statTopReciter) {
      this.dom.statTopReciter.textContent = foundReciter ? foundReciter.name : topReciterId;
    }

    this.renderUsersTable();
  }

  renderUsersTable() {
    if (!this.dom.usersTableBody) return;

    if (!this.usersData.length) {
      this.dom.usersTableBody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500">لا توجد أجهزة مسجلة حتى الآن</td></tr>`;
      return;
    }

    this.dom.usersTableBody.innerHTML = this.usersData.map((u) => {
      const uidShort = u.deviceId 
        ? u.deviceId.replace('dev_', 'جهاز ') 
        : (u.uid ? u.uid.substring(0, 10) + '...' : 'جهاز غير معرف');
      
      const device = u.deviceInfo?.userAgent 
        ? (u.deviceInfo.userAgent.length > 35 ? u.deviceInfo.userAgent.substring(0, 35) + '...' : u.deviceInfo.userAgent) 
        : (u.deviceInfo?.platform || 'متصفح');
      
      const isPwa = u.deviceInfo?.isPwa 
        ? '<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">نعم PWA</span>' 
        : '<span class="text-slate-500">متصفح</span>';
      
      const visits = `<span class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold">${u.visitCount || 1} زيارة</span>`;
      const lastPos = u.lastPosition 
        ? `سورة ${u.lastPosition.surahName || u.lastPosition.surahId} (آية ${u.lastPosition.ayahNumber})` 
        : 'لم يبدأ';
      
      const reciter = RECITERS.find(r => r.id === u.preferences?.reciterId)?.name || u.preferences?.reciterId || 'الحصري';
      const ayahs = (u.stats?.totalAyahsListened || 0).toLocaleString('ar-EG');
      
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
      if (u.lastActiveAt) {
        if (typeof u.lastActiveAt.toDate === 'function') {
          lastActive = u.lastActiveAt.toDate().toLocaleTimeString('ar-EG');
        } else if (u.lastActiveAt.seconds) {
          lastActive = new Date(u.lastActiveAt.seconds * 1000).toLocaleTimeString('ar-EG');
        } else if (typeof u.lastActiveAt === 'string') {
          try {
            lastActive = new Date(u.lastActiveAt).toLocaleTimeString('ar-EG');
          } catch(e) {}
        }
      }

      return `
        <tr class="hover:bg-slate-900/60 transition-colors">
          <td class="p-3 font-mono text-amber-400 font-bold">${uidShort}</td>
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

  // 2. جلب ومعالجة سجلات الأوامر الصوتية
  async fetchVoiceLogsData() {
    let rawLogs = [];

    // محاولة 1: عبر Firestore SDK
    try {
      const snap = await getDocs(collection(db, "voice_logs"));
      snap.forEach(docSnap => {
        rawLogs.push({ id: docSnap.id, ...docSnap.data() });
      });
    } catch (sdkErr) {
      console.warn('Firestore SDK getDocs(voice_logs) failed, attempting REST API fallback:', sdkErr.message);
      // محاولة 2: عبر Firestore REST API
      rawLogs = await this.fetchVoiceLogsViaRestApi();
    }

    if (rawLogs && rawLogs.length > 0) {
      this.processAndRenderVoiceLogs(rawLogs);
    }
  }

  async fetchVoiceLogsViaRestApi() {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/voice_logs?pageSize=100`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const docs = json.documents || [];
      return docs.map(d => this.parseFirestoreRestDoc(d));
    } catch (err) {
      console.warn('REST API voice logs fetch error:', err);
      return [];
    }
  }

  processAndRenderVoiceLogs(rawLogs) {
    // ترتيب الأوامر الصوتية تنازلياً حسب التوقيت بأمان تام
    rawLogs.sort((a, b) => {
      const tA = this.extractTimestamp(a.timestamp);
      const tB = this.extractTimestamp(b.timestamp);
      return tB - tA;
    });

    this.voiceLogs = rawLogs;
    let successCount = 0;
    this.voiceLogs.forEach(l => {
      if (l.success) successCount++;
    });

    const total = this.voiceLogs.length;
    const accuracy = total > 0 ? Math.round((successCount / total) * 100) : 100;

    if (this.dom.statVoiceAccuracy) {
      this.dom.statVoiceAccuracy.textContent = `${accuracy}%`;
    }
    if (this.dom.statVoiceCount) {
      this.dom.statVoiceCount.textContent = `${total} أمر صوتي مسجل`;
    }

    this.renderVoiceLogsTable();
  }

  renderVoiceLogsTable() {
    if (!this.dom.voiceLogsTableBody) return;

    const search = this.dom.voiceSearchInput ? this.dom.voiceSearchInput.value.trim().toLowerCase() : '';
    const filter = this.dom.voiceFilterSelect ? this.dom.voiceFilterSelect.value : 'all';

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
      let time = l.timeString || 'الآن';
      if (!l.timeString && l.timestamp) {
        if (typeof l.timestamp.toDate === 'function') {
          time = l.timestamp.toDate().toLocaleTimeString('ar-EG');
        } else if (l.timestamp.seconds) {
          time = new Date(l.timestamp.seconds * 1000).toLocaleTimeString('ar-EG');
        }
      }

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

  // 3. جلب تنبيه البث المباشر
  async fetchBroadcastConfig() {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/system_config/broadcast`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const data = this.parseFirestoreRestDoc(json);
        this.updateBroadcastUI(data);
      }
    } catch (e) {
      console.warn('Broadcast config fetch skipped:', e);
    }
  }

  updateBroadcastUI(data) {
    if (!this.dom.broadcastStatus) return;
    if (data && data.active && data.message) {
      this.dom.broadcastStatus.textContent = 'نشط حالياً';
      this.dom.broadcastStatus.className = 'text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold';
      if (this.dom.broadcastInput) this.dom.broadcastInput.value = data.message;
      if (this.dom.broadcastVoiceToggle) this.dom.broadcastVoiceToggle.checked = !!data.voiceAlert;
    } else {
      this.dom.broadcastStatus.textContent = 'متوقف';
      this.dom.broadcastStatus.className = 'text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-400';
    }
  }

  // 4. تفعيل الاشتراكات الحية اللحظية (Realtime Live Subscriptions)
  startRealtimeSubscriptions() {
    try {
      // مراقبة المستخدمين لحظياً
      this.unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
        const liveUsers = [];
        snapshot.forEach(d => liveUsers.push({ id: d.id, ...d.data() }));
        if (liveUsers.length > 0) {
          this.processAndRenderUsers(liveUsers);
          this.updateStatus('success', `🟢 متصل لحظياً: تم تحديث ${this.usersData.length} جهازاً`, new Date().toLocaleTimeString('ar-EG'));
        }
      }, (err) => {
        console.warn('Users live stream notice:', err.message);
      });

      // مراقبة سجلات الصوت لحظياً
      this.unsubLogs = onSnapshot(collection(db, "voice_logs"), (snapshot) => {
        const liveLogs = [];
        snapshot.forEach(d => liveLogs.push({ id: d.id, ...d.data() }));
        if (liveLogs.length > 0) {
          this.processAndRenderVoiceLogs(liveLogs);
        }
      }, (err) => {
        console.warn('Voice logs live stream notice:', err.message);
      });

      // مراقبة البث المباشر
      this.unsubBroadcast = onSnapshot(doc(db, "system_config", "broadcast"), (docSnap) => {
        if (docSnap.exists()) {
          this.updateBroadcastUI(docSnap.data());
        }
      }, (err) => {
        console.warn('Broadcast live stream notice:', err.message);
      });
    } catch (e) {
      console.warn('Realtime listeners initialization:', e);
    }
  }

  bindDashboardEvents() {
    // زر التحديث الفوري اليدوي
    if (this.dom.refreshDataBtn) {
      this.dom.refreshDataBtn.addEventListener('click', () => {
        this.fetchAllData(true);
      });
    }

    // إرسال تنبيه البث
    if (this.dom.sendBroadcastBtn) {
      this.dom.sendBroadcastBtn.addEventListener('click', async () => {
        const message = this.dom.broadcastInput ? this.dom.broadcastInput.value.trim() : '';
        if (!message) return;
        try {
          const alertRef = doc(db, "system_config", "broadcast");
          await setDoc(alertRef, {
            message: message,
            voiceAlert: this.dom.broadcastVoiceToggle ? this.dom.broadcastVoiceToggle.checked : false,
            active: true,
            updatedAt: serverTimestamp()
          });
          alert('تم نشر التنبيه بنجاح، وسيظهر لجميع المستخدمين فوراً!');
        } catch (err) {
          alert('حدث خطأ في حفظ التنبيه: ' + err.message);
        }
      });
    }

    // مسح التنبيه
    if (this.dom.clearBroadcastBtn) {
      this.dom.clearBroadcastBtn.addEventListener('click', async () => {
        try {
          const alertRef = doc(db, "system_config", "broadcast");
          await setDoc(alertRef, {
            message: '',
            active: false,
            updatedAt: serverTimestamp()
          });
          if (this.dom.broadcastInput) this.dom.broadcastInput.value = '';
          alert('تم إيقاف التنبيه.');
        } catch (err) {
          alert('حدث خطأ: ' + err.message);
        }
      });
    }

    // فلترة وبحث سجلات الصوت
    if (this.dom.voiceSearchInput) {
      this.dom.voiceSearchInput.addEventListener('input', () => this.renderVoiceLogsTable());
    }
    if (this.dom.voiceFilterSelect) {
      this.dom.voiceFilterSelect.addEventListener('change', () => this.renderVoiceLogsTable());
    }

    // تصدير سجلات الصوت
    if (this.dom.exportVoiceLogsBtn) {
      this.dom.exportVoiceLogsBtn.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.voiceLogs, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `quran-voice-logs-${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
      });
    }

    // تفعيل إعدادات Gemini AI
    this.initGeminiSettings();
  }

  initGeminiSettings() {
    if (!this.dom.geminiApiKeyInput) return;

    this.dom.geminiApiKeyInput.value = getGeminiApiKey();

    if (this.dom.adminSpeechLangSelect) {
      const currentLang = localStorage.getItem('speech_lang') || 'ar-EG';
      this.dom.adminSpeechLangSelect.value = currentLang;
      this.dom.adminSpeechLangSelect.onchange = (e) => {
        localStorage.setItem('speech_lang', e.target.value);
        this.showGeminiResult('success', `تم ضبط لهجة التعرف الصوتي إلى: ${e.target.options[e.target.selectedIndex].text}`);
      };
    }

    if (this.dom.toggleGeminiKeyVisBtn) {
      this.dom.toggleGeminiKeyVisBtn.onclick = () => {
        const isPass = this.dom.geminiApiKeyInput.type === 'password';
        this.dom.geminiApiKeyInput.type = isPass ? 'text' : 'password';
        this.dom.toggleGeminiKeyVisBtn.textContent = isPass ? '🙈 إخفاء' : '👁️ إظهار';
      };
    }

    if (this.dom.saveGeminiKeyBtn) {
      this.dom.saveGeminiKeyBtn.onclick = () => {
        const key = this.dom.geminiApiKeyInput.value.trim();
        setGeminiApiKey(key);
        this.showGeminiResult('success', 'تم حفظ مفتاح Gemini API بنجاح في التخزين المحلي!');
        if (this.dom.geminiLiveStatusBadge) {
          this.dom.geminiLiveStatusBadge.textContent = key ? 'مفعل محلياً 🔑' : 'غير مضبوط ⚠️';
          this.dom.geminiLiveStatusBadge.className = key 
            ? 'text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            : 'text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40';
        }
      };
    }

    if (this.dom.resetGeminiKeyBtn) {
      this.dom.resetGeminiKeyBtn.onclick = () => {
        if (confirm('هل أنت متأكد من رغبتك في حذف المفتاح المحفوظ والرجوع للمفتاح الافتراضي؟')) {
          setGeminiApiKey('');
          this.dom.geminiApiKeyInput.value = '';
          this.showGeminiResult('info', 'تمت استعادة المفتاح المدمج الافتراضي بنجاح.');
          if (this.dom.geminiLiveStatusBadge) {
            this.dom.geminiLiveStatusBadge.textContent = 'المفتاح الافتراضي ⚡';
            this.dom.geminiLiveStatusBadge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40';
          }
        }
      };
    }

    if (this.dom.testGeminiKeyBtn) {
      this.dom.testGeminiKeyBtn.onclick = async () => {
        const key = this.dom.geminiApiKeyInput.value.trim();
        this.dom.testGeminiKeyBtn.disabled = true;
        this.dom.testGeminiKeyBtn.innerHTML = '<span class="animate-spin inline-block">⏳</span><span>جاري الفحص...</span>';
        this.showGeminiResult('info', 'جاري إرسال اختبار تجريبي لنموذج Gemini...');

        const res = await testGeminiConnection(key);
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

  // دوال مساعدة لاستخراج التوقيت وتحليل كائنات Firestore REST
  extractTimestamp(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    if (ts.seconds) return ts.seconds * 1000;
    if (typeof ts === 'string' || typeof ts === 'number') {
      const parsed = new Date(ts).getTime();
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  parseFirestoreRestDoc(doc) {
    const id = (doc.name || '').split('/').pop();
    const result = { id, uid: id };
    if (!doc.fields) return result;
    for (const [key, valObj] of Object.entries(doc.fields)) {
      result[key] = this.parseFirestoreRestValue(valObj);
    }
    return result;
  }

  parseFirestoreRestValue(val) {
    if (!val || typeof val !== 'object') return val;
    if ('stringValue' in val) return val.stringValue;
    if ('integerValue' in val) return parseInt(val.integerValue, 10);
    if ('doubleValue' in val) return parseFloat(val.doubleValue);
    if ('booleanValue' in val) return val.booleanValue;
    if ('timestampValue' in val) {
      const dt = new Date(val.timestampValue);
      return {
        toDate: () => dt,
        toMillis: () => dt.getTime(),
        seconds: Math.floor(dt.getTime() / 1000)
      };
    }
    if ('mapValue' in val) {
      const res = {};
      const fields = val.mapValue.fields || {};
      for (const [k, v] of Object.entries(fields)) {
        res[k] = this.parseFirestoreRestValue(v);
      }
      return res;
    }
    if ('arrayValue' in val) {
      return (val.arrayValue.values || []).map(v => this.parseFirestoreRestValue(v));
    }
    return null;
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
