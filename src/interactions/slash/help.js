const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { EMBED_COLOR } = require('../../Constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('قائمة أوامر البوت'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('📜 قائمة الأوامر')
            .setColor(EMBED_COLOR)
            .addFields(
                { name: '`/imposter`', value: 'بدء لعبة جديدة في القناة الحالية.' },
                { name: '`/points`', value: 'عرض لوحة المتصدرين (Leaderboard).' },
                { name: '`/vote`', value: 'التصويت (يستخدم عادة عبر الأزرار).' },
                { name: '`/stop`', value: 'إيقاف اللعبة الجارية (مشرفين فقط).' },
                { name: '`/setbg`', value: 'تغيير خلفية اللعبة (مشرفين فقط).' },
                { name: '`/setup`', value: 'إعداد قنوات اللعب (مشرفين فقط).' },
                { name: '`/addfont`', value: 'إضافة خط جديد من رابط (مشرفين فقط).' },
                { name: '`/setprefix`', value: 'تغيير بادئة الأوامر الكتابية.' },
                { name: '`/help`', value: 'عرض هذه القائمة.' }
            )
            .setFooter({ text: 'Imposter Bot' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
