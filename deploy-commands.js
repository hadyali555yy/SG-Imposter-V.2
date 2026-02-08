require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'src/interactions/slash');

if (!fs.existsSync(commandsPath)) {
    console.error('Could not find commands directory at:', commandsPath);
    process.exit(1);
}

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    } else {
        console.log(`[WARNING] The command at ${file} is missing a required "data" or "execute" property.`);
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // Ask for Client ID if not in env
        // Since we can't easily ask inputs here, assuming user will provide CLIENT_ID in .env
        // OR we can fetch it? No, need to be running.
        // Let's rely on CLIENT_ID in .env

        let clientId = process.env.CLIENT_ID;
        if (!clientId) {
            console.log('CLIENT_ID not found in .env, attempting to extract from token...');
            try {
                const token = process.env.DISCORD_TOKEN;
                const base64Id = token.split('.')[0];
                clientId = Buffer.from(base64Id, 'base64').toString();
                console.log(`Extracted Client ID: ${clientId}`);
            } catch (e) {
                throw new Error('Could not extract Client ID from token. Please add CLIENT_ID to .env manually.');
            }
        }

        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
})();
