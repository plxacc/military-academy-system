const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { getApplications } = require('./services/sheets');
const { ROLES, getUserPermissions } = require('./config/roles');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.on('ready', () => {
    console.log(`🤖 بوت الكلية العسكرية شغال باسم: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // أمر: !درجتي - الطالب يشيك على درجته وحالته مباشرة من الشيت
    if (message.content === '!درجتي') {
        const apps = await getApplications();
        const myApp = apps.find(app => app.id === message.author.id);

        if (!myApp) {
            return message.reply('⚠️ **ما لقيت لك تقديم مسجل في شيت الكلية العسكرية!**');
        }

        const embed = new EmbedBuilder()
            .setTitle(`🛡️ نتيجة التقييم | ${myApp.name}`)
            .setColor(myApp.totalScore >= 40 ? 0x22c55e : (myApp.totalScore > 0 ? 0xef4444 : 0xf97316))
            .addFields(
                { name: '📊 المجموع الكلي', value: `**${myApp.totalScore} / 50**`, inline: true },
                { name: '📌 الحالة الحالية', value: `**${myApp.status || 'قيد المراجعة'}**`, inline: true },
                { name: '🚓 استيقافات', value: `${myApp.stopsScore}/20`, inline: true },
                { name: '🗣️ تفاوض', value: `${myApp.negScore}/10`, inline: true },
                { name: '⚙️ عمليات', value: `${myApp.opsScore}/10`, inline: true },
                { name: '❓ أسئلة عامة', value: `${myApp.genScore}/10`, inline: true }
            )
            .setFooter({ text: 'الكلية العسكرية - شرطة جستس' })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    // أمر: !المقبولين - مخصص للقيادة ومشرفين التدريب فقط لعرض من حصل على 40 وفوق
    if (message.content === '!المقبولين') {
        const memberRoles = message.member.roles.cache.map(r => r.id);
        const perms = getUserPermissions(memberRoles);

        if (!perms.canViewAll) {
            return message.reply('⛔ **هذا الأمر مخصص للقيادة ومشرفين التدريب فقط!**');
        }

        const apps = await getApplications();
        const passedApps = apps.filter(app => app.totalScore >= 40);

        if (passedApps.length === 0) {
            return message.reply('📭 **لا يوجد أي متقدم حاصل على 40 درجة فما فوق حتى الآن.**');
        }

        let listText = '';
        passedApps.forEach((app, index) => {
            listText += `**${index + 1}.** <@${app.id}> | الاسم: \`${app.name}\` | الدرجة: **${app.totalScore}/50**\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle('✅ قائمة المجتازين للتقييم (40 درجة فما فوق)')
            .setDescription(listText)
            .setColor(0x22c55e)
            .setFooter({ text: 'نظام الرصد المركزي' });

        return message.reply({ embeds: [embed] });
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);