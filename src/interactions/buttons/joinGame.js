const GameManager = require('../../GameManager');
const { STRINGS, GAME_STATES } = require('../../Constants');
const { EmbedBuilder } = require('discord.js');

module.exports = async function handleJoinGame(interaction) {
    const game = GameManager.getGame(interaction.channelId);

    if (!game) {
        try {
            return await interaction.reply({ content: STRINGS.NO_GAME, ephemeral: true });
        } catch (e) {
            console.log('Failed to reply to old interaction:', e.message);
            return;
        }
    }

    if (game.state !== GAME_STATES.LOBBY) {
        return await interaction.reply({ content: 'اللعبة بدأت بالفعل!', ephemeral: true });
    }

    // Defer the reply to prevent timeout during image generation
    await interaction.deferReply({ flags: 64 });

    // Add player to game using the internal method to ensure Player object is created with interaction
    const success = game.addPlayer(interaction);
    if (!success) {
        return interaction.editReply({ content: 'تعذر الانضمام. ربما اللعبة ممتلئة أو أنت منضم بالفعل.' });
    }

    try {
        // Update lobby image
        const imageBuffer = await require('../../utils/ImageGenerator').generateLobbyCard(Array.from(game.players.values()), interaction.guildId);
        const { AttachmentBuilder } = require('discord.js');
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'lobby.png' });

        if (game.lobbyMessage) {
            await game.lobbyMessage.edit({
                content: `**🎮 لعبة Imposter**\nاللاعبين: ${game.playerCount}/20`,
                files: [attachment]
            });
        }
    } catch (error) {
        console.error('Error updating lobby image:', error);
    }

    await interaction.editReply({ content: 'تم انضمامك للعبة بنجاح!' });

    // Check if game should start
    if (game.playerCount >= 20) { // Auto start if full
        // Logic to start game if needed, or just let owner start
    }
};
