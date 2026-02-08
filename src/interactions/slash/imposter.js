const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const GameManager = require('../../GameManager');
const { STRINGS, GAME_STATES, EMBED_COLOR, JOIN_TIMEOUT } = require('../../Constants');
const path = require('path');
const fs = require('fs');
const ImageGenerator = require('../../utils/ImageGenerator');

// Helpers
const CONFIG_PATH = path.join(__dirname, '../../../server_config.json');
let serverConfig = {};
try {
    if (fs.existsSync(CONFIG_PATH)) serverConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) { }

module.exports = {
    data: new SlashCommandBuilder()
        .setName('imposter')
        .setDescription('ابدأ لعبة Imposter جديدة!'),
    async execute(interaction) {
        // Check Channel
        if (serverConfig.allowedChannelId && interaction.channelId !== serverConfig.allowedChannelId) {
            return interaction.reply({ content: STRINGS.WRONG_CHANNEL.replace('{channel}', serverConfig.allowedChannelId), flags: 64 });
        }

        if (GameManager.hasGame(interaction.channelId)) {
            return interaction.reply({ content: STRINGS.ALREADY_GAME, flags: 64 });
        }

        const game = GameManager.createGame(interaction.channel, interaction.user);
        game.onEnd = () => GameManager.endGame(interaction.channelId);

        // Defer Reply because image generation might be slow
        await interaction.deferReply();


        const imageBuffer = await ImageGenerator.generateLobbyCard(Array.from(game.players.values()), interaction.guildId);
        const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'lobby.png' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('join_game')
                    .setLabel(STRINGS.JOIN_BTN)
                    .setStyle(ButtonStyle.Secondary)
            );

        // Send public message (Image Only)
        // fetchReply is not needed for editReply as it returns the message
        const msg = await interaction.editReply({
            content: `**🎮 لعبة Imposter**\nاللاعبين: 0/20`,
            files: [attachment],
            components: [row]
        });
        game.lobbyMessage = msg;

        // Start Join Timer
        setTimeout(async () => {
            if (game.state === GAME_STATES.LOBBY) {
                await game.startGame();
                if (game.state === GAME_STATES.ENDED) {
                    GameManager.endGame(interaction.channelId);
                }
            }
        }, JOIN_TIMEOUT);
    }
};
