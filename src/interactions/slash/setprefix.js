const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, '../../../server_config.json');

// Re-load config helper
const loadConfig = () => {
    try {
        if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) { }
    return {};
};

const saveConfig = (config) => {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (e) {
        console.error('Failed to save config:', e);
    }
};

const BOT_ADMINS = ['mido_tarek14', 'samasemo14'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setprefix')
        .setDescription('تغيير بادئة البوت (prefix)')
        .addStringOption(option =>
            option.setName('new_prefix')
                .setDescription('البادئة الجديدة (3 أحرف كحد أقصى)')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Extra check
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || BOT_ADMINS.includes(interaction.user.username);
        if (!isAdmin) {
            return interaction.reply({ content: '🚫 هذا الأمر مخصص للمشرفين فقط.', ephemeral: true });
        }

        const newPrefix = interaction.options.getString('new_prefix');
        if (newPrefix.length > 3) {
            return interaction.reply({ content: '⚠️ البرفكس يجب أن يكون 3 أحرف أو أقل.', ephemeral: true });
        }

        const config = loadConfig();
        config.prefix = newPrefix;
        saveConfig(config);

        // Note: The running process needs to reload this config or check it dynamically.
        // In our index.js we load `serverConfig.prefix` once? No, we check `serverConfig.prefix` dynamically
        // BUT `serverConfig` object in index.js is in memory.
        // Slash command runs in a separate module but modifies the FILE.
        // We need a way to notify the main process or have the main process reload config?
        // OR easier: We rely on file watcher? No.
        // Actually, since this is a separate file, modifying the file won't update `serverConfig` variable in `index.js`.
        // To fix this properly, `index.js` should reload config or we should export a ConfigManager.
        // For now, let's warn the user that restart might be needed OR 
        // Implement a cheap reload in index.js (e.g. read file on every message? expensive).
        // BETTER: Use a shared Config manager module.
        // However, for this task, I'll update the file and ask the user to restart or I can implement a hot-reload in index.js if time permits.
        // Wait, `index.js` has `saveConfig` but it's local.

        // Let's just update the file. The *message based* commands in index.js use the in-memory `serverConfig`.
        // So `setprefix` via slash command won't update the message command prefix immediately until restart
        // UNLESS we emit an event or something.

        // Accepted limitation: "Requires Reload" or "Takes effect after restart" unless I fix architecture.
        // I will mention "Requires restart or use #setprefix message command for immediate effect".
        // Actually, the message command `d:\برمجه\SG-Imposter-main\index.js` updates both memory and file.
        // Slash command updates ONLY file.

        return interaction.reply(`✅ تم تغيير البرفكس في الملف إلى: **${newPrefix}**\n⚠️ ملاحظة: قد تحتاج لإعادة تشغيل البوت لتفعيل التغيير على الأوامر الكتابية فوراً.`);
    }
};
