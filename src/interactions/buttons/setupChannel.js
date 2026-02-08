const { STRINGS } = require('../../Constants');

module.exports = async function handleSetupChannel(interaction, serverConfig, saveConfig, isAdmin) {
    if (!isAdmin(interaction.member, interaction.user)) {
        return interaction.reply({ content: STRINGS.NOT_ADMIN, ephemeral: true });
    }

    const channelId = interaction.customId.replace('setup_channel_', '');
    serverConfig.allowedChannelId = channelId;
    saveConfig();

    await interaction.update({
        content: STRINGS.SETUP_COMPLETE.replace('{channel}', channelId),
        embeds: [],
        components: []
    });
};
