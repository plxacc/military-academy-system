const express = require('express');
const cookieSession = require('cookie-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const cors = require('cors');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const { getUserPermissions } = require('./config/roles'); 

const { 
    getRawApplications, 
    getApplications, 
    acceptFromRawToAcademy, 
    rejectRawApplicant, 
    advancedGradeApplicant,
    sendToFinalDecision,
    toggleException,
    finalDecision,
    getGuideQuestions,
    addGuideQuestion,
    deleteGuideQuestion,
    getTemplates,      
    saveTemplate       
} = require('./services/sheets');

const app = express();
app.use(cors());

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(cookieSession({
    name: 'academy-session',
    keys: ['secret-military-academy-key-2026'],
    maxAge: 7 * 24 * 60 * 60 * 1000 
}));

app.set('trust proxy', 1);

app.use((req, res, next) => {
    if (req.session && !req.session.regenerate) req.session.regenerate = (cb) => { cb() };
    if (req.session && !req.session.save) req.session.save = (cb) => { cb() };
    next();
});

app.use(passport.initialize());
app.use(passport.session());

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify', 'guilds', 'guilds.members.read']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const response = await axios.get(`https://discord.com/api/users/@me/guilds/${process.env.GUILD_ID}/member`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const userRoles = response.data.roles || [];
        return done(null, {
            id: profile.id,
            username: profile.username,
            avatar: profile.avatar,
            roles: userRoles,
            permissions: getUserPermissions(userRoles)
        });
    } catch (error) {
        return done(null, { id: profile.id, username: profile.username, avatar: profile.avatar, roles: [], permissions: getUserPermissions([]) });
    }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// مسارات تسجيل الدخول
app.get('/', (req, res) => res.redirect('/dashboard'));
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/dashboard');
});
app.get('/logout', (req, res) => {
    req.logout(() => res.redirect('/'));
});

// 🚨 الجدار الناري (Firewall): يمنع أي شخص بدون رتبة معرفة من دخول النظام 🚨
app.use((req, res, next) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    
    const p = req.user.permissions;
    const hasAccess = p.canViewAll || p.canApproveReject || p.canGradeStops || p.canGradeNeg || p.canGradeOps || p.canGradeGen;
    
    if (!hasAccess) {
        return res.status(403).send(`
            <html lang="ar" dir="rtl">
            <head><meta charset="UTF-8"><title>غير مصرح</title><script src="https://cdn.tailwindcss.com"></script><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet"><style>body { font-family: 'Tajawal', sans-serif; }</style></head>
            <body class="bg-[#05070a] flex items-center justify-center min-h-screen text-white">
                <div class="text-center bg-[#0d1117] p-12 rounded-[2rem] border border-red-500/30 shadow-[0_0_50px_rgba(239,68,68,0.1)]">
                    <div class="text-7xl mb-6 animate-bounce">⛔</div>
                    <h1 class="text-4xl font-black text-red-500 mb-4">الدخول مرفوض</h1>
                    <p class="text-gray-400 mb-8 text-lg">عذراً، لا تملك الصلاحيات الكافية. هذا النظام مخصص حصرياً لقيادة وكادر الكلية العسكرية.</p>
                    <a href="/logout" class="bg-red-600 hover:bg-red-500 px-8 py-3 rounded-xl font-bold transition-all shadow-lg">تسجيل الخروج والعودة</a>
                </div>
            </body>
            </html>
        `);
    }
    next();
});

// المسارات المحمية
app.get('/dashboard', async (req, res) => {
    const rawApps = await getRawApplications();
    const academyApps = await getApplications();
    
    const allIds = new Set([...rawApps.map(a => a.id), ...academyApps.map(a => a.copyId || a.id)]);
    const totalCount = allIds.size; 
    
    const prelimCount = academyApps.filter(a => a.stage === 'preliminary' || a.stage === 'مقبول مبدئيا').length;
    const passedCount = academyApps.filter(a => a.totalScore >= 40).length;
    const failedCount = academyApps.filter(a => (a.totalScore > 0 && a.totalScore <= 39) || a.status.includes('مرفوض')).length;

    const trainersList = [
        { name: "باسل صخر", role: "وكيل رقيب", duty: "مدرب استيقافات" },
        { name: "امين العبادي", role: "عريف", duty: "مدرب عمليات" },
        { name: "غوار المغوار", role: "عريف", duty: "مدرب استيقافات" },
        { name: "مالك البتار", role: "جندي أول", duty: "مدرب التفاوض" },
        { name: "ضرغام حلتاوي", role: "جندي أول", duty: "مدرب عمليات" },
        { name: "حمد فولاد", role: "جندي", duty: "مدرب استيقافات" },
        { name: "ود خالد" , role: "جندي" , duty: "مدربة التفاوض" }
    ];

    res.render('dashboard', { user: req.user, applications: academyApps, stats: { totalCount, prelimCount, passedCount, failedCount }, trainers: trainersList, currentPage: 'dashboard' });
});

app.get('/applications', async (req, res) => {
    const rawApps = await getRawApplications();
    const academyApps = await getApplications();
    
    const processedNames = academyApps.map(a => String(a.name).trim().toLowerCase());
    const processedCopyIds = academyApps.map(a => String(a.copyId).trim().toLowerCase());
    const processedDiscordIds = academyApps.map(a => String(a.id).trim().toLowerCase());
    
    const pendingRaw = rawApps.filter(raw => {
        return !(processedNames.includes(String(raw.name).trim().toLowerCase()) || processedCopyIds.includes(String(raw.id).trim().toLowerCase()) || processedDiscordIds.includes(String(raw.discordId).trim().toLowerCase()));
    });
    
    const reviewedApps = academyApps.filter(a => a.stage === 'preliminary' || a.stage === 'rejected' || a.status.includes('مرفوض') || a.status.includes('مقبول'));

    res.render('applications', { user: req.user, applications: pendingRaw, reviewedApps: reviewedApps, currentPage: 'applications' });
});

app.post('/api/accept-raw', async (req, res) => {
    if (!(req.user.permissions.canAcceptApplications || req.user.permissions.canApproveReject)) return res.status(403).json({ error: "صلاحية للقيادة ومشرفين الكلية فقط!" });
    try {
        const { id, name, answers, discordId, nationalId, age } = req.body;
        await acceptFromRawToAcademy(id, name, answers, req.user.username, discordId, nationalId, age);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/reject-raw', async (req, res) => {
    if (!(req.user.permissions.canAcceptApplications || req.user.permissions.canApproveReject)) return res.status(403).json({ error: "غير مصرح لك بالرفض!" });
    try {
        const { id, name, answers } = req.body;
        await rejectRawApplicant(id, name, answers, req.user.username);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/preliminary', async (req, res) => {
    const apps = await getApplications();
    const filtered = apps.filter(a => a.stage === 'preliminary' || a.stage === 'مقبول مبدئيا');
    res.render('preliminary', { user: req.user, applications: filtered, currentPage: 'preliminary' });
});

app.get('/final', async (req, res) => {
    const apps = await getApplications();
    const filtered = apps.filter(a => a.stage === 'final' || a.status === 'بانتظار الاعتماد النهائي');
    res.render('final', { user: req.user, applications: filtered, currentPage: 'final' });
});

app.post('/api/advanced-grade', async (req, res) => {
    const { discordId, section, details, finalScore } = req.body;
    const perms = req.user.permissions;
    const isSupervisorOrLeader = perms.canAcceptApplications || perms.canApproveReject;

    if (section === 'stops' && !perms.canGradeStops) return res.status(403).json({ error: "لا تملك صلاحية!" });
    if (section === 'neg' && !perms.canGradeNeg) return res.status(403).json({ error: "لا تملك صلاحية!" });
    if (section === 'ops' && !perms.canGradeOps) return res.status(403).json({ error: "لا تملك صلاحية!" });
    if (section === 'gen' && !perms.canGradeGen) return res.status(403).json({ error: "لا تملك صلاحية!" });

    try {
        await advancedGradeApplicant(discordId, section, details, Number(finalScore), req.user.username, isSupervisorOrLeader);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/send-final', async (req, res) => {
    try {
        await sendToFinalDecision(req.body.discordId, req.user.username);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/final-decision', async (req, res) => {
    if (!req.user.permissions.canApproveReject) return res.status(403).json({ error: "صلاحية للقيادة فقط!" });
    try {
        await finalDecision(req.body.id, req.body.decision, req.user.username);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/guide', async (req, res) => {
    const allQuestions = await getGuideQuestions();
    const perms = req.user.permissions;
    const isSupervisorOrLeader = perms.canAcceptApplications || perms.canApproveReject;
    const filteredQuestions = allQuestions.filter(q => {
        if (isSupervisorOrLeader) return true;
        if (q.section === 'stops' && perms.canGradeStops) return true;
        if (q.section === 'neg' && perms.canGradeNeg) return true;
        if (q.section === 'ops' && perms.canGradeOps) return true;
        if (q.section === 'gen' && perms.canGradeGen) return true;
        return false;
    });
    res.render('guide', { user: req.user, questions: filteredQuestions, isSupervisor: isSupervisorOrLeader, currentPage: 'guide' });
});

app.post('/api/guide/add', async (req, res) => {
    const { section, text, maxScore } = req.body;
    const perms = req.user.permissions;
    const isSupervisorOrLeader = perms.canAcceptApplications || perms.canApproveReject;
    if (!isSupervisorOrLeader) {
        if (section === 'stops' && !perms.canGradeStops) return res.status(403).json({ error: "لا تملك صلاحية!" });
        if (section === 'neg' && !perms.canGradeNeg) return res.status(403).json({ error: "لا تملك صلاحية!" });
        if (section === 'ops' && !perms.canGradeOps) return res.status(403).json({ error: "لا تملك صلاحية!" });
        if (section === 'gen' && !perms.canGradeGen) return res.status(403).json({ error: "لا تملك صلاحية!" });
    }
    try {
        await addGuideQuestion(section, text, maxScore, req.user.username);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/guide/delete', async (req, res) => {
    if (!(req.user.permissions.canAcceptApplications || req.user.permissions.canApproveReject)) return res.status(403).json({ error: "صلاحية للقيادة فقط!" });
    try { await deleteGuideQuestion(req.body.id); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/templates', async (req, res) => {
    if (!(req.user.permissions.canAcceptApplications || req.user.permissions.canApproveReject)) return res.redirect('/dashboard');
    const rawApps = await getRawApplications(); 
    const apps = await getApplications();
    const templates = await getTemplates();
    
    const prelimUsers = apps.filter(a => a.stage === 'preliminary' || a.status.includes('مقبول مبدئيا'));
    const finalUsers = apps.filter(a => a.status.includes('بانتظار الاعتماد النهائي'));
    const rejectedUsers = apps.filter(a => a.stage === 'rejected' || a.stage === 'failed' || a.status.includes('مرفوض')); // 👈 السطر الجديد

    res.render('templates', { user: req.user, templates, rawApps, prelimUsers, finalUsers, rejectedUsers, currentPage: 'templates' });
});

app.post('/api/templates/save', async (req, res) => {
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
        if (!copyId || copyId.length < 17) continue; 
        try {
            // 1. فتح قناة الخاص
            const dmRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
                method: 'POST',
                headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipient_id: copyId })
            });
            const dmData = await dmRes.json();
            
            if (!dmRes.ok || !dmData.id) { 
                failCount++; 
                console.log(`❌ فشل فتح خاص لـ ${copyId}:`, dmData.message || "خطأ غير معروف");
                continue; 
            }

            // 2. إرسال الرسالة داخل القناة
            const msgRes = await fetch(`https://discord.com/api/v10/channels/${dmData.id}/messages`, {
                method: 'POST',
                headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: message })
            });

            if (msgRes.ok) {
                successCount++;
            } else { 
                failCount++; 
                const errJson = await msgRes.json();
                errorLog = errJson.message;
                console.log(`❌ فشل إرسال نص لـ ${copyId}:`, errJson.message);
            }
            
            // ⏳ زيادة فترة التوقف إلى 600 ملي ثانية لتفادي حظر سبام ديسكورد (Rate Limit)
            await new Promise(resolve => setTimeout(resolve, 600)); 
            
        } catch (error) { 
            failCount++; 
            console.log(`⚠️ خطأ استثنائي أثناء إرسال رسالة لـ ${copyId}:`, error.message);
        }
    }
    
    res.json({ success: true, successCount, failCount, errorLog });
});

module.exports = app;