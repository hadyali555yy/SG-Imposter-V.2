const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const GameManager = require('../../GameManager');
const { STRINGS } = require('../../Constants');

const BOT_ADMINS = ['mido_tarek14', 'samasemo14'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('إيقاف اللعبة الجارية في القناة'),

    async execute(interaction) {
        const game = GameManager.getGame(interaction.channelId);
        if (!game) {
            return interaction.reply({ content: STRINGS.NO_GAME, ephemeral: true });
        }

        // Check permissions (Admin or Host or Bot Admin)
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || BOT_ADMINS.includes(interaction.user.username);

        if (!isAdmin && interaction.user.id !== game.host.id) {
            return interaction.reply({ content: STRINGS.NOT_ADMIN, ephemeral: true });
        }

        game.stop();
        return interaction.reply(STRINGS.GAME_STOPPED);
    }
};
