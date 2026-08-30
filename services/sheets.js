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

// 2. إعداد تصريح الدخول
const serviceAccountAuth = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// 3. تمرير تصريح الدخول للشيت
const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);

const memoryCache = { rawApps: null, academyApps: null, lastFetchTime: 0 };
const CACHE_TTL = 1 * 1000; 

function clearCache() {
    memoryCache.rawApps = null;
    memoryCache.academyApps = null;
    memoryCache.lastFetchTime = 0;
}

// 🚀 دالة إرسال اللوقات بنظام (Embed) الفخم والمنظم
async function sendDiscordLog(embedData) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                embeds: [{
                    title: embedData.title,
                    description: embedData.description,
                    color: embedData.color,
                    fields: embedData.fields,
                    footer: { text: "نظام الكلية العسكرية - اللوق المركزي" },
                    timestamp: new Date().toISOString()
                }]
            })
        });
    } catch (err) {
        console.log("⚠️ فشل إرسال اللوق للديسكورد:", err.message);
    }
}

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

// 3. النقل الذكي: يقبل التقديم ويرسله للميدان فوراً (بدون مقابلات وبدون DM)
async function acceptFromRawToAcademy(rawId, name, answers, officerName, discordId, nationalId, age) {
    await doc.loadInfo();
    const academySheet = doc.sheetsByTitle['Academy_System'] || doc.sheetsByIndex[1];
    
    const finalDiscordId = String(discordId).trim();
    const finalName = String(name).trim();
    const finalCopyId = String(rawId).trim(); 
    const finalNationalId = String(nationalId).trim();

    const existingRows = await academySheet.getRows();
    const existingRow = existingRows.find(r => String(r.get('Copy_ID')).trim() === finalCopyId);
    
    if (!existingRow) {
        await academySheet.addRow({
            Discord_ID: finalDiscordId,
            Name: finalName,
            Copy_ID: finalCopyId,
            National_ID: finalNationalId,
            Stage: 'preliminary',       // 👈 تحول للميدان مباشرة
            Status: 'مقبول مبدئيا',
            Stops_Score: 0, Neg_Score: 0, Ops_Score: 0, Gen_Score: 0, Total_Score: 0, 
            Graded_By: '[✔ قبول مبدئي للميدان]',
            Final_Decision: 'معلق'
        });
    } else {
        existingRow.assign({ 
            Discord_ID: finalDiscordId,
            National_ID: finalNationalId,
            Stage: 'preliminary', 
            Status: 'مقبول مبدئيا',
            Graded_By: '[✔ قبول مبدئي للميدان]'
        });
        await existingRow.save();
    }
    clearCache();
    
    // إرسال اللوق بنظام الـ Embed
    await sendDiscordLog({
        title: "✅ قبول تقديم (نقل للميدان)",
        description: "تم قبول تقديم جديد وتحويله لميدان التدريب.",
        color: 0x10B981, // أخضر
        fields: [
            { name: "👮‍♂️ المعتمد", value: officerName, inline: true },
            { name: "👤 اسم المتقدم", value: finalName, inline: true },
            { name: "💬 ديسكورد", value: `<@${finalDiscordId}>`, inline: true },
            { name: "📋 Copy ID", value: `\`${finalCopyId}\``, inline: true },
            { name: "🪪 رقم وطني", value: `\`${finalNationalId}\``, inline: true }
        ]
    });
}

// 4. رفض التقديم (بدون DM)
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

    await sendDiscordLog({
        title: "🛑 رفض تقديم",
        description: "تم رفض التقديم بشكل نهائي.",
        color: 0xEF4444, // أحمر
        fields: [
            { name: "👮‍♂️ المعتمد", value: officerName, inline: true },
            { name: "👤 اسم المتقدم", value: name, inline: true },
            { name: "💬 ديسكورد", value: `<@${discordId}>`, inline: true },
            { name: "📋 Copy ID", value: `\`${copyId}\``, inline: true }
        ]
    });
}

// 5. رصد الدرجات المتقدم
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

        await sendDiscordLog({
            title: `🎯 رصد ميداني - ${sectionAr}`,
            description: `تم رصد درجة قسم **${sectionAr}** بنجاح.`,
            color: 0x3B82F6, // أزرق
            fields: [
                { name: "👮‍♂️ المدرب", value: graderName, inline: true },
                { name: "👤 المتدرب", value: appName, inline: true },
                { name: "💬 ديسكورد", value: `<@${discordId}>`, inline: true },
                { name: "📊 الدرجة المسجلة", value: `**${finalScore}**`, inline: true },
                { name: "📝 التفاصيل", value: detailsText, inline: false }
            ]
        });
    }
    clearCache();
}

// 6. إرسال المتدرب للرصد النهائي (للقيادة)
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

        await sendDiscordLog({
            title: "🚀 رفع للتقييم النهائي",
            description: "تم اكتمال رصد الميدان ورفع الملف للقيادة.",
            color: 0x8B5CF6, // بنفسجي
            fields: [
                { name: "👮‍♂️ الرافع", value: officerName, inline: true },
                { name: "👤 المتدرب", value: appName, inline: true },
                { name: "💬 ديسكورد", value: `<@${discordId}>`, inline: true },
                { name: "📊 المجموع الكلي", value: `**${totalScore}/50**`, inline: true }
            ]
        });
    }
    clearCache();
}

// 7. دالة منح أو إلغاء النجاح الاستثنائي
async function toggleException(discordId, action, officerName) {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Academy_System'] || doc.sheetsByIndex[1];
    const rows = await sheet.getRows();
    const row = rows.find(r => r.get('Discord_ID') === discordId || r.get('Copy_ID') === discordId);

    if (row) {
        const appName = row.get('Name') || 'غير متوفر';
        const appCopyId = row.get('Copy_ID') || 'غير متوفر';
        const dateNow = new Date().toLocaleDateString('en-GB');
        
        let currentLogs = row.get('Graded_By') || '';
        let logText = '';
        let actionDesc = '';
        let embedColor = 0xF59E0B; // أصفر

        if (action === 'add') {
            row.assign({ Status: 'ناجح استثنائياً' });
            logText = `[✨ مُنح استثناء بواسطة: ${officerName} (${dateNow})]`;
            actionDesc = '✨ تم منح المتدرب (نجاح استثنائي) للنجاح.';
            embedColor = 0x10B981; // أخضر
        } else {
            row.assign({ Status: 'بانتظار الاعتماد النهائي' });
            logText = `[❌ أُلغي الاستثناء بواسطة: ${officerName} (${dateNow})]`;
            actionDesc = '❌ تم إلغاء الاستثناء وإعادته للرسوب.';
            embedColor = 0xEF4444; // أحمر
        }

        row.assign({ Graded_By: `${currentLogs} ${logText}`.trim() });
        await row.save();

        await sendDiscordLog({
            title: "⚠️ تعديل حالة استثنائية",
            description: actionDesc,
            color: embedColor,
            fields: [
                { name: "👮‍♂️ المعتمد", value: officerName, inline: true },
                { name: "👤 المتدرب", value: appName, inline: true },
                { name: "💬 ديسكورد", value: `<@${discordId}>`, inline: true }
            ]
        });
    }
    clearCache();
}

// 8. دالة الاعتماد النهائي (تخرج أو طي قيد) - بدون DM
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
        let logText = decisionType === 'graduated' ? `[🎓 تخرج بواسطة: ${officerName} (${dateNow})]` : `[✖ طُوي قيده بواسطة: ${officerName} (${dateNow})]`;

        let currentLogs = row.get('Graded_By') || '';
        row.assign({ 
            Stage: newStage, 
            Status: newStatus,
            Final_Decision: decisionType === 'graduated' ? 'ناجح' : 'راسب',
            Graded_By: `${currentLogs} ${logText}`.trim() 
        });
        await row.save();
        
        const isGraduated = decisionType === 'graduated';
        await sendDiscordLog({
            title: isGraduated ? "👑 اعتماد تخرج (نجاح)" : "👑 طي قيد (رسوب)",
            description: isGraduated ? "تم اعتماد التخرج رسمياً وانضمامه للشرطة." : "تم اعتماد طي القيد وإغلاق الملف.",
            color: isGraduated ? 0xFBBF24 : 0xDC2626, // ذهبي للنجاح، أحمر غامق للرسوب
            fields: [
                { name: "👮‍♂️ القيادي", value: officerName, inline: true },
                { name: "👤 المتدرب", value: appName, inline: true },
                { name: "💬 ديسكورد", value: `<@${discordId}>`, inline: true },
                { name: "🪪 رقم وطني", value: `\`${appNatId}\``, inline: true },
                { name: "📋 Copy ID", value: `\`${appCopyId}\``, inline: true }
            ]
        });
    }
    clearCache();
}

// 9. دوال دليل الكلية
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
    } catch (error) { return []; }
}

async function addGuideQuestion(section, text, maxScore, addedBy) {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Academy_Guide'];
    if (!sheet) return;
    await sheet.addRow({
        Question_ID: 'Q-' + Date.now(),
        Section: section,
        Question_Text: text,
        Max_Score: Number(maxScore),
        Added_By: addedBy
    });
}

async function deleteGuideQuestion(questionId) {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Academy_Guide'];
    if (!sheet) return;
    const rows = await sheet.getRows();
    const rowToDelete = rows.find(r => r.get('Question_ID') === questionId);
    if (rowToDelete) await rowToDelete.delete();
}

// 10. دوال القوالب
async function getTemplates() {
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['Academy_Templates'];
        if (!sheet) return { preliminary: '', final: '', reject_final: '' };
        
        const rows = await sheet.getRows();
        let templates = { preliminary: '', final: '', reject_final: '' };
        
        rows.forEach(r => {
            const type = r.get('Type');
            const msg = r.get('Message');
            if (type === 'preliminary') templates.preliminary = msg;
            if (type === 'final') templates.final = msg;
            if (type === 'reject_final') templates.reject_final = msg;
        });
        return templates;
    } catch (err) { return { preliminary: '', final: '', reject_final: '' }; }
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

// 1. جلب أسئلة التقديم المخصصة
async function getApplicationCustomQuestions() {
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['Academy_Application_Questions'];
        if (!sheet) return [];
        const rows = await sheet.getRows();
        return rows.map(r => ({
            id: r.get('ID') || '',
            question: r.get('Question_Text') || '',
            placeholder: r.get('Placeholder') || ''
        }));
    } catch (err) {
        return [];
    }
}

// 2. سحب تقديمات التدريب الجديدة والخاصة بالكلية فقط
async function getTrainingApplications() {
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['Academy_Training_Applications'];
        if (!sheet) return [];

        const rows = await sheet.getRows();
        const results = rows.map((row, index) => {
            let fullAnswers = "";
            const qaList = [];
            const headers = sheet.headerValues || [];
            
            headers.forEach(header => {
                if (!['#', 'اليوزر نيم', 'الاسم داخل السيرفر', 'الرقم الوطني', 'Copy ID', 'التاريخ'].includes(header)) {
                    const answerText = row.get(header) || 'بدون إجابة';
                    fullAnswers += `🔹 **${header}**: ${answerText}\n`;
                    qaList.push({ question: header, answer: answerText });
                }
            });

            const copyId = row.get('Copy ID') || row.get('ID') || 'غير متوفر';
            const discordId = row.get('اليوزر نيم') || 'غير متوفر';
            const nationalId = row.get('الرقم الوطني') || 'غير متوفر';

            return {
                rowNumber: index + 2,
                id: String(copyId).trim(),
                copyId: String(copyId).trim(),
                discordId: String(discordId).trim(),
                nationalId: String(nationalId).trim(),
                username: String(discordId).trim(),
                name: String(row.get('الاسم داخل السيرفر')).trim() || 'متدرب غير معروف',
                date: row.get('التاريخ') || '',
                answers: fullAnswers,
                qaList: qaList
            };
        });

        return results;
    } catch (error) {
        console.log("⚠️ خطأ في قراءة شيت تقديمات التدريب:", error.message);
        return [];
    }
}

// 3. حفظ طلب تقديم التدريب في الورقة المخصصة
async function submitNewApplicant(discordUser, nationalId, answersArray) {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Academy_Training_Applications'];
    if (!sheet) throw new Error("شيت Academy_Training_Applications غير موجود!");
    
    let answerHeaders = {};
    const dateStr = new Date().toLocaleDateString('en-GB');

    answersArray.forEach(a => {
        answerHeaders[a.question] = a.answer;
    });

    await sheet.addRow({
        '#': Date.now(),
        'اليوزر نيم': discordUser.username,
        'الاسم داخل السيرفر': discordUser.displayName || discordUser.username,
        'الرقم الوطني': nationalId,
        'Copy ID': discordUser.id,
        'التاريخ': dateStr,
        ...answerHeaders
    });

    clearCache();
}

// 4. قبول طلب التدريب ونقله مباشرة لميدان Academy_System
async function acceptTrainingApplicant(id, name, answers, officerName, discordId, nationalId) {
    await doc.loadInfo();
    const academySheet = doc.sheetsByTitle['Academy_System'] || doc.sheetsByIndex[1];
    
    const finalDiscordId = String(discordId).trim();
    const finalName = String(name).trim();
    const finalCopyId = String(id).trim(); 
    const finalNationalId = String(nationalId).trim();

    const existingRows = await academySheet.getRows();
    const existingRow = existingRows.find(r => String(r.get('Copy_ID')).trim() === finalCopyId);
    
    if (!existingRow) {
        await academySheet.addRow({
            Discord_ID: finalDiscordId,
            Name: finalName,
            Copy_ID: finalCopyId,
            National_ID: finalNationalId,
            Stage: 'preliminary',
            Status: 'مقبول مبدئيا',
            Stops_Score: 0, Neg_Score: 0, Ops_Score: 0, Gen_Score: 0, Total_Score: 0, 
            Graded_By: '[✔ قبول تدريب - ميدان]',
            Final_Decision: 'معلق'
        });
    } else {
        existingRow.assign({ 
            Discord_ID: finalDiscordId,
            National_ID: finalNationalId,
            Stage: 'preliminary', 
            Status: 'مقبول مبدئيا',
            Graded_By: '[✔ قبول تدريب - ميدان]'
        });
        await existingRow.save();
    }
    clearCache();
    
    await sendDiscordLog({
        title: "✅ قبول طلب تدريب عسكري",
        description: "تم قبول المرشح للدورة التدريبية ونقله لميدان الرصد.",
        color: 0x10B981,
        fields: [
            { name: "👮‍♂️ المسؤول", value: officerName, inline: true },
            { name: "👤 المتدرب", value: finalName, inline: true },
            { name: "💬 ديسكورد", value: `<@${finalDiscordId}>`, inline: true },
            { name: "🪪 رقم وطني", value: `\`${finalNationalId}\``, inline: true }
        ]
    });
}

// 5. رفض طلب التدريب
async function rejectTrainingApplicant(id, name, answers, officerName) {
    await doc.loadInfo();
    const academySheet = doc.sheetsByTitle['Academy_System'] || doc.sheetsByIndex[1];
    
    const existingRows = await academySheet.getRows();
    const existingRow = existingRows.find(r => String(r.get('Copy_ID')).trim() === String(id).trim());

    if (!existingRow) {
        await academySheet.addRow({
            Discord_ID: String(id).trim(),
            Name: name,
            Copy_ID: String(id).trim(),
            National_ID: 'غير متوفر',
            Stage: 'rejected',
            Status: 'مرفوض من الدورة التدريبية',
            Stops_Score: 0, Neg_Score: 0, Ops_Score: 0, Gen_Score: 0, Total_Score: 0, 
            Graded_By: '[✖ تم الرفض من التدريب]',
            Final_Decision: 'مرفوض'
        });
    } else {
        existingRow.assign({ 
            Stage: 'rejected', 
            Status: 'مرفوض من الدورة التدريبية', 
            Graded_By: '[✖ تم الرفض من التدريب]' 
        });
        await existingRow.save();
    }
    clearCache();

    await sendDiscordLog({
        title: "🛑 رفض طلب تدريب عسكري",
        description: "تم رفض طلب الالتحاق بالدورة التدريبية.",
        color: 0xEF4444,
        fields: [
            { name: "👮‍♂️ المسؤول", value: officerName, inline: true },
            { name: "👤 الاسم", value: name, inline: true },
            { name: "📋 Copy ID", value: `\`${id}\``, inline: true }
        ]
    });
}

module.exports = { 
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
    saveTemplate,
    getTrainingApplications,
    getApplicationCustomQuestions,
    submitNewApplicant,
    acceptTrainingApplicant,
    rejectTrainingApplicant
};