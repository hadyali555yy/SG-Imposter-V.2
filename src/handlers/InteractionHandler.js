const { Events } = require('discord.js');

class InteractionHandler {
    constructor(client) {
        this.client = client;
        this.handlers = new Map();
        this._setupListener();
    }

    /**
     * Register a handler for a specific interaction pattern
     * @param {string} pattern - Custom ID pattern (can use startsWith)
     * @param {Function} handler - Handler function (interaction) => Promise<void>
     */
    register(pattern, handler) {
        this.handlers.set(pattern, handler);
    }

    /**
     * Setup the main interaction listener
     */
    _setupListener() {
        this.client.on(Events.InteractionCreate, async (interaction) => {
            try {
                await this.handle(interaction);
            } catch (error) {
                console.error('Interaction handler error:', error);
                await this._handleError(interaction, error);
            }
        });
    }

    /**
     * Handle an interaction
     */
    async handle(interaction) {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
            return;
        }

        const customId = interaction.customId;

        // Find matching handler
        for (const [pattern, handler] of this.handlers) {
            if (this._matches(customId, pattern)) {
                await handler(interaction);
                return;
            }
        }

        // No handler found - log it
        console.log(`No handler found for interaction: ${customId}`);
    }

    /**
     * Check if customId matches pattern
     */
    _matches(customId, pattern) {
        if (pattern.endsWith('*')) {
            // Wildcard pattern
            return customId.startsWith(pattern.slice(0, -1));
        }
        return customId === pattern;
    }

    /**
     * Handle errors gracefully
     */
    async _handleError(interaction, error) {
        const errorMessage = 'حدث خطأ غير متوقع. حاول مرة أخرى.';

        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            } else if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            }
        } catch (e) {
            console.error('Failed to send error message:', e);
        }
    }
}

module.exports = InteractionHandler;
