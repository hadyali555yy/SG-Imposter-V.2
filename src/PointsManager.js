const fs = require('fs');
const path = require('path');
const POINTS_PATH = path.join(__dirname, '../points.json');

class PointsManager {
    static getAllPoints() {
        try {
            if (fs.existsSync(POINTS_PATH)) {
                return JSON.parse(fs.readFileSync(POINTS_PATH, 'utf8'));
            }
        } catch (e) {
            console.error('Failed to load points:', e);
        }
        return {};
    }

    static getPoints(guildId) {
        const all = this.getAllPoints();
        return all[guildId] || {};
    }

    static addPoints(guildId, userId, amount) {
        const allPoints = this.getAllPoints();
        if (!allPoints[guildId]) allPoints[guildId] = {};

        allPoints[guildId][userId] = (allPoints[guildId][userId] || 0) + amount;
        this.savePoints(allPoints);
    }

    static savePoints(points) {
        try {
            fs.writeFileSync(POINTS_PATH, JSON.stringify(points, null, 2));
        } catch (e) {
            console.error('Failed to save points:', e);
        }
    }

    static resetPoints(guildId) {
        const allPoints = this.getAllPoints();
        if (guildId) {
            delete allPoints[guildId];
        } else {
            // Reset all if no guildId provided? Or safe guard?
            // For now, let's just save empty if we want to reset everything, 
            // but normally we reset per guild? 
            // The method was generic before. Let's keep it safe.
            return this.savePoints({});
        }
        this.savePoints(allPoints);
    }

    static getTopPlayers(guildId, limit = 10) {
        const points = this.getPoints(guildId);
        return Object.entries(points)
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit)
            .map(([userId, score]) => ({ userId, points: score }));
    }
}

module.exports = PointsManager;
