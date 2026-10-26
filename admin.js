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
    this.surveyResponses = [];
    this.currentSurvey = null;
    this.isFetching = false;
    this.unsubUsers = null;
    this.unsubLogs = null;
    this.unsubBroadcast = null;
    this.unsubSurvey = null;
    this.unsubSurveyResponses = null;

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
      usersTableBody: document.getElementById('usersTableBody'),

      // نظام استطلاعات الرأي (Micro-Surveys)
      surveyLiveStatusBadge: document.getElementById('surveyLiveStatusBadge'),
      surveyTypeSelect: document.getElementById('surveyTypeSelect'),
      surveyQuestionInput: document.getElementById('surveyQuestionInput'),
      surveyOptionsGroup: document.getElementById('surveyOptionsGroup'),
      surveyOptionsInput: document.getElementById('surveyOptionsInput'),
      launchSurveyBtn: document.getElementById('launchSurveyBtn'),
      endSurveyBtn: document.getElementById('endSurveyBtn'),
      resetSurveyBtn: document.getElementById('resetSurveyBtn'),
      surveyTotalVotesText: document.getElementById('surveyTotalVotesText'),
      surveyTotalCommentsText: document.getElementById('surveyTotalCommentsText'),
      surveyActiveQuestionText: document.getElementById('surveyActiveQuestionText'),
      surveyResultsBarsContainer: document.getElementById('surveyResultsBarsContainer'),
      surveyLastVoteTime: document.getElementById('surveyLastVoteTime'),
      surveyResponsesBadge: document.getElementById('surveyResponsesBadge'),
      surveyFilterCommentsSelect: document.getElementById('surveyFilterCommentsSelect'),
      exportSurveyBtn: document.getElementById('exportSurveyBtn'),
      surveyResponsesTableBody: document.getElementById('surveyResponsesTableBody')
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
        this.fetchBroadcastConfig(),
        this.fetchSurveyData()
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

  // 4. جلب ومعالجة بيانات استطلاع الرأي السريع (Micro-Surveys)
  async fetchSurveyData() {
    try {
      // جلب وثيقة الاستفتاء النشط
      let surveyData = null;
      try {
        const sSnap = await getDocs(collection(db, "system_config"));
        sSnap.forEach(d => {
          if (d.id === 'survey') surveyData = { id: d.id, ...d.data() };
        });
      } catch (e) {
        // Fallback REST
        const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/system_config/survey`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          surveyData = this.parseFirestoreRestDoc(json);
        }
      }

      this.updateSurveyUI(surveyData);

      // جلب استجابات وتصويتات المستخدمين
      let responses = [];
      try {
        const rSnap = await getDocs(collection(db, "survey_responses"));
        rSnap.forEach(d => responses.push({ id: d.id, ...d.data() }));
      } catch (e) {
        // Fallback REST
        const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/survey_responses?pageSize=300`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          const docs = json.documents || [];
          responses = docs.map(d => this.parseFirestoreRestDoc(d));
        }
      }

      this.processAndRenderSurveyResponses(responses);
    } catch (err) {
      console.warn('Survey data fetch error:', err);
    }
  }

  updateSurveyUI(data) {
    this.currentSurvey = data;
    const isActive = data && data.active && data.question;

    if (this.dom.surveyLiveStatusBadge) {
      if (isActive) {
        this.dom.surveyLiveStatusBadge.textContent = 'استطلاع نشط للمستخدمين 🟢';
        this.dom.surveyLiveStatusBadge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold';
      } else {
        this.dom.surveyLiveStatusBadge.textContent = 'لا يوجد استطلاع نشط';
        this.dom.surveyLiveStatusBadge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400';
      }
    }

    if (this.dom.surveyActiveQuestionText) {
      this.dom.surveyActiveQuestionText.textContent = isActive 
        ? data.question 
        : 'لا يوجد استطلاع رأي نشط حالياً (اضغط إطلاق لتفعيل استفتاء جديد)';
    }

    if (this.dom.surveyTotalVotesText) {
      this.dom.surveyTotalVotesText.textContent = (data?.totalVotes || 0).toLocaleString('ar-EG');
    }

    if (this.dom.surveyTotalCommentsText) {
      this.dom.surveyTotalCommentsText.textContent = (data?.totalComments || 0).toLocaleString('ar-EG');
    }

    // تعبئة الحقول إذا كان الاستفتاء نشطاً
    if (isActive) {
      if (this.dom.surveyQuestionInput && !this.dom.surveyQuestionInput.value) {
        this.dom.surveyQuestionInput.value = data.question;
      }
      if (this.dom.surveyTypeSelect && data.type) {
        this.dom.surveyTypeSelect.value = data.type;
        if (this.dom.surveyOptionsGroup) {
          this.dom.surveyOptionsGroup.classList.toggle('hidden', data.type === 'text');
        }
      }
      if (this.dom.surveyOptionsInput && Array.isArray(data.options)) {
        this.dom.surveyOptionsInput.value = data.options.join(', ');
      }
    }

    this.renderSurveyResults();
  }

  renderSurveyResults() {
    if (!this.dom.surveyResultsBarsContainer) return;

    if (!this.currentSurvey || !this.currentSurvey.question) {
      this.dom.surveyResultsBarsContainer.innerHTML = `
        <div class="text-center py-6 text-slate-500 text-xs">
          بانتظار إطلاق استطلاع رأي أو تسجيل تصويتات المستخدمين
        </div>
      `;
      return;
    }

    const survey = this.currentSurvey;
    const type = survey.type || 'choices';
    const totalVotes = survey.totalVotes || 0;
    const totalComments = survey.totalComments || 0;

    // في حال الاستطلاع مفتوح للكتابة فقط
    if (type === 'text') {
      this.dom.surveyResultsBarsContainer.innerHTML = `
        <div class="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-center space-y-2">
          <div class="text-2xl">💬</div>
          <h4 class="text-xs font-bold text-indigo-300">استطلاع رأي مفتوح للكتابة والاقتراحات</h4>
          <p class="text-[11px] text-slate-400">
            تم استلام <strong class="text-emerald-400 font-bold">${totalComments}</strong> رأياً ومقترحاً مكتوباً من المستمعين حتى الآن.
          </p>
          <p class="text-[10px] text-slate-500">يمكنك مطالعة كل الآراء والمقترحات في الجدول بالأسفل</p>
        </div>
      `;
      return;
    }

    // في حال الاستفتاء باختيارات محددة
    const options = Array.isArray(survey.options) && survey.options.length > 0 
      ? survey.options 
      : ['نعم', 'لا'];
    const votesMap = survey.votes || {};

    const barsHtml = options.map((opt, idx) => {
      const count = votesMap[opt] || 0;
      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      const isYes = opt.includes('نعم') || idx === 0;

      const dotColor = isYes ? 'bg-emerald-400' : 'bg-amber-400';
      const textColor = isYes ? 'text-emerald-400' : 'text-amber-400';
      const gradColor = isYes ? 'from-emerald-500 to-teal-400' : 'from-amber-500 to-orange-400';

      return `
        <div class="space-y-1.5 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold text-white flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full ${dotColor}"></span>
              <span>${opt}</span>
            </span>
            <div class="flex items-center gap-2">
              <span class="font-mono text-slate-400 text-[11px]">(${count.toLocaleString('ar-EG')} صوت)</span>
              <span class="font-bold ${textColor} font-mono text-sm">${pct}%</span>
            </div>
          </div>
          <div class="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80 p-0.5">
            <div class="h-full rounded-full bg-gradient-to-r ${gradColor} transition-all duration-700 shadow-sm" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');

    this.dom.surveyResultsBarsContainer.innerHTML = barsHtml;
  }

  processAndRenderSurveyResponses(rawResponses) {
    // ترتيب الردود تنازلياً حسب التوقيت
    rawResponses.sort((a, b) => {
      const tA = this.extractTimestamp(a.timestamp);
      const tB = this.extractTimestamp(b.timestamp);
      return tB - tA;
    });

    this.surveyResponses = rawResponses;

    if (this.dom.surveyResponsesBadge) {
      this.dom.surveyResponsesBadge.textContent = this.surveyResponses.length.toLocaleString('ar-EG');
    }

    if (this.dom.surveyLastVoteTime && this.surveyResponses.length > 0) {
      const last = this.surveyResponses[0];
      const timeStr = last.timeString || 'مؤخراً';
      this.dom.surveyLastVoteTime.textContent = `آخر مشاركة: ${timeStr}`;
    }

    this.renderSurveyResponsesTable();
  }

  renderSurveyResponsesTable() {
    if (!this.dom.surveyResponsesTableBody) return;

    const filter = this.dom.surveyFilterCommentsSelect ? this.dom.surveyFilterCommentsSelect.value : 'all';

    const filtered = this.surveyResponses.filter((r) => {
      if (filter === 'with_comment') {
        return !!(r.comment && r.comment.trim());
      }
      return true;
    });

    if (!filtered.length) {
      this.dom.surveyResponsesTableBody.innerHTML = `
        <tr>
          <td colspan="5" class="p-6 text-center text-slate-500">
            ${filter === 'with_comment' ? 'لا توجد مشاركات تحتوي آراء مكتوبة حتى الآن' : 'لا توجد ردود مسجلة في الاستطلاع حتى الآن'}
          </td>
        </tr>
      `;
      return;
    }

    this.dom.surveyResponsesTableBody.innerHTML = filtered.map((r) => {
      const time = r.timeString || 'الآن';
      const uidShort = r.deviceId 
        ? r.deviceId.replace('dev_', 'جهاز ') 
        : (r.uid ? r.uid.substring(0, 8) + '...' : 'مجهول');
      
      const answerBadge = r.answer?.includes('نعم')
        ? `<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">👍 ${r.answer}</span>`
        : r.answer?.includes('لا')
        ? `<span class="px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-bold">✋ ${r.answer}</span>`
        : `<span class="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">${r.answer || 'مشاركة'}</span>`;

      let commentHtml = `<span class="text-slate-600 text-[11px]">بدون ملاحظة</span>`;
      if (r.comment && r.comment.trim()) {
        const escapedComment = r.comment.replace(/"/g, '&quot;');
        commentHtml = `
          <div class="p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 text-xs flex items-center justify-between gap-2 shadow-sm">
            <span class="font-medium leading-relaxed">💬 "${r.comment}"</span>
            <button type="button" class="copy-comment-btn px-2 py-1 bg-emerald-900/60 hover:bg-emerald-800 text-amber-300 hover:text-white rounded text-[10px] shrink-0 transition-colors cursor-pointer" data-text="${escapedComment}">
              نسخ
            </button>
          </div>
        `;
      }

      const device = r.platform || (r.userAgent?.includes('Mobile') ? 'هاتف' : 'حاسوب');
      const isPwa = r.isPwa ? '<span class="text-emerald-400 text-[10px] font-bold mr-1">PWA</span>' : '';

      return `
        <tr class="hover:bg-slate-900/80 transition-colors">
          <td class="p-3 text-slate-400 font-mono">${time}</td>
          <td class="p-3 font-mono text-amber-400">${uidShort}</td>
          <td class="p-3">${answerBadge}</td>
          <td class="p-3 max-w-xs md:max-w-md">${commentHtml}</td>
          <td class="p-3 text-slate-400">${device} ${isPwa}</td>
        </tr>
      `;
    }).join('');

    // تفعيل أزرار نسخ التعليق
    this.dom.surveyResponsesTableBody.querySelectorAll('.copy-comment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-text');
        if (text && navigator.clipboard) {
          navigator.clipboard.writeText(text);
          const orig = btn.textContent;
          btn.textContent = 'تم النسخ ✅';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        }
      });
    });
  }

  // 5. تفعيل الاشتراكات الحية اللحظية (Realtime Live Subscriptions)
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

      // مراقبة الاستفتاء اللحظي
      this.unsubSurvey = onSnapshot(doc(db, "system_config", "survey"), (docSnap) => {
        if (docSnap.exists()) {
          this.updateSurveyUI({ id: docSnap.id, ...docSnap.data() });
        } else {
          this.updateSurveyUI(null);
        }
      }, (err) => {
        console.warn('Survey live stream notice:', err.message);
      });

      // مراقبة استجابات الاستفتاء لحظياً
      this.unsubSurveyResponses = onSnapshot(collection(db, "survey_responses"), (snapshot) => {
        const liveResponses = [];
        snapshot.forEach(d => liveResponses.push({ id: d.id, ...d.data() }));
        if (liveResponses.length > 0) {
          this.processAndRenderSurveyResponses(liveResponses);
        }
      }, (err) => {
        console.warn('Survey responses stream notice:', err.message);
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

    // تغيير نوع الاستفتاء (خيارات vs نص حر)
    if (this.dom.surveyTypeSelect) {
      this.dom.surveyTypeSelect.addEventListener('change', (e) => {
        const isText = e.target.value === 'text';
        if (this.dom.surveyOptionsGroup) {
          this.dom.surveyOptionsGroup.classList.toggle('hidden', isText);
        }
      });
    }

    // إطلاق الاستفتاء للمستخدمين
    if (this.dom.launchSurveyBtn) {
      this.dom.launchSurveyBtn.addEventListener('click', async () => {
        const question = this.dom.surveyQuestionInput ? this.dom.surveyQuestionInput.value.trim() : '';
        if (!question) {
          alert('يرجى كتابة نص السؤال أو الاستطلاع أولاً');
          return;
        }

        const type = this.dom.surveyTypeSelect ? this.dom.surveyTypeSelect.value : 'choices';
        let options = [];
        if (type === 'choices') {
          const rawOpts = this.dom.surveyOptionsInput ? this.dom.surveyOptionsInput.value.trim() : '';
          options = rawOpts ? rawOpts.split(',').map(s => s.trim()).filter(Boolean) : ['نعم', 'لا'];
          if (!options.length) options = ['نعم', 'لا'];
        }

        const surveyId = 'survey_' + Date.now();
        const surveyPayload = {
          id: surveyId,
          type: type,
          question: question,
          options: options,
          active: true,
          totalVotes: 0,
          totalComments: 0,
          votes: {},
          createdAt: serverTimestamp()
        };

        try {
          const surveyRef = doc(db, "system_config", "survey");
          await setDoc(surveyRef, surveyPayload);
          alert('🚀 تم إطلاق الاستفتاء بنجاح! سيظهر لجميع المستمعين في التطبيق فوراً.');
        } catch (err) {
          alert('حدث خطأ في حفظ الاستفتاء: ' + err.message);
        }
      });
    }

    // إيقاف الاستفتاء
    if (this.dom.endSurveyBtn) {
      this.dom.endSurveyBtn.addEventListener('click', async () => {
        try {
          const surveyRef = doc(db, "system_config", "survey");
          await setDoc(surveyRef, { active: false }, { merge: true });
          alert('تم إيقاف الاستفتاء بنجاح ولن يظهر للمستمعين.');
        } catch (err) {
          alert('حدث خطأ في إيقاف الاستفتاء: ' + err.message);
        }
      });
    }

    // إعادة تعيين ومسح نتائج الاستفتاء
    if (this.dom.resetSurveyBtn) {
      this.dom.resetSurveyBtn.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من رغبتك في حذف وإلغاء الاستفتاء الحالي ونتائجه؟')) return;
        try {
          const surveyRef = doc(db, "system_config", "survey");
          await setDoc(surveyRef, {
            active: false,
            question: '',
            options: [],
            totalVotes: 0,
            totalComments: 0,
            votes: {},
            updatedAt: serverTimestamp()
          });
          if (this.dom.surveyQuestionInput) this.dom.surveyQuestionInput.value = '';
          alert('تمت تصفية الاستفتاء بنجاح.');
        } catch (err) {
          alert('حدث خطأ: ' + err.message);
        }
      });
    }

    // فلترة استجابات الاستبيان (الكل / التي تحتوي تعليق فقط)
    if (this.dom.surveyFilterCommentsSelect) {
      this.dom.surveyFilterCommentsSelect.addEventListener('change', () => {
        this.renderSurveyResponsesTable();
      });
    }

    // تصدير استجابات الاستبيان كـ JSON
    if (this.dom.exportSurveyBtn) {
      this.dom.exportSurveyBtn.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.surveyResponses, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `quran-survey-responses-${new Date().toISOString().slice(0, 10)}.json`);
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
