const fs = require('fs');
const path = require('path');
const { Events } = require('discord.js');

class SlashHandler {
    constructor(client) {
        this.client = client;
        this.commands = new Map();
        this._loadCommands();
        this._setupListener();
    }

    _loadCommands() {
        const commandsPath = path.join(__dirname, '../interactions/slash');
        if (!fs.existsSync(commandsPath)) return;

        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                this.commands.set(command.data.name, command);
                console.log(`[SlashHandler] Loaded command: ${command.data.name}`);
            } else {
                console.log(`[SlashHandler] Warning: The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }
    }

    _setupListener() {
        this.client.on(Events.InteractionCreate, async interaction => {
            if (!interaction.isChatInputCommand()) return;

            const command = this.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
                }
            }
        });
    }
}

module.exports = SlashHandler;
