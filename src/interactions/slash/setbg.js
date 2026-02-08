const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const BackgroundManager = require('../../utils/BackgroundManager');

// Admin only (checking permissions in code or via builder)
// Note: setDefaultMemberPermissions only works in guilds, not DMs (which is fine)
// We also implement manual check just in case.

const BOT_ADMINS = ['mido_tarek14', 'samasemo14'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setbg')
        .setDescription('تغيير خلفية اللعبة')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('نوع الخلفية')
                .setRequired(true)
                .addChoices(
                    { name: 'Lobby', value: 'lobby' },
                    { name: 'Voting', value: 'voting' },
                    { name: 'Results', value: 'results' },
                    { name: 'Leaderboard', value: 'leaderboard' }
                ))
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('الصورة المراد استخدامها')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Extra check for Bot Admins who might not have Administrator permission
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || BOT_ADMINS.includes(interaction.user.username);
        if (!isAdmin) {
            return interaction.reply({ content: '🚫 هذا الأمر مخصص للمشرفين فقط.', ephemeral: true });
        }

        const type = interaction.options.getString('type');
        const image = interaction.options.getAttachment('image');

        if (!image.contentType.startsWith('image/')) {
            return interaction.reply({ content: '❌ الملف يجب أن يكون صورة!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            await BackgroundManager.setBackground(interaction.guildId, image.url, type);
            return interaction.editReply(`✅ تم تعيين خلفية **${type}** بنجاح!`);
        } catch (error) {
            console.error('SetBG error:', error);
            return interaction.editReply('❌ فشل تحميل الصورة.');
        }
    }
};
