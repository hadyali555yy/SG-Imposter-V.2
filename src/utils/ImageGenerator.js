const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const BackgroundManager = require('./BackgroundManager');
const fs = require('fs');

class ImageGenerator {
    constructor() {
        this.customFonts = [];

        // Register Arabic font if available
        try {
            // Custom Fonts from 'fonts' directory
            const fontsDir = path.join(__dirname, '../../fonts');
            if (fs.existsSync(fontsDir)) {
                const fontFiles = fs.readdirSync(fontsDir).filter(file => file.endsWith('.ttf') || file.endsWith('.otf'));

                fontFiles.forEach(file => {
                    const fontPath = path.join(fontsDir, file);
                    const familyName = file.replace(/\.(ttf|otf)$/i, '');

                    // Register with its specific name
                    GlobalFonts.registerFromPath(fontPath, familyName);
                    this.customFonts.push(familyName); // Add to list

                    // Also register as 'Sans' (but log it)
                    // Note: Last registered 'Sans' might take precedence or they stack. 
                    // To ensure custom fonts are used, we should probably use a specific family string in our draw calls.
                    GlobalFonts.registerFromPath(fontPath, 'Sans');
                    console.log(`Registered custom font: ${familyName}`);
                });
            }

            // Register system fonts (as fallback or secondary)
            const fonts = [
                { path: 'C:\\Windows\\Fonts\\tahoma.ttf', family: 'Sans' },
                { path: 'C:\\Windows\\Fonts\\seguisym.ttf', family: 'Sans' },
                { path: 'C:\\Windows\\Fonts\\seguiemj.ttf', family: 'Sans' },
                { path: 'C:\\Windows\\Fonts\\segoeui.ttf', family: 'Sans' },
                { path: 'C:\\Windows\\Fonts\\arial.ttf', family: 'Sans' }
            ];

            fonts.forEach(font => {
                if (fs.existsSync(font.path)) {
                    GlobalFonts.registerFromPath(font.path, font.family);
                }
            });

            console.log('Registered system and custom fonts');
        } catch (e) {
            console.log('Could not load custom fonts', e);
        }
    }

    /**
     * Clean name from decorations
     */
    cleanName(name) {
        // Remove common diacritics (tashkeel)
        let cleaned = name.replace(/[\u0617-\u061A\u064B-\u0652]/g, "");

        // Remove symbols/decorations (keep Arabic, English, Numbers, Spaces, standard punctuation)
        // This is a broad regex, might need tuning. 
        // Allowing: Arabic letters, English letters, Numbers, Spaces, - _ . ! ?
        // Using a negative lookahead to strip everything else might be safer?
        // Let's try to just keep what we want.
        // \p{L} matches any unicode letter (including Arabic), \p{N} numbers.
        // NOTE: Canvas might not support regex unicode property escapes well depending on node version? 
        // Node 20 should support it.
        try {
            cleaned = cleaned.replace(/[^\p{L}\p{N}\s\-_.!?]/gu, "");
        } catch (e) {
            // Fallback if unicode property escape fails
            cleaned = cleaned.replace(/[^a-zA-Z0-9\u0600-\u06FF\s\-_.!?]/g, "");
        }

        return cleaned.trim() || name; // Return original if cleaned is empty
    }

    /**
     * Helper to select font based on language
     */
    _getFont(text, size, weight = 'bold') {
        const cleanedText = this.cleanName(text);

        // Build font string with all custom fonts + fallbacks
        // We quote family names to handle spaces
        const customFontString = this.customFonts.length > 0
            ? '"' + this.customFonts.join('", "') + '", '
            : '';

        // Arabic Regex
        const isArabic = /[\u0600-\u06FF]/.test(cleanedText);
        if (isArabic) {
            return `${weight} ${size}px ${customFontString}"Tajawal", "Changa", "Sans"`; // Custom first, then defaults
        }
        return `${weight} ${size}px ${customFontString}"Roboto", "Arial", "Sans"`; // Custom first, then defaults
    }

    /**
     * Generate lobby card showing players waiting
     */
    async generateLobbyCard(players, guildId) {
        const width = 1200;
        const height = 800;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Load background
        const bgPath = await BackgroundManager.getBackground(guildId, 'lobby');
        if (bgPath) {
            try {
                const bg = await loadImage(bgPath);
                ctx.drawImage(bg, 0, 0, width, height);
            } catch (e) {
                this._drawDefaultBackground(ctx, width, height, '#2C3E50');
            }
        } else {
            this._drawDefaultBackground(ctx, width, height, '#2C3E50');
        }

        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, width, height);

        // Title
        ctx.fillStyle = '#FFFFFF';
        ctx.font = this._getFont('🎮 لعبة Imposter', 60);
        ctx.textAlign = 'center';
        ctx.fillText('🎮 لعبة Imposter', width / 2, 80);

        // Subtitle
        const subText = `اللاعبين: ${players.length}/20`;
        ctx.font = this._getFont(subText, 30, 'normal');
        ctx.fillStyle = '#ECF0F1';
        ctx.fillText(subText, width / 2, 130);

        // Grid Layout Calculation
        const maxCols = 5;
        const avatarSize = 120; // Diameter
        const avatarRadius = avatarSize / 2;
        const slotWidth = 220; // Width reserved for each player
        const slotHeight = 200; // Height reserved (Avatar + Name)
        
        // Calculate start Y to center the grid vertically (optional, or fixed below title)
        const startY = 200; 

        // Pre-load avatars
        const avatarPromises = players.map(p => loadImage(p.avatar).catch(() => null));
        const avatars = await Promise.all(avatarPromises);

        players.forEach((player, index) => {
            const row = Math.floor(index / maxCols);
            const col = index % maxCols;

            // Calculate centered X for this row
            // Determine how many items are in this specific row
            // If it's the last row, it might have fewer items
            const totalRows = Math.ceil(players.length / maxCols);
            const isLastRow = row === totalRows - 1;
            const itemsInThisRow = isLastRow ? (players.length % maxCols || maxCols) : maxCols;

            const rowWidth = itemsInThisRow * slotWidth;
            const startX = (width - rowWidth) / 2;

            const x = startX + (col * slotWidth) + (slotWidth / 2); // Center of the slot
            const y = startY + (row * slotHeight);

            // 1. Avatar
            const avatar = avatars[index];
            const avatarY = y + avatarRadius; // Center Y of avatar

            if (avatar) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(x, avatarY, avatarRadius, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatar, x - avatarRadius, avatarY - avatarRadius, avatarSize, avatarSize);
                // Border
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 4;
                ctx.stroke();
                ctx.restore();
            } else {
                // Placeholder
                ctx.fillStyle = '#7F8C8D';
                ctx.beginPath();
                ctx.arc(x, avatarY, avatarRadius, 0, Math.PI * 2);
                ctx.fill();
            }

            // 2. Name (Below Avatar)
            ctx.textAlign = 'center';
            ctx.fillStyle = '#FFFFFF';
            const nameToUse = player.displayName || player.username;
            
            // Adjust font size to fit
            const nameY = avatarY + avatarRadius + 30;
            const font = this._getFont(nameToUse, 24);
            ctx.font = font;
            
            // Text truncation calculation
            let displayText = nameToUse;
            const maxWidth = slotWidth - 10;
            if (ctx.measureText(displayText).width > maxWidth) {
                 while (ctx.measureText(displayText + '...').width > maxWidth && displayText.length > 0) {
                     displayText = displayText.slice(0, -1);
                 }
                 displayText += '...';
            }

            ctx.fillText(displayText, x, nameY);
        });

        // Footer
        ctx.textAlign = 'center';
        const footerText = 'انتظار بدء اللعبة...';
        ctx.font = this._getFont(footerText, 24, 'italic');
        ctx.fillStyle = '#95A5A6';
        ctx.fillText(footerText, width / 2, height - 40);

        return canvas.toBuffer('image/png');
    }

    /**
     * Generate voting card with current votes
     */
    /**
     * Generate voting card with current votes (Bar Chart Style)
     */
    async generateVotingCard(players, votes, guildId) {
        const width = 1000;
        // Dynamic height based on player count
        const rowHeight = 80;
        const headerHeight = 150;
        const height = headerHeight + (players.length * rowHeight) + 50;

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Load background (default.png as requested)
        // We try to get 'default' from manager, or fallback
        const bgPath = await BackgroundManager.getBackground(guildId, 'default');
        if (bgPath) {
            try {
                const bg = await loadImage(bgPath);
                // Draw background covering the canvas (might stretch if aspect ratio differs)
                // Better to draw it to cover
                this._drawImageCover(ctx, bg, width, height);
            } catch (e) {
                this._drawDefaultBackground(ctx, width, height, '#2C3E50');
            }
        } else {
            this._drawDefaultBackground(ctx, width, height, '#2C3E50');
        }

        // Overlay for readability
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        // Title
        ctx.fillStyle = '#FFFFFF';
        ctx.font = this._getFont('📊 التصويت', 60);
        ctx.textAlign = 'center';
        ctx.fillText('📊 التصويت', width / 2, 80);

        ctx.font = this._getFont('صوت الان!', 30, 'normal');
        ctx.fillStyle = '#BDC3C7';
        ctx.fillText('صوت الان!', width / 2, 130);

        // Voting Bars
        const startY = headerHeight;
        const barX = 300; // Start of bar after name
        const barMaxWidth = 600;
        const maxVotes = Math.max(...Object.values(votes), 1); // Avoid div by 0

        players.forEach((player, index) => {
            const y = startY + (index * rowHeight);
            const centerY = y + (rowHeight / 2);

            // 1. Avatar (Small)
            // We can draw avatar on the left
            // pending... let's stick to Name -> Bar -> Count for now as per screenshot

            // 2. Name
            ctx.textAlign = 'right';
            ctx.fillStyle = '#FFFFFF';
            const name = this.cleanName(player.displayName || player.username);
            ctx.font = this._getFont(name, 28);
            ctx.fillText(name.substring(0, 20), barX - 20, centerY + 10);

            // 3. Bar Background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(barX, y + 15, barMaxWidth, rowHeight - 30);

            // 4. Vote Bar
            const playerVotes = votes[player.id] || 0;
            const fillWidth = (playerVotes / maxVotes) * barMaxWidth;

            if (playerVotes > 0) {
                ctx.fillStyle = '#E74C3C'; // Red color like screenshot
                ctx.fillRect(barX, y + 15, fillWidth, rowHeight - 30);
            }

            // 5. Vote Count
            ctx.textAlign = 'left';
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 30px Sans';
            ctx.fillText(playerVotes.toString(), barX + barMaxWidth + 20, centerY + 10);
        });

        return canvas.toBuffer('image/png');
    }

    /**
     * Helper to draw image covering canvas
     */
    _drawImageCover(ctx, img, width, height) {
        const imgRatio = img.width / img.height;
        const canvasRatio = width / height;
        let drawWidth, drawHeight, offsetX, offsetY;

        if (imgRatio > canvasRatio) {
            drawHeight = height;
            drawWidth = height * imgRatio;
            offsetX = (width - drawWidth) / 2;
            offsetY = 0;
        } else {
            drawWidth = width;
            drawHeight = width / imgRatio;
            offsetX = 0;
            offsetY = (height - drawHeight) / 2;
        }
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    }

    /**
     * Generate game results card
     */
    async generateResultCard(winner, imposters, secretWord, guildId) {
        const width = 1200;
        const height = 600;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Determine Background & Color
        let bgType = 'results_crew';
        let defaultColor = '#2ECC71';

        if (winner === 'IMPOSTER') {
            bgType = 'results_imposter';
            defaultColor = '#E74C3C';
        }

        const bgPath = await BackgroundManager.getBackground(guildId, bgType);
        if (bgPath) {
            try {
                const bg = await loadImage(bgPath);
                ctx.drawImage(bg, 0, 0, width, height);
            } catch (e) {
                this._drawDefaultBackground(ctx, width, height, defaultColor);
            }
        } else {
            this._drawDefaultBackground(ctx, width, height, defaultColor);
        }

        // Overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, width, height);

        // Winner Text
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        const winnerText = winner === 'CREW' ? '🏆 فاز الطاقم!' : '🔪 فاز المحتالون!';
        ctx.font = this._getFont(winnerText, 70);
        ctx.fillText(winnerText, width / 2, 150);

        // Secret word
        const secretText = `الكلمة السرية: ${secretWord}`;
        ctx.font = this._getFont(secretText, 50);
        ctx.fillStyle = '#F1C40F';
        ctx.fillText(secretText, width / 2, 280);

        // Imposters list
        const imposterLabel = 'المحتالون كانوا:';
        ctx.font = this._getFont(imposterLabel, 40);
        ctx.fillStyle = '#E74C3C';
        ctx.fillText(imposterLabel, width / 2, 380);

        // Draw Imposter Avatars & Names
        // We'll center them in a row
        const iconSize = 60;
        const gap = 20; // Gap between avatar and name
        const itemGap = 60; // Gap between different imposters
        
        // Calculate total width first to center
        let totalWidth = 0;
        const imposterData = []; // Store pre-calculated data

        // Load avatars first
        const avatarPromises = imposters.map(imp => 
            loadImage(imp.avatar || imp.user?.displayAvatarURL({ extension: 'png', forceStatic: true })).catch(() => null)
        );
        const images = await Promise.all(avatarPromises);

        imposters.forEach((imp, i) => {
            const name = imp.displayName || imp.username;
            ctx.font = this._getFont(name, 35, 'normal');
            const nameWidth = ctx.measureText(name).width;
            
            // Item width = Avatar + Gap + Name
            const itemWidth = iconSize + gap + nameWidth;
            
            imposterData.push({
                name,
                nameWidth,
                avatar: images[i],
                itemWidth
            });

            totalWidth += itemWidth;
        });

        // Add gaps between items
        if (imposters.length > 1) {
            totalWidth += (imposters.length - 1) * itemGap;
        }

        let startX = (width - totalWidth) / 2;
        const y = 450;
        const centerY = y - (iconSize / 2) + 10; // Adjust for baseline roughly

        imposterData.forEach((item, index) => {
            // Draw Avatar
            if (item.avatar) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(startX + (iconSize / 2), centerY, (iconSize / 2), 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(item.avatar, startX, centerY - (iconSize / 2), iconSize, iconSize);
                ctx.strokeStyle = '#E74C3C';
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.restore();
            } else {
                 // Placeholder
                ctx.fillStyle = '#E74C3C';
                ctx.beginPath();
                ctx.arc(startX + (iconSize / 2), centerY, (iconSize / 2), 0, Math.PI * 2);
                ctx.fill();
            }

            // Draw Name
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'left'; 
            ctx.font = this._getFont(item.name, 35, 'normal');
            ctx.fillText(item.name, startX + iconSize + gap, y);

            // Move X
            startX += item.itemWidth + itemGap;
        });

        // Footer
        const footerText = 'شكراً للعب!';
        ctx.font = this._getFont(footerText, 30, 'italic');
        ctx.fillStyle = '#95A5A6';
        ctx.fillText(footerText, width / 2, height - 80);

        return canvas.toBuffer('image/png');
    }

    /**
     * Generate leaderboard image
     */
    async generateLeaderboard(topPlayers, guildId) {
        const width = 1000;
        const height = 700;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Load background
        const bgPath = await BackgroundManager.getBackground(guildId, 'leaderboard');
        if (bgPath) {
            try {
                const bg = await loadImage(bgPath);
                ctx.drawImage(bg, 0, 0, width, height);
            } catch (e) {
                this._drawDefaultBackground(ctx, width, height, '#F39C12');
            }
        } else {
            this._drawDefaultBackground(ctx, width, height, '#F39C12');
        }

        // Overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, width, height);

        // Title
        ctx.fillStyle = '#F1C40F';
        ctx.font = this._getFont('🏆 لوحة المتصدرين', 70);
        ctx.textAlign = 'center';
        ctx.fillText('🏆 لوحة المتصدرين', width / 2, 100);

        // Leaderboard entries
        const startY = 200;
        const lineHeight = 70; // 500 / 10 = 50 but we have 1000h? No height 700. 10 users * 50 = 500.

        // Let's list top 5 or top 8 depending on space
        // With 700 header 100, start 200. Space left 500. 7 players?

        topPlayers.forEach((player, index) => {
            const y = startY + (index * lineHeight);

            ctx.font = 'bold 35px Sans';
            ctx.textAlign = 'right';

            // Rank
            ctx.fillStyle = '#E67E22';
            ctx.fillText(`#${index + 1}`, width - 100, y);

            // Name
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'right';
            // Use Username for Leaderboard (passed from points.js as 'name')
            const font = this._getFont(player.name, 35, 'normal');
            ctx.font = font;
            ctx.fillText(player.name, width - 200, y);

            // Points
            ctx.textAlign = 'left';
            ctx.fillStyle = '#2ECC71';
            ctx.font = 'bold 35px Sans';
            ctx.fillText(`${player.points} pts`, 100, y);
        });


        return canvas.toBuffer('image/png');
    }

    /**
     * Generate turn card (Asker vs Answerer)
     */
    async generateTurnCard(asker, answerer, guildId) {
        const width = 1000;
        const height = 500;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Load background
        const bgPath = await BackgroundManager.getBackground(guildId, 'turn'); // You might need to add 'turn' type to setbg later
        if (bgPath) {
            try {
                const bg = await loadImage(bgPath);
                ctx.drawImage(bg, 0, 0, width, height);
            } catch (e) {
                this._drawDefaultBackground(ctx, width, height, '#34495E');
            }
        } else {
            this._drawDefaultBackground(ctx, width, height, '#34495E');
        }

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, width, height);

        // Title
        ctx.fillStyle = '#F1C40F';
        ctx.font = this._getFont('🤔 وقت الأسئلة', 50);
        ctx.textAlign = 'center';
        ctx.fillText('🤔 وقت الأسئلة', width / 2, 80);

        // Asker (Left)
        const askerX = 250;
        const centerY = 250;

        // Avatar Circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(askerX, centerY, 80, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        try {
            const avatar = await loadImage(asker.avatar);
            ctx.drawImage(avatar, askerX - 80, centerY - 80, 160, 160);
        } catch (e) {
            ctx.fillStyle = '#95A5A6';
            ctx.fillRect(askerX - 80, centerY - 80, 160, 160);
        }
        ctx.restore();

        // Label
        ctx.fillStyle = '#3498DB';
        ctx.font = this._getFont('يسأل', 40);
        ctx.fillText('يسأل', askerX, centerY - 100);

        // Name
        ctx.fillStyle = '#FFFFFF';
        const askerName = asker.displayName || asker.username;
        ctx.font = this._getFont(askerName, 30);
        ctx.fillText(askerName, askerX, centerY + 120);


        // VS Icon
        ctx.fillStyle = '#E74C3C';
        ctx.font = 'bold 60px Sans';
        ctx.fillText('VS', width / 2, centerY + 20);


        // Answerer (Right)
        const answererX = 750;

        // Avatar Circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(answererX, centerY, 80, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        try {
            const avatar = await loadImage(answerer.avatar);
            ctx.drawImage(avatar, answererX - 80, centerY - 80, 160, 160);
        } catch (e) {
            ctx.fillStyle = '#95A5A6';
            ctx.fillRect(answererX - 80, centerY - 80, 160, 160);
        }
        ctx.restore();

        // Label
        ctx.fillStyle = '#2ECC71';
        ctx.font = this._getFont('يجيب', 40);
        ctx.fillText('يجيب', answererX, centerY - 100);

        // Name
        ctx.fillStyle = '#FFFFFF';
        const answererName = answerer.displayName || answerer.username;
        ctx.font = this._getFont(answererName, 30);
        ctx.fillText(answererName, answererX, centerY + 120);

        return canvas.toBuffer('image/png');
    }

    /**
     * Draw a default gradient background
     */
    _drawDefaultBackground(ctx, width, height, baseColor) {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, baseColor);
        gradient.addColorStop(1, '#000000');
    }
    async generateKickCard(player, role, guildId) {
        const width = 800;
        const height = 400;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Background
        const bgPath = await BackgroundManager.getBackground(guildId, 'turn'); // Reusing turn or can be default
        if (bgPath) {
            try {
                const bg = await loadImage(bgPath);
                ctx.drawImage(bg, 0, 0, width, height);
            } catch (e) {
                this._drawDefaultBackground(ctx, width, height, '#C0392B');
            }
        } else {
            this._drawDefaultBackground(ctx, width, height, '#C0392B');
        }

        // Overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        // Avatar
        const avatarUrl = player.avatar || player.user?.displayAvatarURL({ extension: 'png', forceStatic: true });
        if (avatarUrl) {
            try {
                const avatar = await loadImage(avatarUrl);
                ctx.save();
                ctx.beginPath();
                ctx.arc(400, 150, 60, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatar, 340, 90, 120, 120);
                ctx.strokeStyle = '#E74C3C';
                ctx.lineWidth = 5;
                ctx.stroke();
                ctx.restore();
            } catch (e) {
                ctx.fillStyle = '#E74C3C';
                ctx.beginPath();
                ctx.arc(400, 150, 60, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Text
        ctx.textAlign = 'center';

        // "Kicked"
        ctx.fillStyle = '#E74C3C';
        ctx.font = this._getFont('🚫 تم الطرد', 50);
        ctx.fillText('🚫 تم الطرد', 400, 260);

        // Name
        const cleanName = this.cleanName(player.displayName || player.username);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = this._getFont(cleanName, 40);
        ctx.fillText(cleanName, 400, 310);

        // Role
        ctx.fillStyle = '#F1C40F';
        ctx.font = this._getFont(`الدور: ${role}`, 30);
        ctx.fillText(`الدور: ${role}`, 400, 360);

        return canvas.toBuffer('image/png');
    }
}

module.exports = new ImageGenerator();
