const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const { STRINGS, EMBED_COLOR } = require('../../Constants');

const BOT_ADMINS = ['mido_tarek14', 'samasemo14'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('إعداد قنوات اللعبة')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Extra check
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || BOT_ADMINS.includes(interaction.user.username);
        if (!isAdmin) {
            return interaction.reply({ content: STRINGS.NOT_ADMIN, ephemeral: true });
        }

        const channels = interaction.guild.channels.cache
            .filter(c => c.type === ChannelType.GuildText)
            .first(25);

        const rows = [];
        let currentRow = new ActionRowBuilder();

        channels.forEach((channel, index) => {
            // Max 5 buttons per row
            if (index % 5 === 0 && index !== 0) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`setup_channel_${channel.id}`)
                    .setLabel(channel.name.substring(0, 80))
                    .setStyle(ButtonStyle.Secondary)
            );
        });
        rows.push(currentRow);

        const embed = new EmbedBuilder()
            .setTitle(STRINGS.SETUP_TITLE)
            .setDescription(STRINGS.SETUP_DESC)
            .setColor(EMBED_COLOR);

        return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }
};
