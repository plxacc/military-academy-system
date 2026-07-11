const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
require('dotenv').config();

// 1. تنظيف ومعالجة مفتاح قوقل السري ليتوافق مع Vercel
let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';

// إزالة علامات التنصيص إذا أضافها Vercel بالخطأ
if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
}
// تحويل الرموز النصية إلى أسطر حقيقية يفهمها قوقل
privateKey = privateKey.replace(/\\n/g, '\n');

// 2. إعداد المصادقة
const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey, // استخدام المفتاح بعد التنظيف
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);

let memoryCache = { rawApps: null, academyApps: null, lastFetchTime: 0 };
const CACHE_TTL = 15 * 1000;

function clearCache() {
    memoryCache.rawApps = null;
    memoryCache.academyApps = null;
    memoryCache.lastFetchTime = 0;
}

// 🚀 نظام إرسال اللوقات للديسكورد عبر Webhook
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
    await sendDiscordLog(`❌ **رفض تقديم**\n👮‍♂️ **المدرب:** ${officerName}\n👤 **المتقدم:** ${name}\n📋 **كوبي ايدي:** \`${copyId}\``);
}

// قرار المقابلة (قبول/رفض) مع تسجيل من أجرى المقابلة
async function decideInterview(discordId, decisionType, officerName, interviewerName = "") {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Academy_System'] || doc.sheetsByIndex[1];
    const rows = await sheet.getRows();
    const row = rows.find(r => String(r.get('Discord_ID')).trim() === String(discordId).trim() || String(r.get('Copy_ID')).trim() === String(discordId).trim());
    
    if (row) {
        const dateNow = new Date().toLocaleDateString('en-GB');
        let newStage = '';
        let newStatus = '';
        let logMessage = '';

        if (decisionType === 'accept') {
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
        
        const decisionMsg = decisionType === 'accept' ? `✔ تم قبوله لميدان التدريب\n🗣️ **المُقابل:** ${interviewerName}` : '✖ تم رفضه في المقابلة الشخصية';
        await sendDiscordLog(`🎙️ **قرار مقابلة شخصية**\n👮‍♂️ **المُعتمد:** ${officerName}\n👤 **المتقدم:** \`${discordId}\`\n📋 **القرار:** ${decisionMsg}`);
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

        await sendDiscordLog(`🎯 **رصد درجات الميدان**\n👮‍♂️ **المدرب/المدرب:** ${graderName}\n👤 **المتدرب:** <@${discordId}> (\`${discordId}\`)\n📊 **القسم:** ${sectionAr}\n📝 **التفاصيل:** ${detailsText}\n⭐ **النتيجة المسجلة:** **${finalScore}**`);
    }
    clearCache();
}

async function updateApplicationStage(discordId, newStage, newStatus) {}
async function gradeApplicant(discordId, section, score, graderName) {}

// إرسال المتدرب للرصد النهائي (للقيادة)
async function sendToFinalDecision(discordId, officerName) {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Academy_System'] || doc.sheetsByIndex[1];
    const rows = await sheet.getRows();
    const row = rows.find(r => r.get('Discord_ID') === discordId || r.get('Copy_ID') === discordId);

    if (row) {
        row.assign({
            Stage: 'final',
            Status: 'بانتظار الاعتماد النهائي'
        });

        let currentLogs = row.get('Graded_By') || '';
        const dateNow = new Date().toLocaleDateString('en-GB');
        const logText = `[⬆️ رُفع للقيادة بواسطة: ${officerName} (${dateNow})]`;
        
        row.assign({ Graded_By: `${currentLogs} ${logText}`.trim() });
        await row.save();

        const totalScore = row.get('Total_Score') || 0;
        await sendDiscordLog(`🚀 **إرسال للرصد النهائي**\n👮‍♂️ **بواسطة:** ${officerName}\n👤 **المتدرب:** <@${discordId}>\n📊 **المجموع:** **${totalScore}/50**\n⏳ بانتظار مراجعة القيادة.`);
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
        const dateNow = new Date().toLocaleDateString('en-GB');
        let currentLogs = row.get('Graded_By') || '';
        let logText = '';

        if (action === 'add') {
            row.assign({ Status: 'ناجح استثنائياً' });
            logText = `[✨ مُنح نجاح استثنائي بواسطة: ${officerName} (${dateNow})]`;
        } else {
            row.assign({ Status: 'بانتظار الاعتماد النهائي' }); // يرجع لحالته الطبيعية
            logText = `[❌ أُلغي الاستثناء بواسطة: ${officerName} (${dateNow})]`;
        }

        row.assign({ Graded_By: `${currentLogs} ${logText}`.trim() });
        await row.save();
    }
    clearCache();
}

// دالة الاعتماد النهائي (تخرج أو طي قيد)
async function finalDecision(discordId, decisionType, officerName) {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Academy_System'] || doc.sheetsByIndex[1];
    const rows = await sheet.getRows();
    const row = rows.find(r => r.get('Discord_ID') === discordId || r.get('Copy_ID') === discordId);

    if (row) {
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
        
        const discordMsg = decisionType === 'graduated' ? '🎓 **تم اعتماد التخرج بنجاح**' : '✖ **تم طي القيد (رسوب)**';
        await sendDiscordLog(`👑 **قرار القيادة النهائي**\n👮‍♂️ **المُعتمد:** ${officerName}\n👤 **المتدرب:** <@${discordId}>\n📋 **القرار:** ${discordMsg}`);
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

// لا تنسى إضافتهم في التصدير آخر سطر بالملف:
// module.exports = { ..., getGuideQuestions, addGuideQuestion, deleteGuideQuestion };

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
    deleteGuideQuestion     // وهنا
};