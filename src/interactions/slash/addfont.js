const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { GlobalFonts } = require('@napi-rs/canvas');

const BOT_ADMINS = ['mido_tarek14', 'samasemo14'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addfont')
        .setDescription('إضافة خط جديد للبوت من رابط مباشر')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('رابط ملف الخط (.ttf أو .otf)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('name')
                .setDescription('اسم الملف (مثال: myfont.ttf)')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Permission Check
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || BOT_ADMINS.includes(interaction.user.username);
        if (!isAdmin) {
            return interaction.reply({ content: '🚫 هذا الأمر مخصص للمشرفين فقط.', ephemeral: true });
        }

        const url = interaction.options.getString('url');
        const fileName = interaction.options.getString('name');

        if (!fileName.endsWith('.ttf') && !fileName.endsWith('.otf')) {
            return interaction.reply({ content: '❌ يجب أن ينتهي اسم الملف بـ .ttf أو .otf', ephemeral: true });
        }

        const fontsDir = path.join(__dirname, '../../../fonts');
        if (!fs.existsSync(fontsDir)) {
            fs.mkdirSync(fontsDir, { recursive: true });
        }

        const filePath = path.join(fontsDir, fileName);

        await interaction.deferReply({ ephemeral: true });

        const file = fs.createWriteStream(filePath);

        https.get(url, function (response) {
            if (response.statusCode !== 200) {
                return interaction.editReply('❌ فشل تحميل الملف. تأكد من الرابط.');
            }

            response.pipe(file);

            file.on('finish', () => {
                file.close(() => {
                    try {
                        // Register the new font dynamically
                        GlobalFonts.registerFromPath(filePath, 'Sans');
                        interaction.editReply(`✅ تم تحميل الخط **${fileName}** بنجاح وإضافته للنظام!`);
                    } catch (e) {
                        console.error('Font registration error:', e);
                        interaction.editReply(`⚠️ تم تحميل الخط **${fileName}** ولكن فشل تسجيله فورياً. قد تحتاج لإعادة تشغيل البوت.`);
                    }
                });
            });
        }).on('error', function (err) {
            fs.unlink(filePath, () => { }); // Delete the file async. (But we don't check result)
            console.error('Download error:', err);
            return interaction.editReply('❌ حدث خطأ أثناء التحميل.');
        });
    }
};
