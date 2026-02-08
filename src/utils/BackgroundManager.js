const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

class BackgroundManager {
    constructor() {
        this.backgroundsDir = path.join(__dirname, '../../backgrounds');
        this.defaultsDir = path.join(this.backgroundsDir, 'defaults');
        this.customDir = path.join(this.backgroundsDir, 'custom');

        // Ensure directories exist
        this._ensureDirectories();
    }

    _ensureDirectories() {
        [this.backgroundsDir, this.defaultsDir, this.customDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    /**
     * Set a custom background for a guild
     * @param {string} guildId - Discord guild ID
     * @param {string} imageUrl - URL of the image
     * @param {string} type - Type: lobby, voting, results, leaderboard
     */
    async setBackground(guildId, imageUrl, type) {
        const validTypes = ['lobby', 'voting', 'results', 'leaderboard', 'turn', 'results_crew', 'results_imposter', 'default'];
        if (!validTypes.includes(type)) {
            throw new Error(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
        }

        const guildDir = path.join(this.customDir, guildId);
        if (!fs.existsSync(guildDir)) {
            fs.mkdirSync(guildDir, { recursive: true });
        }

        const filename = `${type}.png`;
        const filepath = path.join(guildDir, filename);

        // Download the image
        await this._downloadImage(imageUrl, filepath);

        return filepath;
    }

    /**
     * Set a global default background
     * @param {string} imageUrl - URL of the image
     * @param {string} type - Type: lobby, voting, results, leaderboard, turn
     */
    async setDefaultBackground(imageUrl, type) {
        const validTypes = ['lobby', 'voting', 'results', 'leaderboard', 'turn', 'results_crew', 'results_imposter', 'default'];
        if (!validTypes.includes(type)) {
            throw new Error(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
        }

        if (!fs.existsSync(this.defaultsDir)) {
            fs.mkdirSync(this.defaultsDir, { recursive: true });
        }

        const filename = `${type}.png`;
        const filepath = path.join(this.defaultsDir, filename);

        // Download the image
        await this._downloadImage(imageUrl, filepath);

        return filepath;
    }

    /**
     * Get background path for a guild and type
     * @param {string} guildId - Discord guild ID
     * @param {string} type - Type: lobby, voting, results, leaderboard
     */
    async getBackground(guildId, type) {
        // Check for custom background first
        const customPath = path.join(this.customDir, guildId, `${type}.png`);
        if (fs.existsSync(customPath)) {
            return customPath;
        }

        // Fall back to specific default type (e.g. defaults/lobby.png)
        const defaultPath = path.join(this.defaultsDir, `${type}.png`);
        if (fs.existsSync(defaultPath)) {
            return defaultPath;
        }

        // Fall back to universal default (defaults/default.png)
        const universalDefault = path.join(this.defaultsDir, 'default.png');
        if (fs.existsSync(universalDefault)) {
            return universalDefault;
        }

        // No background found
        return null;
    }

    /**
     * Download image from URL
     */
    _downloadImage(url, filepath) {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;

            const file = fs.createWriteStream(filepath);
            protocol.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download image: ${response.statusCode}`));
                    return;
                }

                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(filepath);
                });
            }).on('error', (err) => {
                fs.unlink(filepath, () => { }); // Delete partial file
                reject(err);
            });
        });
    }

    /**
     * Delete custom background
     */
    deleteBackground(guildId, type) {
        const customPath = path.join(this.customDir, guildId, `${type}.png`);
        if (fs.existsSync(customPath)) {
            fs.unlinkSync(customPath);
            return true;
        }
        return false;
    }

    /**
     * List all backgrounds for a guild
     */
    listBackgrounds(guildId) {
        const guildDir = path.join(this.customDir, guildId);
        if (!fs.existsSync(guildDir)) {
            return [];
        }

        return fs.readdirSync(guildDir)
            .filter(file => file.endsWith('.png'))
            .map(file => file.replace('.png', ''));
    }
}

module.exports = new BackgroundManager();
