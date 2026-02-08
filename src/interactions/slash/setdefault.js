const { SlashCommandBuilder } = require('discord.js');
const BackgroundManager = require('../../utils/BackgroundManager');

// Admin Usernames
const BOT_ADMINS = ['mido_tarek14', 'samasemo14', '0fi.2'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setdefault')
        .setDescription('تعيين خلفية افتراضية للبوت (للمطورين فقط)')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('نوع الخلفية')
                .setRequired(true)
                .addChoices(
                    { name: 'All (الكل)', value: 'default' },
                    { name: 'Lobby (الانتظار)', value: 'lobby' },
                    { name: 'Voting (التصويت)', value: 'voting' },
                    { name: 'Results (النتائج - Crew)', value: 'results_crew' },
                    { name: 'Results (النتائج - Imposter)', value: 'results_imposter' },
                    { name: 'Leaderboard (التوب)', value: 'leaderboard' },
                    { name: 'Turn (وقت الأسئلة)', value: 'turn' }
                ))
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('الصورة المراد تعيينها')
                .setRequired(true)),

    async execute(interaction) {
        // Owner Check
        if (!BOT_ADMINS.includes(interaction.user.username)) {
            return interaction.reply({ content: '❌ هذا الأمر للمطورين فقط.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const type = interaction.options.getString('type');
        const image = interaction.options.getAttachment('image');

        // Validate image
        if (!image.contentType.startsWith('image/')) {
            return interaction.editReply('❌ الرجاء إرفاق ملف صورة صالح.');
        }

        try {
            await BackgroundManager.setDefaultBackground(image.url, type);
            await interaction.editReply(`✅ تم تعيين الخلفية الافتراضية بنجاح للنوع: **${type}**`);
        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ حدث خطأ أثناء تعيين الخلفية.');
        }
    }
};
