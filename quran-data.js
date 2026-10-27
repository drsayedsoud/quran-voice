/**
 * بيانات القرآن الكريم والقراء ومفردات الأوامر الصوتية
 * المصحف الصوتي الميسر (Accessibility-First Quran)
 */

export const SURAHS = [
  { id: 1, name: "الفاتحة", transliteration: "Al-Fatihah", ayahs: 7, type: "مكية", aliases: ["الفاتحه", "أم الكتاب", "السبع المثاني", "الحمد"] },
  { id: 2, name: "البقرة", transliteration: "Al-Baqarah", ayahs: 286, type: "مدنية", aliases: ["البقره", "أطول سورة", "اية الكرسي"] },
  { id: 3, name: "آل عمران", transliteration: "Ali 'Imran", ayahs: 200, type: "مدنية", aliases: ["ال عمران", "عمران"] },
  { id: 4, name: "النساء", transliteration: "An-Nisa", ayahs: 176, type: "مدنية", aliases: ["النساء"] },
  { id: 5, name: "المائدة", transliteration: "Al-Ma'idah", ayahs: 120, type: "مدنية", aliases: ["المائده"] },
  { id: 6, name: "الأنعام", transliteration: "Al-An'am", ayahs: 165, type: "مكية", aliases: ["الانعام"] },
  { id: 7, name: "الأعراف", transliteration: "Al-A'raf", ayahs: 206, type: "مكية", aliases: ["الاعراف"] },
  { id: 8, name: "الأنفال", transliteration: "Al-Anfal", ayahs: 75, type: "مدنية", aliases: ["الانفال", "بدر"] },
  { id: 9, name: "التوبة", transliteration: "At-Tawbah", ayahs: 129, type: "مدنية", aliases: ["التوبه", "براءة", "براءه"] },
  { id: 10, name: "يونس", transliteration: "Yunus", ayahs: 109, type: "مكية", aliases: ["يونس"] },
  { id: 11, name: "هود", transliteration: "Hud", ayahs: 123, type: "مكية", aliases: ["هود"] },
  { id: 12, name: "يوسف", transliteration: "Yusuf", ayahs: 111, type: "مكية", aliases: ["يوسف"] },
  { id: 13, name: "الرعد", transliteration: "Ar-Ra'd", ayahs: 43, type: "مدنية", aliases: ["الرعد"] },
  { id: 14, name: "إبراهيم", transliteration: "Ibrahim", ayahs: 52, type: "مكية", aliases: ["ابراهيم"] },
  { id: 15, name: "الحجر", transliteration: "Al-Hijr", ayahs: 99, type: "مكية", aliases: ["الحجر"] },
  { id: 16, name: "النحل", transliteration: "An-Nahl", ayahs: 128, type: "مكية", aliases: ["النحل", "النعم"] },
  { id: 17, name: "الإسراء", transliteration: "Al-Isra", ayahs: 111, type: "مكية", aliases: ["الاسراء", "بني اسرائيل", "سبحان"] },
  { id: 18, name: "الكهف", transliteration: "Al-Kahf", ayahs: 110, type: "مكية", aliases: ["الكهف", "اهل الكهف"] },
  { id: 19, name: "مريم", transliteration: "Maryam", ayahs: 98, type: "مكية", aliases: ["مريم"] },
  { id: 20, name: "طه", transliteration: "Taha", ayahs: 135, type: "مكية", aliases: ["طه", "طاها"] },
  { id: 21, name: "الأنبياء", transliteration: "Al-Anbiya", ayahs: 112, type: "مكية", aliases: ["الانبياء"] },
  { id: 22, name: "الحج", transliteration: "Al-Hajj", ayahs: 78, type: "مدنية", aliases: ["الحج"] },
  { id: 23, name: "المؤمنون", transliteration: "Al-Mu'minun", ayahs: 118, type: "مكية", aliases: ["المؤمنون", "المومنون"] },
  { id: 24, name: "النور", transliteration: "An-Nur", ayahs: 64, type: "مدنية", aliases: ["النور"] },
  { id: 25, name: "الفرقان", transliteration: "Al-Furqan", ayahs: 77, type: "مكية", aliases: ["الفرقان"] },
  { id: 26, name: "الشعراء", transliteration: "Ash-Shu'ara", ayahs: 227, type: "مكية", aliases: ["الشعراء"] },
  { id: 27, name: "النمل", transliteration: "An-Naml", ayahs: 93, type: "مكية", aliases: ["النمل"] },
  { id: 28, name: "القصص", transliteration: "Al-Qasas", ayahs: 88, type: "مكية", aliases: ["القصص"] },
  { id: 29, name: "العنكبوت", transliteration: "Al-'Ankabut", ayahs: 69, type: "مكية", aliases: ["العنكبوت"] },
  { id: 30, name: "الروم", transliteration: "Ar-Rum", ayahs: 60, type: "مكية", aliases: ["الروم"] },
  { id: 31, name: "لقمان", transliteration: "Luqman", ayahs: 34, type: "مكية", aliases: ["لقمان"] },
  { id: 32, name: "السجدة", transliteration: "As-Sajdah", ayahs: 30, type: "مكية", aliases: ["السجدة", "السجده"] },
  { id: 33, name: "الأحزاب", transliteration: "Al-Ahzab", ayahs: 73, type: "مدنية", aliases: ["الاحزاب"] },
  { id: 34, name: "سبأ", transliteration: "Saba", ayahs: 54, type: "مكية", aliases: ["سبا", "سبأ"] },
  { id: 35, name: "فاطر", transliteration: "Fatir", ayahs: 45, type: "مكية", aliases: ["فاطر", "الملائكة"] },
  { id: 36, name: "يس", transliteration: "Ya-Sin", ayahs: 83, type: "مكية", aliases: ["يس", "ياسين", "يسن", "قلب القران"] },
  { id: 37, name: "الصافات", transliteration: "As-Saffat", ayahs: 182, type: "مكية", aliases: ["الصافات"] },
  { id: 38, name: "ص", transliteration: "Sad", ayahs: 88, type: "مكية", aliases: ["ص", "صاد"] },
  { id: 39, name: "الزمر", transliteration: "Az-Zumar", ayahs: 75, type: "مكية", aliases: ["الزمر"] },
  { id: 40, name: "غافر", transliteration: "Ghafir", ayahs: 85, type: "مكية", aliases: ["غافر", "المؤمن", "المومن", "حم"] },
  { id: 41, name: "فصلت", transliteration: "Fussilat", ayahs: 54, type: "مكية", aliases: ["فصلت"] },
  { id: 42, name: "الشورى", transliteration: "Ash-Shura", ayahs: 53, type: "مكية", aliases: ["الشورى", "الشورى"] },
  { id: 43, name: "الزخرف", transliteration: "Az-Zukhruf", ayahs: 89, type: "مكية", aliases: ["الزخرف"] },
  { id: 44, name: "الدخان", transliteration: "Ad-Dukhan", ayahs: 59, type: "مكية", aliases: ["الدخان"] },
  { id: 45, name: "الجاثية", transliteration: "Al-Jathiyah", ayahs: 37, type: "مكية", aliases: ["الجاثية", "الجاثيه"] },
  { id: 46, name: "الأحقاف", transliteration: "Al-Ahqaf", ayahs: 35, type: "مكية", aliases: ["الاحقاف"] },
  { id: 47, name: "محمد", transliteration: "Muhammad", ayahs: 38, type: "مدنية", aliases: ["محمد", "القتال"] },
  { id: 48, name: "الفتح", transliteration: "Al-Fath", ayahs: 29, type: "مدنية", aliases: ["الفتح"] },
  { id: 49, name: "الحجرات", transliteration: "Al-Hujurat", ayahs: 18, type: "مدنية", aliases: ["الحجرات"] },
  { id: 50, name: "ق", transliteration: "Qaf", ayahs: 45, type: "مكية", aliases: ["ق", "قاف"] },
  { id: 51, name: "الذاريات", transliteration: "Adh-Dhariyat", ayahs: 60, type: "مكية", aliases: ["الذاريات"] },
  { id: 52, name: "الطور", transliteration: "At-Tur", ayahs: 49, type: "مكية", aliases: ["الطور"] },
  { id: 53, name: "النجم", transliteration: "An-Najm", ayahs: 62, type: "مكية", aliases: ["النجم"] },
  { id: 54, name: "القمر", transliteration: "Al-Qamar", ayahs: 55, type: "مكية", aliases: ["القمر", "اقتربت"] },
  { id: 55, name: "الرحمن", transliteration: "Ar-Rahman", ayahs: 78, type: "مدنية", aliases: ["الرحمن", "عروس القران"] },
  { id: 56, name: "الواقعة", transliteration: "Al-Waqi'ah", ayahs: 96, type: "مكية", aliases: ["الواقعة", "الواقعه"] },
  { id: 57, name: "الحديد", transliteration: "Al-Hadid", ayahs: 29, type: "مدنية", aliases: ["الحديد"] },
  { id: 58, name: "المجادلة", transliteration: "Al-Mujadila", ayahs: 22, type: "مدنية", aliases: ["المجادلة", "المجادله", "قد سمع"] },
  { id: 59, name: "الحشر", transliteration: "Al-Hashr", ayahs: 24, type: "مدنية", aliases: ["الحشر"] },
  { id: 60, name: "الممتحنة", transliteration: "Al-Mumtahanah", ayahs: 13, type: "مدنية", aliases: ["الممتحنة", "الممتحنه"] },
  { id: 61, name: "الصف", transliteration: "As-Saff", ayahs: 14, type: "مدنية", aliases: ["الصف"] },
  { id: 62, name: "الجمعة", transliteration: "Al-Jumu'ah", ayahs: 11, type: "مدنية", aliases: ["الجمعة", "الجمعه"] },
  { id: 63, name: "المنافقون", transliteration: "Al-Munafiqun", ayahs: 11, type: "مدنية", aliases: ["المنافقون"] },
  { id: 64, name: "التغابن", transliteration: "At-Taghabun", ayahs: 18, type: "مدنية", aliases: ["التغابن"] },
  { id: 65, name: "الطلاق", transliteration: "At-Talaq", ayahs: 12, type: "مدنية", aliases: ["الطلاق"] },
  { id: 66, name: "التحريم", transliteration: "At-Tahrim", ayahs: 12, type: "مدنية", aliases: ["التحريم"] },
  { id: 67, name: "الملك", transliteration: "Al-Mulk", ayahs: 30, type: "مكية", aliases: ["الملك", "تبارك", "المنجية", "الواقيه"] },
  { id: 68, name: "القلم", transliteration: "Al-Qalam", ayahs: 52, type: "مكية", aliases: ["القلم", "ن"] },
  { id: 69, name: "الحاقة", transliteration: "Al-Haqqah", ayahs: 52, type: "مكية", aliases: ["الحاقة", "الحاقه"] },
  { id: 70, name: "المعارج", transliteration: "Al-Ma'arij", ayahs: 44, type: "مكية", aliases: ["المعارج"] },
  { id: 71, name: "نوح", transliteration: "Nuh", ayahs: 28, type: "مكية", aliases: ["نوح"] },
  { id: 72, name: "الجن", transliteration: "Al-Jinn", ayahs: 28, type: "مكية", aliases: ["الجن"] },
  { id: 73, name: "المزمل", transliteration: "Al-Muzzammil", ayahs: 20, type: "مكية", aliases: ["المزمل"] },
  { id: 74, name: "المدثر", transliteration: "Al-Muddaththir", ayahs: 56, type: "مكية", aliases: ["المدثر"] },
  { id: 75, name: "القيامة", transliteration: "Al-Qiyamah", ayahs: 40, type: "مكية", aliases: ["القيامة", "القيامه", "لا اقسم"] },
  { id: 76, name: "الإنسان", transliteration: "Al-Insan", ayahs: 31, type: "مدنية", aliases: ["الانسان", "الدهر", "هل اتى"] },
  { id: 77, name: "المرسلات", transliteration: "Al-Mursalat", ayahs: 50, type: "مكية", aliases: ["المرسلات"] },
  { id: 78, name: "النبأ", transliteration: "An-Naba", ayahs: 40, type: "مكية", aliases: ["النبأ", "السبأ", "النبا", "عم", "عما يتساءلون"] },
  { id: 79, name: "النازعات", transliteration: "An-Nazi'at", ayahs: 46, type: "مكية", aliases: ["النازعات"] },
  { id: 80, name: "عبس", transliteration: "'Abasa", ayahs: 42, type: "مكية", aliases: ["عبس", "الاعمى"] },
  { id: 81, name: "التكوير", transliteration: "At-Takwir", ayahs: 29, type: "مكية", aliases: ["التكوير", "اذا الشمس كورت"] },
  { id: 82, name: "الانفطار", transliteration: "Al-Infitar", ayahs: 19, type: "مكية", aliases: ["الانفطار"] },
  { id: 83, name: "المطففين", transliteration: "Al-Mutaffifin", ayahs: 36, type: "مكية", aliases: ["المطففين"] },
  { id: 84, name: "الانشقاق", transliteration: "Al-Inshiqaq", ayahs: 25, type: "مكية", aliases: ["الانشقاق"] },
  { id: 85, name: "البروج", transliteration: "Al-Buruj", ayahs: 22, type: "مكية", aliases: ["البروج"] },
  { id: 86, name: "الطارق", transliteration: "At-Tariq", ayahs: 17, type: "مكية", aliases: ["الطارق"] },
  { id: 87, name: "الأعلى", transliteration: "Al-A'la", ayahs: 19, type: "مكية", aliases: ["الاعلى", "سبح اسم ربك"] },
  { id: 88, name: "الغاشية", transliteration: "Al-Ghashiyah", ayahs: 26, type: "مكية", aliases: ["الغاشية", "الغاشيه", "هل اتاك حديث الغاشية"] },
  { id: 89, name: "الفجر", transliteration: "Al-Fajr", ayahs: 30, type: "مكية", aliases: ["الفجر", "والفجر"] },
  { id: 90, name: "البلد", transliteration: "Al-Balad", ayahs: 20, type: "مكية", aliases: ["البلد", "لا اقسم بهذا البلد"] },
  { id: 91, name: "الشمس", transliteration: "Ash-Shams", ayahs: 15, type: "مكية", aliases: ["الشمس", "والشمس وضحاها"] },
  { id: 92, name: "الليل", transliteration: "Al-Layl", ayahs: 21, type: "مكية", aliases: ["الليل", "والليل اذا يغشى"] },
  { id: 93, name: "الضحى", transliteration: "Ad-Duha", ayahs: 11, type: "مكية", aliases: ["الضحى", "والضحى"] },
  { id: 94, name: "الشرح", transliteration: "Ash-Sharh", ayahs: 8, type: "مكية", aliases: ["الشرح", "الانشراح", "الم نشرح"] },
  { id: 95, name: "التين", transliteration: "At-Tin", ayahs: 8, type: "مكية", aliases: ["التين", "والتين والزيتون"] },
  { id: 96, name: "العلق", transliteration: "Al-'Alaq", ayahs: 19, type: "مكية", aliases: ["العلق", "اقرا", "اقرأ", "اقرأ باسم ربك"] },
  { id: 97, name: "القدر", transliteration: "Al-Qadr", ayahs: 5, type: "مكية", aliases: ["القدر", "انا انزلناه في ليلة القدر"] },
  { id: 98, name: "البينة", transliteration: "Al-Bayyinah", ayahs: 8, type: "مدنية", aliases: ["البينة", "البينه", "لم يكن الذين كفروا"] },
  { id: 99, name: "الزلزلة", transliteration: "Az-Zalzalah", ayahs: 8, type: "مدنية", aliases: ["الزلزلة", "الزلزله", "اذا زلزلت"] },
  { id: 100, name: "العاديات", transliteration: "Al-'Adiyat", ayahs: 11, type: "مكية", aliases: ["العاديات", "والعاديات ضبحا"] },
  { id: 101, name: "القارعة", transliteration: "Al-Qari'ah", ayahs: 11, type: "مكية", aliases: ["القارعة", "القارعه"] },
  { id: 102, name: "التكاثر", transliteration: "At-Takathur", ayahs: 8, type: "مكية", aliases: ["التكاثر", "الهاكم التكاثر"] },
  { id: 103, name: "العصر", transliteration: "Al-'Asr", ayahs: 3, type: "مكية", aliases: ["العصر", "والعصر"] },
  { id: 104, name: "الهمزة", transliteration: "Al-Humazah", ayahs: 9, type: "مكية", aliases: ["الهمزة", "الهمزه", "ويل لكل همزة"] },
  { id: 105, name: "الفيل", transliteration: "Al-Fil", ayahs: 5, type: "مكية", aliases: ["الفيل", "الم تر كيف فعل ربك باصحاب الفيل"] },
  { id: 106, name: "قريش", transliteration: "Quraysh", ayahs: 4, type: "مكية", aliases: ["قريش", "لايلاف قريش"] },
  { id: 107, name: "الماعون", transliteration: "Al-Ma'un", ayahs: 7, type: "مكية", aliases: ["الماعون", "ارايت الذي يكذب"] },
  { id: 108, name: "الكوثر", transliteration: "Al-Kawthar", ayahs: 3, type: "مكية", aliases: ["الكوثر", "انا اعطيناك الكوثر"] },
  { id: 109, name: "الكافرون", transliteration: "Al-Kafirun", ayahs: 6, type: "مكية", aliases: ["الكافرون", "قل يا ايها الكافرون"] },
  { id: 110, name: "النصر", transliteration: "An-Nasr", ayahs: 3, type: "مدنية", aliases: ["النصر", "اذا جاء نصر الله والفتح"] },
  { id: 111, name: "المسد", transliteration: "Al-Masad", ayahs: 5, type: "مكية", aliases: ["المسد", "تبت", "تبت يدا ابي لهب"] },
  { id: 112, name: "الإخلاص", transliteration: "Al-Ikhlas", ayahs: 4, type: "مكية", aliases: ["الاخلاص", "التوحيد", "قل هو الله احد"] },
  { id: 113, name: "الفلق", transliteration: "Al-Falaq", ayahs: 5, type: "مكية", aliases: ["الفلق", "المعوذة الاولى", "قل اعوذ برب الفلق"] },
  { id: 114, name: "الناس", transliteration: "An-Nas", ayahs: 6, type: "مكية", aliases: ["الناس", "المعوذة الثانية", "قل اعوذ برب الناس"] }
];

export const RECITERS = [
  {
    id: "husary",
    name: "محمود خليل الحصري",
    subname: "مرتل",
    folder: "Husary_64kbps",
    surahServer: "server13.mp3quran.net/husr",
    sampleText: "تلاوة متقنة هادئة مناسبة للتدبر والحفظ ومخارج الحروف",
    aliases: ["الحصري", "حصري", "الشيخ الحصري"]
  },
  {
    id: "minshawi_muallim",
    name: "محمد صديق المنشاوي (المصحف المعلم)",
    subname: "ترديد أطفال",
    folder: "Minshawy_Teacher_128kbps",
    surahServer: "cdn.mp3quran.net/audio/muhammad-minshawi/r3",
    sampleText: "المصحف المعلم بصوت الشيخ المنشاوي مع ترديد الأطفال بنبرة خاشعة شجية لتعليم الصغار والناشئة",
    aliases: [
      "المصحف المعلم", "مصحف المعلم", "المعلم", "معلم",
      "مصحف الترديد", "مصحف ترديد", "ترديد الأطفال", "ترديد الاطفال", "ترديد اطفال",
      "تحفيظ الأطفال", "تحفيظ الاطفال", "تعليم الأطفال", "تعليم الاطفال",
      "وضع المعلم للأطفال", "وضع المعلم للاطفال", "وضع المعلم", "المعلم للأطفال", "المعلم للاطفال",
      "حفظلي ابني", "حفظ الطفل", "تحفيظ الطفل",
      "معلم المنشاوي", "المنشاوي معلم", "المنشاوي المعلم", "المصحف المعلم المنشاوي", "منشاوي معلم", "مصحف المنشاوي المعلم", "ترديد المنشاوي"
    ]
  },
  {
    id: "husary_muallim",
    name: "محمود خليل الحصري (المصحف المعلم)",
    subname: "ترديد أطفال",
    folder: "Husary_Muallim_128kbps",
    ecoFolder: "Husary_64kbps",
    surahServer: "archive.org/download/Quran--alhosary--teacher-repeat-kids-high-quality",
    sampleText: "المصحف المعلم برواية حفص بصوت الشيخ الحصري مع ترديد الأطفال لتعليم مخارج الحروف وأحكام التلاوة",
    aliases: [
      "معلم الحصري", "الحصري معلم", "الحصري المعلم", "المصحف المعلم الحصري", "حصري معلم",
      "مصحف الحصري المعلم", "مصحف الحصري معلم", "ترديد الحصري", "مصحف الحصري ترديد", "المصحف المعلم بصوت الحصري"
    ]
  },
  {
    id: "minshawi",
    name: "محمد صديق المنشاوي",
    subname: "مرتل",
    folder: "Minshawy_Murattal_128kbps",
    surahServer: "server10.mp3quran.net/minsh",
    sampleText: "تلاوة خاشعة شجية تأسر القلوب",
    aliases: ["المنشاوي", "منشاوي", "الشيخ المنشاوي"]
  },
  {
    id: "abdulbasit",
    name: "عبد الباسط عبد الصمد",
    subname: "مرتل",
    folder: "Abdul_Basit_Murattal_64kbps",
    surahServer: "server7.mp3quran.net/basit",
    sampleText: "صوت نقي فخم ومعروف في العالم الإسلامي",
    aliases: ["عبد الباسط", "عبدالباسط", "عبد الصمد"]
  },
  {
    id: "minshawi_mujawwad",
    name: "محمد صديق المنشاوي (المصحف المجود)",
    subname: "مجود",
    folder: "Minshawy_Mujawwad_192kbps",
    ecoFolder: "Minshawy_Murattal_128kbps",
    surahServer: "cdn.mp3quran.net/audio/muhammad-minshawi/r2",
    sampleText: "تلاوة مجودة بالمقامات الخاشعة والأداء الشجي الفريد",
    aliases: ["المنشاوي مجود", "منشاوي مجود", "مجود المنشاوي", "تلاوة مجودة المنشاوي", "المصحف المجود المنشاوي", "مجود", "المصحف المجود", "تلاوة مجودة"]
  },
  {
    id: "abdulbasit_mujawwad",
    name: "عبد الباسط عبد الصمد (المصحف المجود)",
    subname: "مجود",
    folder: "Abdul_Basit_Mujawwad_128kbps",
    ecoFolder: "Abdul_Basit_Murattal_64kbps",
    surahServer: "cdn.mp3quran.net/audio/abdulbasit-abdulsamad/r2",
    sampleText: "التلاوة المجودة التاريخية الخالدة برواية حفص",
    aliases: ["عبد الباسط مجود", "عبدالباسط مجود", "مجود عبد الباسط", "تلاوة مجودة عبد الباسط", "المصحف المجود عبد الباسط"]
  },
  {
    id: "husary_mujawwad",
    name: "محمود خليل الحصري (المصحف المجود)",
    subname: "مجود",
    folder: "Husary_128kbps_Mujawwad",
    ecoFolder: "Husary_64kbps",
    surahServer: "cdn.mp3quran.net/audio/mahmoud-husary/r2",
    sampleText: "المصحف المجود المتقن بأعلى درجات ضبط أحكام التجويد ومخارج الحروف",
    aliases: ["الحصري مجود", "حصري مجود", "مجود الحصري", "تلاوة مجودة الحصري", "المصحف المجود الحصري"]
  },
  {
    id: "afasy",
    name: "مشاري بن راشد العفاسي",
    subname: "مرتل",
    folder: "Alafasy_128kbps",
    ecoFolder: "Alafasy_64kbps",
    surahServer: "server8.mp3quran.net/afs",
    sampleText: "أداء مميز وصوت عذب حديث",
    aliases: ["العفاسي", "عفاسي", "مشاري"]
  },
  {
    id: "muaiqly",
    name: "ماهر المعيقلي",
    subname: "إمام الحرم المكي",
    folder: "Maher_AlMuaiqly_64kbps",
    surahServer: "server12.mp3quran.net/maher",
    sampleText: "تلاوة رخيمة هادئة تأخذك إلى رحاب الحرم المكي",
    aliases: ["المعيقلي", "معيقلي", "ماهر"]
  },
  {
    id: "hudhaify",
    name: "علي عبد الرحمن الحذيفي",
    subname: "إمام المسجد النبوي",
    folder: "Hudhaify_64kbps",
    surahServer: "server9.mp3quran.net/hthfi",
    sampleText: "تلاوة محكمة واضحة بمخارج فصحى دقيقة",
    aliases: ["الحذيفي", "حذيفي", "علي الحذيفي"]
  },
  {
    id: "ghamadi",
    name: "سعد الغامدي",
    subname: "مرتل",
    folder: "Ghamadi_40kbps",
    surahServer: "server7.mp3quran.net/s_gmd",
    sampleText: "صوت سلس مريح ومحبوب للمراجعة اليومية",
    aliases: ["الغامدي", "غامدي", "سعد"]
  },
  {
    id: "ajamy",
    name: "أحمد بن علي العجمي",
    subname: "مرتل",
    folder: "Ahmed_ibn_Ali_al-Ajamy_64kbps_QuranExplorer.Com",
    surahServer: "server10.mp3quran.net/ajm",
    sampleText: "نبرة قوية مؤثرة وحضور صوتي عالٍ",
    aliases: ["العجمي", "عجمي", "احمد العجمي"]
  },
  {
    id: "sudais",
    name: "عبد الرحمن السديس",
    subname: "إمام المسجد الحرام",
    folder: "Abdurrahmaan_As-Sudais_192kbps",
    surahServer: "cdn.mp3quran.net/audio/abdulrahman-sudais/r1",
    sampleText: "نبرة جليلة خاشعة مؤثرة ارتبطت بوجدان المسلمين في الحرم المكي الشريف",
    aliases: ["السديس", "سديس", "عبد الرحمن السديس", "عبدالرحمن السديس", "الشيخ السديس", "السديس والشريم", "السديس و الشريم"]
  },
  {
    id: "shuraym",
    name: "سعود الشريم",
    subname: "إمام المسجد الحرام",
    folder: "Saood_ash-Shuraym_128kbps",
    surahServer: "cdn.mp3quran.net/audio/saud-shuraim/r1",
    sampleText: "تلاوة رصينة سريعة متقنة وبصمة خالدة في محراب الكعبة المشرفة",
    aliases: ["الشريم", "شريم", "سعود الشريم", "الشيخ الشريم", "سعود بن ابراهيم الشريم", "سعود بن إبراهيم الشريم", "الشريم والسديس", "الشريم و السديس"]
  },
  {
    id: "baleela",
    name: "بندر بليلة",
    subname: "إمام المسجد الحرام",
    folder: "Bandar_Baleela_64kbps",
    surahServer: "cdn.mp3quran.net/audio/bandar-baleela/r1",
    sampleText: "تلاوة ندية عذبة تجري بالسكينة والخشوع من جنبات الحرم المكي",
    aliases: ["بندر بليلة", "بندر بليله", "بليلة", "بليله", "الشيخ بندر بليلة", "الشيخ بندر بليله", "بندر"]
  },
  {
    id: "turki",
    name: "بدر التركي",
    subname: "إمام المسجد الحرام",
    folder: "Badr_Al_Turki_64kbps",
    surahServer: "cdn.mp3quran.net/audio/badr-turki/r1",
    sampleText: "تلاوة حجازية شجية خاشعة تأسر الألباب من أئمة الحرم المكي",
    aliases: ["بدر التركي", "التركي", "الشيخ بدر التركي", "بدر تركي"]
  }
];

/**
 * تحديد مجلد القارئ الفعال بناءً على وضع توفير البيانات (SoundCloud Data Saver)
 * يختار النسخة الاقتصادية (40-64kbps) تلقائياً لتوفير 50-65% من الاستهلاك
 */
export function getEffectiveReciterFolder(reciter, isSaverMode = false) {
  if (!reciter) return 'Husary_64kbps';
  if (isSaverMode && reciter.ecoFolder) {
    return reciter.ecoFolder;
  }
  return reciter.folder || 'Husary_64kbps';
}

/**
 * دالة مساعدة لبناء رابط صوت الآية المباشر من مستودع EveryAyah عالي السرعة
 */
export function getAyahAudioUrl(reciterFolder, surahNumber, ayahNumber) {
  const s = String(surahNumber).padStart(3, '0');
  const a = String(ayahNumber).padStart(3, '0');
  return `https://everyayah.com/data/${reciterFolder}/${s}${a}.mp3`;
}

/**
 * دالة مساعدة لبناء رابط صوت السورة الكاملة المتدفق (Continuous Surah Streaming)
 * يدعم التخزين المسبق التدريجي للمتصفح (Progressive Buffer) مثل SoundCloud و Spotify
 */
export function getSurahAudioUrl(reciter, surahNumber) {
  if (!reciter) return null;
  const s = String(surahNumber).padStart(3, '0');
  let server = reciter.surahServer || 'server8.mp3quran.net/afs';
  server = server.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${server}/${s}.mp3`;
}

/**
 * بيانات الأجزاء الثلاثين للقرآن الكريم (The 30 Quranic Ajzaa)
 * تتيح التنقل المباشر والسريع للأجزاء صوتياً للمكفوفين وحفّاظ كتاب الله
 */
export const JUZ_DATA = [
  { juz: 1, surahId: 1, ayahNumber: 1, name: "الجزء الأول", alias: "الفاتحة", title: "الم" },
  { juz: 2, surahId: 2, ayahNumber: 142, name: "الجزء الثاني", alias: "سيقول", title: "سيقول السفهاء" },
  { juz: 3, surahId: 2, ayahNumber: 253, name: "الجزء الثالث", alias: "تلك الرسل", title: "تلك الرسل" },
  { juz: 4, surahId: 3, ayahNumber: 93, name: "الجزء الرابع", alias: "لن تنالوا", title: "لن تنالوا البر" },
  { juz: 5, surahId: 4, ayahNumber: 24, name: "الجزء الخامس", alias: "والمحصنات", title: "والمحصنات" },
  { juz: 6, surahId: 4, ayahNumber: 148, name: "الجزء السادس", alias: "لا يحب الله", title: "لا يحب الله" },
  { juz: 7, surahId: 5, ayahNumber: 82, name: "الجزء السابع", alias: "لتجدن", title: "لتجدن أشد الناس" },
  { juz: 8, surahId: 6, ayahNumber: 111, name: "الجزء الثامن", alias: "ولو اننا", title: "ولو أننا نزلنا" },
  { juz: 9, surahId: 7, ayahNumber: 88, name: "الجزء التاسع", alias: "قال الملا", title: "قال الملأ" },
  { juz: 10, surahId: 8, ayahNumber: 41, name: "الجزء العاشر", alias: "واعلموا", title: "واعلموا أنما غنمتم" },
  { juz: 11, surahId: 9, ayahNumber: 93, name: "الجزء الحادي عشر", alias: "يعتذرون", title: "إنما السبيل" },
  { juz: 12, surahId: 11, ayahNumber: 6, name: "الجزء الثاني عشر", alias: "وما من دابة", title: "وما من دابة" },
  { juz: 13, surahId: 12, ayahNumber: 53, name: "الجزء الثالث عشر", alias: "وما ابرئ نفسي", title: "وما أبرئ نفسي" },
  { juz: 14, surahId: 15, ayahNumber: 1, name: "الجزء الرابع عشر", alias: "ربما", title: "الر تلك آيات الكتاب" },
  { juz: 15, surahId: 17, ayahNumber: 1, name: "الجزء الخامس عشر", alias: "سبحان", title: "سبحان الذي أسرى" },
  { juz: 16, surahId: 18, ayahNumber: 75, name: "الجزء السادس عشر", alias: "قال الم", title: "قال ألم أقل لك" },
  { juz: 17, surahId: 21, ayahNumber: 1, name: "الجزء السابع عشر", alias: "اقترب", title: "اقترب للناس حسابهم" },
  { juz: 18, surahId: 23, ayahNumber: 1, name: "الجزء الثامن عشر", alias: "قد افلح", title: "قد أفلح المؤمنون" },
  { juz: 19, surahId: 25, ayahNumber: 21, name: "الجزء التاسع عشر", alias: "وقال الذين لا يرجون", title: "وقال الذين لا يرجون" },
  { juz: 20, surahId: 27, ayahNumber: 56, name: "الجزء العشرون", alias: "فما كان", title: "فما كان جواب قومه" },
  { juz: 21, surahId: 29, ayahNumber: 46, name: "الجزء الحادي والعشرون", alias: "ولا تجادلوا", title: "اتل ما أوحي إليك" },
  { juz: 22, surahId: 33, ayahNumber: 31, name: "الجزء الثاني والعشرون", alias: "ومن يقنت", title: "ومن يقنت منكن" },
  { juz: 23, surahId: 36, ayahNumber: 28, name: "الجزء الثالث والعشرون", alias: "وما انزلنا", title: "وما أنزلنا على قومه" },
  { juz: 24, surahId: 39, ayahNumber: 32, name: "الجزء الرابع والعشرون", alias: "فمن اظلم", title: "فمن أظلم ممن كذب" },
  { juz: 25, surahId: 41, ayahNumber: 47, name: "الجزء الخامس والعشرون", alias: "اليه يرد", title: "إليه يرد علم الساعة" },
  { juz: 26, surahId: 46, ayahNumber: 1, name: "الجزء السادس والعشرون", alias: "حم", title: "حم تنزيل الكتاب" },
  { juz: 27, surahId: 51, ayahNumber: 31, name: "الجزء السابع والعشرون", alias: "قال فما خطبكم", title: "قال فما خطبكم أيها المرسلون" },
  { juz: 28, surahId: 58, ayahNumber: 1, name: "الجزء الثامن والعشرون", alias: "قد سمع", title: "قد سمع الله قول التي تجادلك" },
  { juz: 29, surahId: 67, ayahNumber: 1, name: "الجزء التاسع والعشرون", alias: "تبارك", title: "تبارك الذي بيده الملك" },
  { juz: 30, surahId: 78, ayahNumber: 1, name: "الجزء الثلاثون", alias: "عم", title: "عم يتساءلون" }
];

