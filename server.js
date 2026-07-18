const express = require('express');
const cookieSession = require('cookie-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const cors = require('cors');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const { getUserPermissions } = require('./config/roles'); 

// استدعاء جميع دوال الشيت بشكل سليم ومرة واحدة فقط
const { 
    getRawApplications, 
    getApplications, 
    acceptFromRawToAcademy, 
    rejectRawApplicant, 
    updateApplicationStage, 
    gradeApplicant, 
    decideInterview,
    advancedGradeApplicant,
    sendToFinalDecision,
    toggleException,
    finalDecision,
    getGuideQuestions,
    addGuideQuestion,
    deleteGuideQuestion,
    getTemplates,      // ✨ تم دمجها هنا لمنع التكرار
    saveTemplate       // ✨ تم دمجها هنا لمنع التكرار
} = require('./services/sheets');

const app = express();
app.use(cors());

// زيادة حجم البيانات المسموح به لمنع خطأ (تعذر الاتصال بالسيرفر)
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// تعريف مجلد الصور والستايل بشكل صحيح إجباري
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// استخدام نظام الجلسات المشفرة ليتوافق مع سيرفرات Vercel بشكل مثالي
// استخدام نظام الجلسات المشفرة ليتوافق مع سيرفرات Vercel بشكل مثالي
app.use(cookieSession({
    name: 'academy-session',
    keys: ['secret-military-academy-key-2026'],
    maxAge: 7 * 24 * 60 * 60 * 1000 // الجلسة تحفظ لمدة 7 أيام متواصلة
}));
// 👇 الكود السحري لحل مشكلة التعليق اللانهائي مع Vercel و Passport 👇
app.set('trust proxy', 1);

app.use((req, res, next) => {
    if (req.session && !req.session.regenerate) {
        req.session.regenerate = (cb) => { cb() }
    }
    if (req.session && !req.session.save) {
        req.session.save = (cb) => { cb() }
    }
    next();
});

app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify', 'guilds', 'guilds.members.read']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // استخدام axios بدلاً من fetch لضمان التوافق الكامل مع خوادم Vercel
        const response = await axios.get(`https://discord.com/api/users/@me/guilds/${process.env.GUILD_ID}/member`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        const memberData = response.data;
        const userRoles = memberData.roles || [];
        const permissions = getUserPermissions(userRoles); // دالة الصلاحيات حقتك
        
        return done(null, {
            id: profile.id,
            username: profile.username,
            avatar: profile.avatar,
            roles: userRoles,
            permissions: permissions
        });
    } catch (error) {
        console.error("⛔ Discord Strategy Error:", error.message);
        // في حال فشل جلب الرتب من السيرفر، نمرر الحساب بصلاحيات فارغة بدلاً من إسقاط السيرفر كاملاً
        return done(null, {
            id: profile.id,
            username: profile.username,
            avatar: profile.avatar,
            roles: [],
            permissions: typeof getUserPermissions === 'function' ? getUserPermissions([]) : {}
        });
    }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.get('/', (req, res) => res.redirect('/dashboard'));
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/dashboard');
});

// 1. الصفحة الرئيسية (مع الحساب الصحيح للأرقام وإرسال المتغيرات بأمان)
app.get('/dashboard', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    
    const rawApps = await getRawApplications();
    const academyApps = await getApplications();
    
    const allIds = new Set([...rawApps.map(a => a.id), ...academyApps.map(a => a.copyId || a.id)]);
    const totalCount = allIds.size; 
    
    const prelimCount = academyApps.filter(a => a.stage === 'preliminary' || a.stage === 'مقبول مبدئيا').length;
    const passedCount = academyApps.filter(a => a.totalScore >= 40).length;
    const failedCount = academyApps.filter(a => (a.totalScore > 0 && a.totalScore <= 39) || a.status.includes('مرفوض')).length;

    // مصفوفة أعضاء الكلية: يمكنك نسخ الأسطر أدناه وتعديلها لإضافة أي عضو جديد
    const trainersList = [
    { name: "باسل صخر", role: "عريف", duty: "مدرب استيقافات" },
    { name: "امين العبادي", role: "جندي أول", duty: "مدرب عمليات" },
    { name: "مالك البتار", role: "جندي", duty: "مدرب التفاوض" },
    { name: "غوار المغوار", role: "جندي", duty: "مدرب استيقافات" },
    { name: "ضرغام حلتاوي", role: "جندي", duty: "مدرب عمليات" },
    { name: "فهمي النمس", role: "جندي", duty: "مدرب (لم يتم التحديد)" },
    { name: "جساس الشايب", role: "جندي", duty: "مدرب (لم يتم التحديد)" },
    { name: "حمد فولاد", role: "جندي", duty: "مدرب (لم يتم التحديد)" },
    { name: "ود خالد" , role: "جندي" , duty: "مدربة (لم يتم التحديد)" }
    //{ name: "ايدا مارتينيز", role: "جندي", duty: "مدربة استيقافات" },
];

    res.render('dashboard', { 
        user: req.user, 
        applications: academyApps,
        stats: { totalCount, prelimCount, passedCount, failedCount },
        trainers: trainersList,
        currentPage: 'dashboard' 
    });
});
// 2. صفحة التقديمات (إخفاء المراجع فوق، وعرضه تحت في السجل مع اللوقز)
app.get('/applications', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    const rawApps = await getRawApplications();
    const academyApps = await getApplications();
    
    // جدار ناري لمنع التكرار: نجمع الأسماء، الأيديات، والكوبي أيدي للي تم مراجعتهم
    const processedNames = academyApps.map(a => String(a.name).trim().toLowerCase());
    const processedCopyIds = academyApps.map(a => String(a.copyId).trim().toLowerCase());
    const processedDiscordIds = academyApps.map(a => String(a.id).trim().toLowerCase());
    
    // فوق: التقديمات الجديدة (يتم استبعاد أي شخص اسمه أو أيديه موجود في شيت الكلية)
    const pendingRaw = rawApps.filter(raw => {
        const rawName = String(raw.name).trim().toLowerCase();
        const rawCopyId = String(raw.id).trim().toLowerCase();
        const rawDiscordId = String(raw.discordId).trim().toLowerCase();
        
        const isProcessed = processedNames.includes(rawName) || 
                            processedCopyIds.includes(rawCopyId) || 
                            processedDiscordIds.includes(rawDiscordId);
                            
        return !isProcessed; // إذا تمت مراجعته مسبقاً، استبعده من القائمة العلوية!
    });
    
    // تحت: التقديمات التي تمت مراجعتها
    const reviewedApps = academyApps.filter(a => a.stage === 'interview' || a.stage === 'rejected' || a.status.includes('مرفوض') || a.status.includes('مقبول'));

    res.render('applications', { 
        user: req.user, 
        applications: pendingRaw, 
        reviewedApps: reviewedApps,
        currentPage: 'applications' 
    });
});

// 1. عرض صفحة دليل الكلية بناءً على الصلاحيات المقسمة
app.get('/guide', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    
    const allQuestions = await getGuideQuestions();
    const perms = req.user.permissions;
    const isSupervisorOrLeader = perms.canAcceptApplications || perms.canApproveReject;

    // تصفية الأسئلة: المدرب ما يشوف إلا القسم المسموح له برصده، والقيادة تشوف الكل
    const filteredQuestions = allQuestions.filter(q => {
        if (isSupervisorOrLeader) return true; // القيادة والمشرفين يشوفون كل شيء
        if (q.section === 'stops' && perms.canGradeStops) return true;
        if (q.section === 'neg' && perms.canGradeNeg) return true;
        if (q.section === 'ops' && perms.canGradeOps) return true;
        if (q.section === 'gen' && perms.canGradeGen) return true;
        return false;
    });

    res.render('guide', { 
        user: req.user, 
        questions: filteredQuestions,
        isSupervisor: isSupervisorOrLeader,
        currentPage: 'guide' 
    });
});

// 2. API إضافة سؤال جديد مع التحقق الصارم من التخصص
app.post('/api/guide/add', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "غير مصرح" });
    
    const { section, text, maxScore } = req.body;
    const perms = req.user.permissions;
    const isSupervisorOrLeader = perms.canAcceptApplications || perms.canApproveReject;

    // جدار حماية: التأكد أن المدرب لا يحقن أسئلة في قسم ليس تخصصه
    if (!isSupervisorOrLeader) {
        if (section === 'stops' && !perms.canGradeStops) return res.status(403).json({ error: "لا تملك صلاحية تعديل قسم الاستيقافات!" });
        if (section === 'neg' && !perms.canGradeNeg) return res.status(403).json({ error: "لا تملك صلاحية تعديل قسم التفاوض!" });
        if (section === 'ops' && !perms.canGradeOps) return res.status(403).json({ error: "لا تملك صلاحية تعديل قسم العمليات!" });
        if (section === 'gen' && !perms.canGradeGen) return res.status(403).json({ error: "لا تملك صلاحية تعديل قسم الأنظمة العامة!" });
    }

    try {
        await addGuideQuestion(section, text, maxScore, req.user.username);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. API حذف سؤال (للقيادة والمشرفين فقط)
app.post('/api/guide/delete', async (req, res) => {
    if (!req.isAuthenticated() || !(req.user.permissions.canAcceptApplications || req.user.permissions.canApproveReject)) {
        return res.status(403).json({ error: "حذف الأسئلة متاح فقط لقيادة الكلية والمشرفين!" });
    }
    try {
        await deleteGuideQuestion(req.body.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// مسار القبول ونقل المتقدم (مع استلام البيانات المكملة من النافذة المنبثقة)
app.post('/api/accept-raw', async (req, res) => {
    if (!req.isAuthenticated() || !(req.user.permissions.canAcceptApplications || req.user.permissions.canApproveReject)) {
        return res.status(403).json({ error: "صلاحية قبول التقديمات للقيادة ومشرفين الكلية فقط!" });
    }
    try {
        const { id, name, answers, discordId, nationalId, age } = req.body;
        // نمرر البيانات الجديدة لدالة الشيت
        await acceptFromRawToAcademy(id, name, answers, req.user.username, discordId, nationalId, age);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// مسار الرفض (مع تمرير اسم المدرب الذي اتخذ القرار)
app.post('/api/reject-raw', async (req, res) => {
    if (!req.isAuthenticated() || !(req.user.permissions.canAcceptApplications || req.user.permissions.canApproveReject)) {
        return res.status(403).json({ error: "غير مصرح لك بالرفض!" });
    }
    try {
        const { id, name, answers } = req.body;
        // تمرير req.user.username لتسجيل اللوق في الشيت
        await rejectRawApplicant(id, name, answers, req.user.username);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. صفحة المقابلات
app.get('/interviews', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    const apps = await getApplications();
    
    // المرشحين النشطين في قاعة المقابلات
    const activeInterviews = apps.filter(a => a.stage === 'interview' || a.stage === 'مقابلة' || a.status === 'مقبول للمقابلة');
    
    // المرفوضين في المقابلات (علشان ينزلون تحت آخر الصفحة)
    const rejectedInterviews = apps.filter(a => a.stage === 'interview_rejected' || a.status === 'مرفوض في المقابلة الشخصية');

    res.render('interviews', { 
        user: req.user, 
        applications: activeInterviews, 
        rejectedApps: rejectedInterviews,
        currentPage: 'interviews' 
    });
});

// 4. صفحة المقبولين مبدئياً
app.get('/preliminary', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    const apps = await getApplications();
    const filtered = apps.filter(a => a.stage === 'preliminary' || a.stage === 'مقبول مبدئيا');
    res.render('preliminary', { user: req.user, applications: filtered, currentPage: 'preliminary' });
});

// 5. صفحة الرصد النهائي (القيادة)
app.get('/final', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    const apps = await getApplications();
    
    // تم إزالة شرط totalScore > 0 لكي لا يظهر المتدرب هنا إلا إذا رُفع للقيادة رسمياً!
    const filtered = apps.filter(a => a.stage === 'final' || a.status === 'بانتظار الاعتماد النهائي');
    
    res.render('final', { user: req.user, applications: filtered, currentPage: 'final' });
});
// مسار الرصد الميداني المتقدم (بالتفاصيل والمقاييس الرياضية)
app.post('/api/advanced-grade', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "غير مصرح لك" });
    
    const { discordId, section, details, finalScore } = req.body;
    const perms = req.user.permissions;
    const isSupervisorOrLeader = perms.canAcceptApplications || perms.canApproveReject;

    // التحقق من صلاحية الرصد بناءً على القسم
    if (section === 'stops' && !perms.canGradeStops) return res.status(403).json({ error: "لا تملك صلاحية رصد الاستيقافات!" });
    if (section === 'neg' && !perms.canGradeNeg) return res.status(403).json({ error: "لا تملك صلاحية رصد التفاوض!" });
    if (section === 'ops' && !perms.canGradeOps) return res.status(403).json({ error: "لا تملك صلاحية رصد العمليات!" });
    if (section === 'gen' && !perms.canGradeGen) return res.status(403).json({ error: "لا تملك صلاحية رصد الأنظمة العامة!" });

    try {
        await advancedGradeApplicant(discordId, section, details, Number(finalScore), req.user.username, isSupervisorOrLeader);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// مسار اتخاذ قرار المقابلة (مع تمرير اسم مجري المقابلة)
app.post('/api/decide-interview', async (req, res) => {
    if (!req.isAuthenticated() || !(req.user.permissions.canAcceptApplications || req.user.permissions.canApproveReject)) {
        return res.status(403).json({ error: "صلاحية للقيادة فقط!" });
    }
    try {
        const { id, decision, interviewer } = req.body;
        // نمرر اسم المعتمد واسم مجري المقابلة
        await decideInterview(id, decision, req.user.username, interviewer);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// مسار رفع المتدرب للقيادة بعد اكتمال درجاته
app.post('/api/send-final', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "غير مصرح" });
    try {
        const { discordId } = req.body;
        // استدعاء الدالة (تأكد إنك سويت لها استدعاء require فوق في أول الملف)
        await sendToFinalDecision(discordId, req.user.username);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// مسار الاستثناء
app.post('/api/toggle-exception', async (req, res) => {
    if (!req.isAuthenticated() || !req.user.permissions.canApproveReject) return res.status(403).json({ error: "صلاحية للقيادة فقط!" });
    try {
        await toggleException(req.body.id, req.body.action, req.user.username);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// مسار التخرج والرسوب
app.post('/api/final-decision', async (req, res) => {
    if (!req.isAuthenticated() || !req.user.permissions.canApproveReject) return res.status(403).json({ error: "صلاحية للقيادة فقط!" });
    try {
        await finalDecision(req.body.id, req.body.decision, req.user.username);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/logout', (req, res) => {
    req.logout(() => res.redirect('/'));
});

// تشغيل السيرفر محلياً فقط إذا لم يكن مرفوعاً على استضافة Vercel
if (process.env.NODE_ENV !== 'production') {
    app.listen(process.env.PORT || 3000, () => {
        console.log(`🚀 السيرفر شغال على البورت ${process.env.PORT || 3000}`);
    });
}

// ==========================================
// 🚀 مسارات نظام الرسائل والنماذج التلقائية
app.get('/templates', async (req, res) => {
    if (!req.isAuthenticated() || !(req.user.permissions.canAcceptApplications || req.user.permissions.canApproveReject)) {
        return res.redirect('/dashboard');
    }
    
    const rawApps = await getRawApplications(); // المتقدمين الجدد
    const apps = await getApplications();
    const templates = await getTemplates();
    
    const interviewUsers = apps.filter(a => a.stage === 'interview' || a.status === 'مقبول للمقابلة');
    const prelimUsers = apps.filter(a => a.stage === 'preliminary' || a.status.includes('مقبول مبدئيا'));
    const finalUsers = apps.filter(a => a.status.includes('بانتظار الاعتماد النهائي'));

    res.render('templates', { 
        user: req.user, 
        templates, 
        rawApps, // تمرير التقديمات الجديدة
        interviewUsers, 
        prelimUsers, 
        finalUsers,
        currentPage: 'templates' 
    });
});

app.post('/api/templates/save', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "غير مصرح" });
    try { await saveTemplate(req.body.type, req.body.message); res.json({ success: true }); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/templates/send', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "غير مصرح" });
    
    const { copyIds, message } = req.body;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    
    if (!botToken) return res.status(500).json({ error: "لم يتم العثور على توكن البوت!" });

    let successCount = 0;
    let failCount = 0;
    let errorLog = "";

    for (const copyId of copyIds) {
        if (!copyId || copyId.length < 17) continue; // تخطي الآيديات الوهمية
        try {
            const dmRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
                method: 'POST',
                headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipient_id: copyId })
            });
            const dmData = await dmRes.json();
            
            if (!dmRes.ok || !dmData.id) {
                failCount++;
                errorLog = dmData.message || "معرف غير صحيح";
                continue;
            }

            const msgRes = await fetch(`https://discord.com/api/v10/channels/${dmData.id}/messages`, {
                method: 'POST',
                headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: message })
            });

            if (msgRes.ok) successCount++;
            else { failCount++; errorLog = (await msgRes.json()).message; }
            
            await new Promise(resolve => setTimeout(resolve, 200)); // حماية من الحظر
        } catch (error) { failCount++; }
    }

    res.json({ success: true, successCount, failCount, errorLog });
});
// تصدير التطبيق ليتمكن Vercel من تشغيله كـ Serverless Function
module.exports = app;