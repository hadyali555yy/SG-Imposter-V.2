const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const PointsManager = require('../../PointsManager');
const ImageGenerator = require('../../utils/ImageGenerator');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('points')
        .setDescription('عرض لوحة المتصدرين (Leaderboard)'),
    async execute(interaction) {
        await interaction.deferReply();

        const points = PointsManager.getPoints(interaction.guildId);
        const sorted = Object.entries(points).sort(([, a], [, b]) => b - a);

        if (sorted.length === 0) {
            return interaction.editReply('لا يوجد نقاط مسجلة في هذا السيرفر بعد.');
        }

        try {
            const topUserIds = sorted.slice(0, 10);
            const topPlayers = [];

            for (const [userId, pts] of topUserIds) {
                let name = 'Unknown';
                try {
                    const user = await interaction.client.users.fetch(userId);
                    name = user.username;
                } catch (err) {
                    name = `User ${userId}`;
                }
                topPlayers.push({ name, points: pts });
            }

            const imageBuffer = await ImageGenerator.generateLeaderboard(topPlayers, interaction.guildId);

            return interaction.editReply({
                files: [{ attachment: imageBuffer, name: 'leaderboard.png' }]
            });
        } catch (error) {
            console.error('Leaderboard error:', error);
            return interaction.editReply('حدث خطأ أثناء إنشاء الصورة.');
        }
    }
};
