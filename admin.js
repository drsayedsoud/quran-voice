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

      // المستخدمين
      usersTableBody: document.getElementById('usersTableBody')
    };

    this.init();
  }

  init() {
    this.bindAuthEvents();
    // التحقق من جلسة الأدمن المخزنة محلياً
    if (sessionStorage.getItem('quran_admin_auth') === 'true') {
      this.unlockDashboard();
    }
  }

  bindAuthEvents() {
    const handleLogin = () => {
      const pin = this.dom.pinInput.value.trim();
      // رمز مرور المشرف: 1153
      if (pin === '1153') {
        sessionStorage.setItem('quran_admin_auth', 'true');
        this.unlockDashboard();
      } else {
        this.dom.pinError.classList.remove('hidden');
      }
    };

    this.dom.pinSubmitBtn.addEventListener('click', handleLogin);
    this.dom.pinInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleLogin();
    });

    this.dom.logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('quran_admin_auth');
      window.location.reload();
    });
  }

  unlockDashboard() {
    this.isAuthenticated = true;
    this.dom.loginOverlay.classList.add('hidden');
    this.dom.dashboardContent.classList.remove('hidden');

    this.subscribeToUsers();
    this.subscribeToVoiceLogs();
    this.subscribeToBroadcastConfig();
    this.bindDashboardEvents();
  }

  // 1. مراقبة المستخدمين لحظياً من Firestore
  subscribeToUsers() {
    try {
      const usersCol = collection(db, "users");
      onSnapshot(usersCol, (snapshot) => {
        this.usersData = [];
        let totalAyahs = 0;
        const reciterCounts = {};

        snapshot.forEach((docSnap) => {
          const user = docSnap.data();
          this.usersData.push(user);

          const ayahs = user.stats?.totalAyahsListened || 0;
          totalAyahs += ayahs;

          const reciter = user.preferences?.reciterId || 'husary';
          reciterCounts[reciter] = (reciterCounts[reciter] || 0) + 1;
        });

        // تحديث كروت المؤشرات
        this.dom.statTotalUsers.textContent = this.usersData.length.toLocaleString('ar-EG');
        this.dom.statTotalAyahs.textContent = totalAyahs.toLocaleString('ar-EG');

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
        this.dom.usersTableBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-amber-400">تأكد من تطبيق قواعد Firestore Security Rules للمعاينة الحية</td></tr>`;
      });
    } catch (e) {
      console.error(e);
    }
  }

  renderUsersTable() {
    if (!this.usersData.length) {
      this.dom.usersTableBody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-500">لا يوجد مستخدمون مسجلون حتى الآن</td></tr>`;
      return;
    }

    this.dom.usersTableBody.innerHTML = this.usersData.map((u) => {
      const uidShort = u.uid ? u.uid.substring(0, 10) + '...' : 'مجهول';
      const device = u.deviceInfo?.userAgent ? u.deviceInfo.userAgent.substring(0, 35) + '...' : 'غير معروف';
      const isPwa = u.deviceInfo?.isPwa ? '<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">نعم PWA</span>' : '<span class="text-slate-500">متصفح</span>';
      const lastPos = u.lastPosition ? `سورة ${u.lastPosition.surahName || u.lastPosition.surahId} (آية ${u.lastPosition.ayahNumber})` : 'لم يبدأ';
      const reciter = RECITERS.find(r => r.id === u.preferences?.reciterId)?.name || u.preferences?.reciterId || 'الحصري';
      const ayahs = u.stats?.totalAyahsListened || 0;
      
      let lastActive = 'الآن';
      if (u.lastActiveAt && u.lastActiveAt.toDate) {
        lastActive = u.lastActiveAt.toDate().toLocaleTimeString('ar-EG');
      }

      return `
        <tr class="hover:bg-slate-900/60 transition-colors">
          <td class="p-3 font-mono text-amber-400">${uidShort}</td>
          <td class="p-3 text-slate-300" title="${u.deviceInfo?.userAgent || ''}">${device}</td>
          <td class="p-3">${isPwa}</td>
          <td class="p-3 text-emerald-300 font-semibold">${lastPos}</td>
          <td class="p-3 text-slate-200">الشيخ ${reciter}</td>
          <td class="p-3 font-bold text-amber-300">${ayahs}</td>
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
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new AdminDashboard();
});
