const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// 1. تنظيف المفاتيح من أي مسافات مخفية (مهم جداً لبيئة Vercel)
const sheetId = (process.env.GOOGLE_SHEET_ID || '').trim();
const clientEmail = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';

if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
}
privateKey = privateKey.replace(/\\n/g, '\n').trim();

// 2. إعداد تصريح الدخول (البطاقة العسكرية للبوت)
const serviceAccountAuth = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// 3. تمرير تصريح الدخول للشيت
const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);

// تعريف الكاش للذاكرة
const memoryCache = { rawApps: null, academyApps: null, lastFetchTime: 0 };
// تم تقليله إلى ثانية واحدة فقط لضمان التحديث اللحظي بين العساكر ومنع التضارب
const CACHE_TTL = 1 * 1000; 

function clearCache() {
    memoryCache.rawApps = null;
    memoryCache.academyApps = null;
    memoryCache.lastFetchTime = 0;
}

function clearCache() {
    memoryCache.rawApps = null;
    memoryCache.academyApps = null;
    memoryCache.lastFetchTime = 0;
}
async function sendDiscordLog(message) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message })
        });
    } catch (err) {
        console.log("⚠️ فشل إرسال اللوق للديسكورد:", err.message);
    }
}

// ---------------------------------------------------------
// من هنا تبدأ دوالك القديمة بدون أي تغيير (getRawApplications إلخ..)

// 1. سحب التقديمات الخام
async function getRawApplications() {
    try {
        if (memoryCache.rawApps && (Date.now() - memoryCache.lastFetchTime < CACHE_TTL)) {
            return memoryCache.rawApps;
        }

        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['Applications_Raw'] || doc.sheetsByIndex[0];
        if (!sheet) return [];

        const rows = await sheet.getRows();
        const results = rows.map((row, index) => {
            let fullAnswers = "";
            const qaList = [];
            const headers = sheet.headerValues || [];
            
            headers.forEach(header => {
                if (!['#', 'اليوزر نيم', 'الاسم داخل السيرفر', 'العمر', 'Copy ID', 'التاريخ'].includes(header)) {
                    const answerText = row.get(header) || 'بدون إجابة';
                    fullAnswers += `🔹 **${header}**: ${answerText}\n`;
                    qaList.push({ question: header, answer: answerText });
                }
            });

            const copyId = row.get('Copy ID') || row.get('ID') || 'غير متوفر';
            const discordId = row.get('اليوزر نيم') || row.get('ايدي الديسكورد') || 'غير متوفر'; 

            return {
                rowNumber: index + 2,
                id: String(copyId).trim(),
                copyId: String(copyId).trim(),
                discordId: String(discordId).trim(),
                nationalId: 'غير متوفر',
                username: String(discordId).trim(), 
                name: String(row.get('الاسم داخل السيرفر')).trim() || 'متقدم غير معروف',
                age: row.get('العمر') || 'غير محدد',
                date: row.get('التاريخ') || '',
                answers: fullAnswers,
                qaList: qaList
            };
        });

        memoryCache.rawApps = results;
        memoryCache.lastFetchTime = Date.now();
        return results;
    } catch (error) {
        console.log("⚠️ خطأ في قراءة شيت التقديمات:", error.message);
        return [];
    }
}

// 2. سحب المتقدمين من الأكاديمية
async function getApplications() {
    try {
        if (memoryCache.academyApps && (Date.now() - memoryCache.lastFetchTime < CACHE_TTL)) {
            return memoryCache.academyApps;
        }
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['Academy_System'] || doc.sheetsByIndex[1];
        if (!sheet) return [];
        
        const rows = await sheet.getRows();
        const results = rows.map(row => ({
            id: String(row.get('Discord_ID') || row.get('Copy_ID') || '000000000').trim(),
            name: row.get('Name') || '',
            copyId: String(row.get('Copy_ID') || '').trim(),
            nationalId: row.get('National_ID') || '',
            stage: row.get('Stage') || '',
            status: row.get('Status') || '',
            stopsScore: Number(row.get('Stops_Score')) || 0,
            negScore: Number(row.get('Neg_Score')) || 0,
            opsScore: Number(row.get('Ops_Score')) || 0,
            genScore: Number(row.get('Gen_Score')) || 0,
            totalScore: Number(row.get('Total_Score')) || 0,
            gradedBy: row.get('Graded_By') || '',
            finalDecision: row.get('Final_Decision') || 'معلق'
        }));

        memoryCache.academyApps = results;
        return results;
    } catch (error) { return []; }
}

// 3. النقل وإرسال لوق الديسكورد
// النقل الذكي والمباشر (بدون فلسفة): يرفع 4 بيانات أساسية فقط للشيت
async function acceptFromRawToAcademy(rawId, name, answers, officerName, discordId, nationalId, age) {
    await doc.loadInfo();
    const academySheet = doc.sheetsByTitle['Academy_System'] || doc.sheetsByIndex[1];
    
    // سحب البيانات المباشرة
    const finalDiscordId = String(discordId).trim();
    const finalName = String(name).trim();
    const finalCopyId = String(rawId).trim(); // هذا اللي بينحفظ في عمود Copy_ID
    const finalNationalId = String(nationalId).trim();

    const existingRows = await academySheet.getRows();
    const existingRow = existingRows.find(r => String(r.get('Copy_ID')).trim() === finalCopyId);
    
    if (!existingRow) {
        await academySheet.addRow({
            Discord_ID: finalDiscordId,
            Name: finalName,
            Copy_ID: finalCopyId,     // العمود الجديد اللي ضفناه
            National_ID: finalNationalId,
            Stage: 'interview',
            Status: 'مقبول للمقابلة',
            Stops_Score: 0, Neg_Score: 0, Ops_Score: 0, Gen_Score: 0, Total_Score: 0, 
            Graded_By: '[✔ تمت المراجعة]',
            Final_Decision: 'معلق'
        });
    } else {
        existingRow.assign({ 
            Discord_ID: finalDiscordId,
            National_ID: finalNationalId,
            Stage: 'interview', 
            Status: 'مقبول للمقابلة',
            Graded_By: '[✔ تمت المراجعة]'
        });
        await existingRow.save();
    }
    clearCache();
    // -- إرسال رسالة القبول الآلية على الخاص --
    const templates = await getTemplates();
    const dmMessage = `🎉 **تم قبولك مبدئياً لإجراء المقابلة الشخصية**\n\n${templates.interview || 'الرجاء التوجه لغرف الانتظار.'}`;
    await sendDiscordDM(finalCopyId, dmMessage);
    // إرسال اللوق للديسكورد بالاكتفاء بالبيانات الأساسية فقط
    await sendDiscordLog(`✅ **قبول جديد للمقابلة**\n👮‍♂️ **المدرب:** ${officerName}\n👤 **الاسم:** ${finalName}\n💬 **ديسكورد:** \`${finalDiscordId}\`\n📋 **كوبي ايدي:** \`${finalCopyId}\`\n🪪 **رقم وطني:** ${finalNationalId}`);
}

// 4. رفض التقديم وإرسال اللوق
async function rejectRawApplicant(rawId, name, answers, officerName) {
    await doc.loadInfo();
    const rawSheet = doc.sheetsByTitle['Applications_Raw'] || doc.sheetsByIndex[0];
    const academySheet = doc.sheetsByTitle['Academy_System'] || doc.sheetsByIndex[1];
    
    const rawRows = await rawSheet.getRows();
    const rawPerson = rawRows.find(r => (String(r.get('الاسم داخل السيرفر')).trim() === String(name).trim() || String(r.get('Copy ID')).trim() === String(rawId).trim()));
    
    const copyId = rawPerson ? (rawPerson.get('Copy ID') || rawId) : rawId;
    const discordId = rawPerson ? (rawPerson.get('اليوزر نيم') || 'غير متوفر') : 'غير متوفر';

    const existingRows = await academySheet.getRows();
    const existingRow = existingRows.find(r => String(r.get('Copy_ID')).trim() === String(copyId).trim());
    
    const nationalId = existingRow ? (existingRow.get('National_ID') || 'غير متوفر') : 'غير متوفر';

    if (!existingRow) {
        await academySheet.addRow({
            Discord_ID: String(discordId).trim(),
            Name: name,
            Copy_ID: String(copyId).trim(),
            National_ID: 'غير متوفر',
            Stage: 'rejected',
            Status: 'مرفوض من التقديم',
            Stops_Score: 0, Neg_Score: 0, Ops_Score: 0, Gen_Score: 0, Total_Score: 0, 
            Graded_By: '[✖ تم الرفض]',
            Final_Decision: 'مرفوض'
        });
    } else {
        existingRow.assign({ Stage: 'rejected', Status: 'مرفوض من التقديم', Graded_By: '[✖ تم الرفض]' });
        await existingRow.save();
    }
    clearCache();

    const logMsg = `🛑 **نوع الإجراء:** رفض تقديم جديد\n` +
                   `━━━━━━━━━━━━━━━━━━━━\n` +
                   `👮‍♂️ **بيانات المدرب:**\n` +
                   `👤 **اسم الديسكورد:** ${officerName}\n` +
                   `━━━━━━━━━━━━━━━━━━━━\n` +
                   `🎯 **بيانات المتدرب (المتقدم):**\n` +
                   `👤 **الاسم:** ${name}\n` +
                   `💬 **الديسكورد:** \`${discordId}\`\n` +
                   `📋 **كوبي ايدي:** \`${copyId}\`\n` +
                   `🪪 **الرقم الوطني:** \`${nationalId}\`\n` +
                   `━━━━━━━━━━━━━━━━━━━━\n` +
                   `📝 **التفاصيل:** تم رفض طلب الالتحاق نهائياً.`;
    await sendDiscordLog(logMsg);
}

// قرار المقابلة (قبول/رفض) مع تسجيل من أجرى المقابلة
async function decideInterview(discordId, decisionType, officerName, interviewerName = "") {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Academy_System'] || doc.sheetsByIndex[1];
    const rows = await sheet.getRows();
    const row = rows.find(r => String(r.get('Discord_ID')).trim() === String(discordId).trim() || String(r.get('Copy_ID')).trim() === String(discordId).trim());
    
    if (row) {
        const appName = row.get('Name') || 'غير متوفر';
        const appCopyId = row.get('Copy_ID') || 'غير متوفر';
        const appNatId = row.get('National_ID') || 'غير متوفر';
        const dateNow = new Date().toLocaleDateString('en-GB');
        
        let newStage = '';
        let newStatus = '';
        let logMessage = '';

        if (decisionType === 'accept') {
            const templates = await getTemplates();
        const dmMessage = `🛡️ **تم اجتياز المقابلة وقبولك في ميدان التدريب**\n\n${templates.preliminary || 'الرجاء انتظار تعليمات المدربين.'}`;
        sendDiscordDM(appCopyId, dmMessage); // إرسال بدون تعطيل النظام
            newStage = 'preliminary';
            newStatus = 'مقبول مبدئياً - ميدان التدريب';
            logMessage = `[✔ اجتاز المقابلة مع: ${interviewerName} | اعتماد: ${officerName} (${dateNow})]`;
        } else {
            newStage = 'interview_rejected';
            newStatus = 'مرفوض في المقابلة الشخصية';
            logMessage = `[✖ رفض مقابلة بواسطة: ${officerName} (${dateNow})]`;
        }

        let currentLogs = row.get('Graded_By') || '';
        const updatedLogs = `${currentLogs} ${logMessage}`.trim();

        row.assign({ Stage: newStage, Status: newStatus, Graded_By: updatedLogs });
        await row.save();
        
        const decisionMsg = decisionType === 'accept' ? `✔ تم اجتياز المقابلة المبدئية مع (${interviewerName}) ونقله لميدان التدريب.` : `✖ رسوب في المقابلة الشخصية والرفض من الإكمال.`;

        const logMsg = `🎙️ **نوع الإجراء:** قرار المقابلة الشخصية\n` +
                       `━━━━━━━━━━━━━━━━━━━━\n` +
                       `👮‍♂️ **بيانات المدرب (المُعتمد):**\n` +
                       `👤 **اسم الديسكورد:** ${officerName}\n` +
                       `━━━━━━━━━━━━━━━━━━━━\n` +
                       `🎯 **بيانات المتدرب (المرشح):**\n` +
                       `👤 **الاسم:** ${appName}\n` +
                       `💬 **الديسكورد:** <@${discordId}> (\`${discordId}\`)\n` +
                       `📋 **كوبي ايدي:** \`${appCopyId}\`\n` +
                       `🪪 **الرقم الوطني:** \`${appNatId}\`\n` +
                       `━━━━━━━━━━━━━━━━━━━━\n` +
                       `📝 **التفاصيل:** ${decisionMsg}`;
        await sendDiscordLog(logMsg);
    }
    clearCache();
}

// رصد الدرجات المتقدم
async function advancedGradeApplicant(discordId, section, detailsText, finalScore, graderName, isSupervisorOrLeader) {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Academy_System'] || doc.sheetsByIndex[1];
    const rows = await sheet.getRows();
    const row = rows.find(r => r.get('Discord_ID') === discordId || r.get('Copy_ID') === discordId);

    if (row) {
        const appName = row.get('Name') || 'غير متوفر';
        const appCopyId = row.get('Copy_ID') || 'غير متوفر';
        const appNatId = row.get('National_ID') || 'غير متوفر';
        const sectionAr = section === 'stops' ? 'استيقافات' : section === 'neg' ? 'تفاوض' : section === 'ops' ? 'عمليات' : 'أنظمة';
        let currentLogs = row.get('Graded_By') || '';
        
        if (currentLogs.includes(`[${sectionAr}:`) && !isSupervisorOrLeader) {
            throw new Error("⛔ تم الرصد مسبقاً! التعديل متاح فقط للقيادة.");
        }

        if (section === 'stops') row.assign({ Stops_Score: finalScore });
        if (section === 'neg') row.assign({ Neg_Score: finalScore });
        if (section === 'ops') row.assign({ Ops_Score: finalScore });
        if (section === 'gen') row.assign({ Gen_Score: finalScore });

        const total = (Number(row.get('Stops_Score')) || 0) + (Number(row.get('Neg_Score')) || 0) + (Number(row.get('Ops_Score')) || 0) + (Number(row.get('Gen_Score')) || 0);
        row.assign({ Total_Score: total });

        const logRegex = new RegExp(`\\[${sectionAr}:.*?\\]`, 'g');
        currentLogs = currentLogs.replace(logRegex, '').trim();
        row.assign({ Graded_By: `${currentLogs} [${sectionAr}: تم الرصد]`.trim() });
        await row.save();

        const logMsg = `🎯 **نوع الإجراء:** رصد درجات الميدان\n` +
                       `━━━━━━━━━━━━━━━━━━━━\n` +
                       `👮‍♂️ **بيانات المدرب :**\n` +
                       `👤 **اسم الديسكورد:** ${graderName}\n` +
                       `━━━━━━━━━━━━━━━━━━━━\n` +
                       `🎯 **بيانات المتدرب :**\n` +
                       `👤 **الاسم:** ${appName}\n` +
                       `💬 **الديسكورد:** <@${discordId}> (\`${discordId}\`)\n` +
                       `📋 **كوبي ايدي:** \`${appCopyId}\`\n` +
                       `🪪 **الرقم الوطني:** \`${appNatId}\`\n` +
                       `━━━━━━━━━━━━━━━━━━━━\n` +
                       `📊 **القسم:** ${sectionAr} | **الدرجة المسجلة:** **${finalScore}**\n` +
                       `📝 **تفاصيل الرصد:** ${detailsText}`;
        await sendDiscordLog(logMsg);
    }
    clearCache();
}

// إرسال المتدرب للرصد النهائي (للقيادة)
async function sendToFinalDecision(discordId, officerName) {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Academy_System'] || doc.sheetsByIndex[1];
    const rows = await sheet.getRows();
    const row = rows.find(r => r.get('Discord_ID') === discordId || r.get('Copy_ID') === discordId);

    if (row) {
        const appName = row.get('Name') || 'غير متوفر';
        const appCopyId = row.get('Copy_ID') || 'غير متوفر';
        const appNatId = row.get('National_ID') || 'غير متوفر';
        const totalScore = row.get('Total_Score') || 0;

        row.assign({
            Stage: 'final',
            Status: 'بانتظار الاعتماد النهائي'
        });

        let currentLogs = row.get('Graded_By') || '';
        const dateNow = new Date().toLocaleDateString('en-GB');
        const logText = `[⬆️ رُفع للقيادة بواسطة: ${officerName} (${dateNow})]`;
        
        row.assign({ Graded_By: `${currentLogs} ${logText}`.trim() });
        await row.save();

        const logMsg = `🚀 **نوع الإجراء:** الرفع للتقييم النهائي\n` +
                       `━━━━━━━━━━━━━━━━━━━━\n` +
                       `👮‍♂️ **بيانات المدرب:**\n` +
                       `👤 **اسم الديسكورد:** ${officerName}\n` +
                       `━━━━━━━━━━━━━━━━━━━━\n` +
                       `🎯 **بيانات المتدرب :**\n` +
                       `👤 **الاسم:** ${appName}\n` +
                       `💬 **الديسكورد:** <@${discordId}> (\`${discordId}\`)\n` +
                       `📋 **كوبي ايدي:** \`${appCopyId}\`\n` +
                       `🪪 **الرقم الوطني:** \`${appNatId}\`\n` +
                       `━━━━━━━━━━━━━━━━━━━━\n` +
                       `📊 **المجموع الكلي للدرجات:** **${totalScore}/50**\n` +
                       `📝 **التفاصيل:** تم اكتمال رصد درجات الميدان ورفع الملف للقيادة للاعتماد.`;
        await sendDiscordLog(logMsg);
    }
    clearCache();
}

// دالة منح أو إلغاء النجاح الاستثنائي
async function toggleException(discordId, action, officerName) {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Academy_System'] || doc.sheetsByIndex[1];
    const rows = await sheet.getRows();
    const row = rows.find(r => r.get('Discord_ID') === discordId || r.get('Copy_ID') === discordId);

    if (row) {
        const appName = row.get('Name') || 'غير متوفر';
        const appCopyId = row.get('Copy_ID') || 'غير متوفر';
        const appNatId = row.get('National_ID') || 'غير متوفر';
        const dateNow = new Date().toLocaleDateString('en-GB');
        
        let currentLogs = row.get('Graded_By') || '';
        let logText = '';
        let actionDesc = '';

        if (action === 'add') {
            row.assign({ Status: 'ناجح استثنائياً' });
            logText = `[✨ مُنح نجاح استثنائي بواسطة: ${officerName} (${dateNow})]`;
            actionDesc = '✨ تم منح المتدرب حالة (نجاح استثنائي) لتأهيله للتخرج.';
        } else {
            row.assign({ Status: 'بانتظار الاعتماد النهائي' });
            logText = `[❌ أُلغي الاستثناء بواسطة: ${officerName} (${dateNow})]`;
            actionDesc = '❌ تم إلغاء حالة الاستثناء وإعادة المتدرب لحالة الرسوب.';
        }

        row.assign({ Graded_By: `${currentLogs} ${logText}`.trim() });
        await row.save();

        const logMsg = `⚠️ **نوع الإجراء:** تعديل حالة استثنائية\n` +
                       `━━━━━━━━━━━━━━━━━━━━\n` +
                       `👮‍♂️ **بيانات المدرب:**\n` +
                       `👤 **اسم الديسكورد:** ${officerName}\n` +
                       `━━━━━━━━━━━━━━━━━━━━\n` +
                       `🎯 **بيانات المتدرب :**\n` +
                       `👤 **الاسم:** ${appName}\n` +
                       `💬 **الديسكورد:** <@${discordId}> (\`${discordId}\`)\n` +
                       `📋 **كوبي ايدي:** \`${appCopyId}\`\n` +
                       `🪪 **الرقم الوطني:** \`${appNatId}\`\n` +
                       `━━━━━━━━━━━━━━━━━━━━\n` +
                       `📝 **التفاصيل:** ${actionDesc}`;
        await sendDiscordLog(logMsg);
    }
    clearCache();
}

// دالة الاعتماد النهائي (تخرج أو طي قيد) وإرسال التهنئة التلقائية
async function finalDecision(discordId, decisionType, officerName) {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Academy_System'] || doc.sheetsByIndex[1];
    const rows = await sheet.getRows();
    const row = rows.find(r => r.get('Discord_ID') === discordId || r.get('Copy_ID') === discordId);

    if (row) {
        const appName = row.get('Name') || 'غير متوفر';
        const appCopyId = row.get('Copy_ID') || 'غير متوفر';
        const appNatId = row.get('National_ID') || 'غير متوفر';
        const dateNow = new Date().toLocaleDateString('en-GB');
        
        let newStage = decisionType === 'graduated' ? 'graduated' : 'failed';
        let newStatus = decisionType === 'graduated' ? 'متخرج ومقبول نهائياً' : 'مرفوض نهائياً - طي قيد';
        let logText = decisionType === 'graduated' ? `[🎓 اُعتمد تخرجه بواسطة: ${officerName} (${dateNow})]` : `[✖ طُوي قيده بواسطة: ${officerName} (${dateNow})]`;

        let currentLogs = row.get('Graded_By') || '';
        row.assign({ 
            Stage: newStage, 
            Status: newStatus,
            Final_Decision: decisionType === 'graduated' ? 'ناجح' : 'راسب',
            Graded_By: `${currentLogs} ${logText}`.trim() 
        });
        await row.save();
        
        const discordMsg = decisionType === 'graduated' ? '🎓 **تم اعتماد التخرج بنجاح وانضمامه للسلك العسكري.**' : '✖ **تم اعتماد طي القيد (رسوب) وإغلاق الملف.**';
        
        const logMsg = `👑 **نوع الإجراء:** قرار القيادة النهائي\n` +
                       `━━━━━━━━━━━━━━━━━━━━\n` +
                       `👮‍♂️ **بيانات المدرب:**\n` +
                       `👤 **اسم الديسكورد:** ${officerName}\n` +
                       `━━━━━━━━━━━━━━━━━━━━\n` +
                       `🎯 **بيانات المتدرب:**\n` +
                       `👤 **الاسم:** ${appName}\n` +
                       `💬 **الديسكورد:** <@${discordId}>\n` +
                       `📋 **كوبي ايدي:** \`${appCopyId}\`\n` +
                       `🪪 **الرقم الوطني:** \`${appNatId}\`\n` +
                       `━━━━━━━━━━━━━━━━━━━━\n` +
                       `📝 **التفاصيل:** ${discordMsg}`;
        await sendDiscordLog(logMsg);

        // 👇 الكود الذي استفسرت عنه تم وضعه هنا ليرسل التهنئة التلقائية فور التخرج 👇
        if (decisionType === 'graduated') {
            const templates = await getTemplates();
            const dmMessage = `👑 **ألف مبروك! تم اعتماد تخرجه النهائي وانضمامك للشرطة**\n\n${templates.final || 'تمنياتنا لك بالتوفيق في مسيرتك العسكرية.'}`;
            await sendDiscordDM(appCopyId, dmMessage);
        }
        // 👆 👆
    }
    clearCache();
}
// 🚀 نظام دليل الكلية: سحب الأسئلة من الشيت الجديد
async function getGuideQuestions() {
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['Academy_Guide'];
        if (!sheet) return []; 

        const rows = await sheet.getRows();
        return rows.map(row => ({
            id: row.get('Question_ID') || '',
            section: row.get('Section') || '',
            text: row.get('Question_Text') || '',
            maxScore: Number(row.get('Max_Score')) || 0,
            addedBy: row.get('Added_By') || ''
        }));
    } catch (error) {
        console.log("⚠️ خطأ في قراءة دليل الكلية:", error.message);
        return [];
    }
}

// أضف سؤال جديد للدليل
async function addGuideQuestion(section, text, maxScore, addedBy) {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Academy_Guide'];
    if (!sheet) return;

    await sheet.addRow({
        Question_ID: 'Q-' + Date.now(), // توليد معرف فريد تلقائي للسؤال
        Section: section,
        Question_Text: text,
        Max_Score: Number(maxScore),
        Added_By: addedBy
    });
}

// حذف سؤال من الدليل (خاص بالمشرفين والقيادة)
async function deleteGuideQuestion(questionId) {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Academy_Guide'];
    if (!sheet) return;

    const rows = await sheet.getRows();
    const rowToDelete = rows.find(r => r.get('Question_ID') === questionId);
    if (rowToDelete) {
        await rowToDelete.delete();
    }
}

// دوال فارغة للحفاظ على استقرار السيرفر ومنع أخطاء التصدير
async function updateApplicationStage(discordId, newStage, newStatus) {}
async function gradeApplicant(discordId, section, score, graderName) {}

// ==========================================
// 🚀 نظام إدارة قوالب الرسائل التلقائية
// ==========================================
// 🚀 دالة الإرسال على الخاص (DM) للعساكر
async function sendDiscordDM(copyId, messageContent) {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) return console.log("⚠️ توكن البوت غير موجود!");
    
    try {
        // 1. فتح قناة خاصة مع العسكري باستخدام الـ Copy ID
        const dmRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
            method: 'POST',
            headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient_id: String(copyId).trim() })
        });
        const dmData = await dmRes.json();
        
        if (!dmData.id) return console.log("⚠️ فشل فتح الخاص مع:", copyId, dmData);

        // 2. إرسال الرسالة
        await fetch(`https://discord.com/api/v10/channels/${dmData.id}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: messageContent })
        });
    } catch (err) {
        console.log("⚠️ خطأ في إرسال الـ DM:", err.message);
    }
}

async function getTemplates() {
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['Academy_Templates'];
        if (!sheet) return { interview: '', preliminary: '', final: '' };
        
        const rows = await sheet.getRows();
        let templates = { interview: '', preliminary: '', final: '' };
        
        rows.forEach(r => {
            const type = r.get('Type');
            const msg = r.get('Message');
            if (type === 'interview') templates.interview = msg;
            if (type === 'preliminary') templates.preliminary = msg;
            if (type === 'final') templates.final = msg;
        });
        return templates;
    } catch (err) {
        console.log("⚠️ خطأ في قراءة القوالب:", err.message);
        return { interview: '', preliminary: '', final: '' };
    }
}

async function saveTemplate(type, message) {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Academy_Templates'];
    if (!sheet) throw new Error("شيت Academy_Templates غير موجود!");

    const rows = await sheet.getRows();
    const existingRow = rows.find(r => r.get('Type') === type);

    if (existingRow) {
        existingRow.assign({ Message: message });
        await existingRow.save();
    } else {
        await sheet.addRow({ Type: type, Message: message });
    }
}

// التصدير الشامل والكامل لجميع دوال النظام بدون أي نقص
module.exports = { 
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
    getGuideQuestions,      // تأكدنا من تصديرها هنا
    addGuideQuestion,       // وهنا
    deleteGuideQuestion, 
    getTemplates,
    saveTemplate    // وهنا
};