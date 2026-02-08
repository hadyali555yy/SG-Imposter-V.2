const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, AttachmentBuilder } = require('discord.js');
const { STATE, STRINGS, ROUND_DURATION, VOTE_TIMEOUT, GAME_STATES, MIN_PLAYERS, MAX_PLAYERS } = require('./Constants');
const Words = require('./Words');
const Player = require('./Player');
const PointsManager = require('./PointsManager');
const ImageGenerator = require('./utils/ImageGenerator');

class Game {
    constructor(channel, host) {
        this.channel = channel;
        this.host = host; // Maybe useful later
        this.players = new Map(); // Map<UserId, Player>
        this.state = GAME_STATES.LOBBY;
        this.roundCount = 0;
        this.secretWord = null;
        this.imposters = [];
        this.messageCollector = null;
        this.voteCollector = null;
        this.lobbyMessage = null;
        this.currentTimer = null;
        this.roundResolve = null;
        this.onEnd = null; // Callback for cleanup
        this.guildId = channel.guild.id; // For Canvas backgrounds
    }

    addPlayer(interaction) {
        const user = interaction.user;
        if (this.players.has(user.id)) return false;
        if (this.players.size >= MAX_PLAYERS) return false;
        this.players.set(user.id, new Player(user, interaction));
        return true;
    }

    get playerCount() {
        return this.players.size;
    }

    get playerNamesList() {
        return Array.from(this.players.values()).map(p => p.displayName).join('\n') || 'لا يوجد لاعبين بعد';
    }

    async updateLobby() {
        if (!this.lobbyMessage) return;

        try {
            const imageBuffer = await ImageGenerator.generateLobbyCard(Array.from(this.players.values()), this.guildId);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'lobby.png' });

            // Send only image and components (no embed)
            // We need to keep the components!
            const components = this.lobbyMessage.components;

            await this.lobbyMessage.edit({
                content: `**🎮 لعبة Imposter**\nاللاعبين: ${this.playerCount}/${MAX_PLAYERS}`,
                embeds: [],
                files: [attachment],
                components: components
            });

        } catch (e) {
            console.error('Failed to update lobby image:', e);
            // Fallback
            await this.lobbyMessage.edit({
                content: `**🎮 لعبة Imposter**\nاللاعبين: ${this.playerCount}/${MAX_PLAYERS}\n\n${this.playerNamesList}`,
                embeds: []
            });
        }
    }

    async startGame() {
        if (this.playerCount < MIN_PLAYERS) {
            this.state = GAME_STATES.ENDED;
            await this.channel.send(STRINGS.GAME_CANCELLED);
            if (this.onEnd) this.onEnd();
            return;
        }


        this.state = GAME_STATES.PLAYING;

        // Disable Lobby Buttons
        if (this.lobbyMessage) {
            try {
                const disabledRow = new ActionRowBuilder();
                const components = this.lobbyMessage.components[0]?.components || [];
                components.forEach(comp => {
                    const btn = ButtonBuilder.from(comp);
                    btn.setDisabled(true);
                    btn.setLabel('اللعبة بدأت');
                    disabledRow.addComponents(btn);
                });

                // Update to Game Started state (text + components)
                await this.lobbyMessage.edit({
                    content: `**🎮 لعبة Imposter** (بدأت)\nاللاعبين: ${this.playerCount}/${MAX_PLAYERS}`,
                    components: [disabledRow],
                    embeds: [] // Ensure no embed
                });
            } catch (e) {
                console.error('Failed to disable lobby buttons:', e);
            }
        }

        this.assignRoles();
        this.secretWord = Words.getRandomWord();

        // Notify Channel First (Publicly)
        const startEmbed = new EmbedBuilder()
            .setTitle('🚀 بدأت اللعبة!')
            .setDescription(`${STRINGS.IMPOSTER_COUNT_MSG.replace('{count}', this.imposters.length)}\n\n(راجعوا الرسائل المخفية لمعرفة أدواركم والكلمة السرية!)`)
            .setColor('#2ECC71'); // Green for start

        await this.channel.send({ embeds: [startEmbed] });

        // Notify Players via Ephemeral FollowUp
        const notifyPromises = [];
        this.players.forEach(player => {
            const msg = player.isImposter
                ? STRINGS.IMPOSTER_DM
                : STRINGS.CREW_DM.replace('{word}', this.secretWord);

            // Use followUp with ephemeral: true
            // Try to use followUp, fallback to DM
            notifyPromises.push(
                (async () => {
                    try {
                        if (player.interaction) {
                            await player.interaction.followUp({ content: msg, ephemeral: true });
                        } else {
                            throw new Error('No interaction');
                        }
                    } catch (e) {
                        // Fallback to DM
                        try {
                            await player.user.send(msg);
                        } catch (dmError) {
                            console.log(`Failed to send role to ${player.username} (DM closed):`, dmError.message);
                        }
                    }
                })()
            );
        });
        await Promise.all(notifyPromises);

        this.startRounds();
    }

    assignRoles() {
        const playerIds = Array.from(this.players.keys());
        const count = this.playerCount;
        let imposterCount = 1;

        // New balanced imposter rules
        if (count >= 5 && count <= 6) imposterCount = 1;
        else if (count >= 7 && count <= 9) imposterCount = 2;
        else if (count >= 10 && count <= 12) imposterCount = 3;
        else if (count >= 13 && count <= 15) imposterCount = 4;
        else if (count >= 16) imposterCount = 5;

        // Shuffle and pick
        for (let i = playerIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
        }

        console.log(`[Game] Players: ${count}, Imposter Count: ${imposterCount}`);

        for (let i = 0; i < imposterCount; i++) {
            const player = this.players.get(playerIds[i]);
            player.isImposter = true;
            this.imposters.push(player);
            console.log(`[Game] Assigned Imposter: ${player.displayName} (${player.id})`);
        }
        console.log(`[Game] Total Imposters: ${this.imposters.length}`);
    }

    async startRounds() {
        for (let i = 1; i <= 3; i++) {
            this.roundCount = i;
            await this.channel.send(STRINGS.ROUND_START.replace('{round}', i));
            await this.playRound();
            if (this.state === GAME_STATES.ENDED) return; // Stop if game ended externally
        }

        const wantExtra = await this.askForExtraRound();
        if (this.state === GAME_STATES.ENDED) return;

        if (wantExtra) {
            this.roundCount = 4;
            await this.channel.send(STRINGS.ROUND_START.replace('{round}', 4));
            await this.playRound();
            if (this.state === GAME_STATES.ENDED) return;
        }

        this.startVoting();
    }

    async askForExtraRound() {
        return new Promise(async (resolve) => {
            const embed = new EmbedBuilder()
                .setTitle('🤔 قرار جماعي')
                .setDescription(STRINGS.EXTRA_ROUND_PROMPT)
                .setColor('#E67E22');

            let extraCount = 0;
            let voteNowCount = 0;
            const voters = new Set();

            const getComponents = () => {
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('extra_round_yes')
                            .setLabel(`${STRINGS.BTN_EXTRA_ROUND} (${extraCount})`)
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('extra_round_no')
                            .setLabel(`${STRINGS.BTN_VOTE_NOW} (${voteNowCount})`)
                            .setStyle(ButtonStyle.Danger)
                    );
                return [row];
            };

            const msg = await this.channel.send({ embeds: [embed], components: getComponents() });

            const collector = msg.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 20000
            });

            collector.on('collect', async i => {
                try {
                    if (!this.players.has(i.user.id)) {
                        return i.reply({ content: 'أنت لست مشاركاً في اللعبة!', ephemeral: true });
                    }

                    if (voters.has(i.user.id)) {
                        return i.reply({ content: 'لقد قمت بالتصويت مسبقاً!', ephemeral: true });
                    }

                    await i.deferUpdate(); // Prevent timeout

                    voters.add(i.user.id);
                    if (i.customId === 'extra_round_yes') extraCount++;
                    else if (i.customId === 'extra_round_no') voteNowCount++;

                    await i.editReply({ components: getComponents() });
                } catch (e) {
                    console.error('Error in extra round vote:', e);
                }
            });

            collector.on('end', () => {
                if (extraCount > voteNowCount) {
                    this.channel.send('✅ الأغلبية اختارت: **جولة أخيرة!**');
                    resolve(true);
                } else {
                    this.channel.send('🗳️ الأغلبية اختارت: **التصويت الآن!**');
                    resolve(false);
                }
            });
        });
    }


    async playRound() {
        return new Promise(async (resolve) => {
            this.roundResolve = resolve;

            const playersList = Array.from(this.players.values());
            // Reset participation
            playersList.forEach(p => p.hasParticipatedInRound = false);

            let available = [...playersList];

            // Function to run a step of the round
            const runStep = async () => {
                if (this.state === GAME_STATES.ENDED) return resolve();

                if (available.length < 2) {
                    this.roundResolve = null;
                    return resolve();
                }

                // Pick 2 random players
                const askerIndex = Math.floor(Math.random() * available.length);
                const asker = available[askerIndex];
                available.splice(askerIndex, 1);

                const answererIndex = Math.floor(Math.random() * available.length);
                const answerer = available[answererIndex];
                available.splice(answererIndex, 1);

                // Check if they are still in game (might be kicked)
                if (!this.players.has(asker.id) || !this.players.has(answerer.id)) {
                    return runStep(); // Skip if anyone left
                }

                try {
                    // Step 1: Ask
                    // Generate Turn Image
                    try {
                        const turnImage = await ImageGenerator.generateTurnCard(asker, answerer, this.guildId);
                        const attachment = new AttachmentBuilder(turnImage, { name: 'turn.png' });
                        await this.channel.send({
                            content: `**الجولة ${this.roundCount}**: <@${asker.id}> يسأل <@${answerer.id}>`,
                            files: [attachment]
                        });
                    } catch (imgError) {
                        console.error('Turn image failed:', imgError);
                        await this.channel.send(STRINGS.ASK_PROMPT
                            .replace('{asker}', asker.id)
                            .replace('{answerer}', answerer.id));
                    }

                    const question = await this.waitForMessage(asker.id);

                    // Step 2: Answer
                    const questionEmbed = new EmbedBuilder()
                        .setAuthor({ name: `سؤال من ${asker.displayName}`, iconURL: asker.user.displayAvatarURL() })
                        .setDescription(`**${question}**`)
                        .setColor('#3498DB');

                    await this.channel.send({
                        content: STRINGS.ANSWER_PROMPT.replace('{answerer}', answerer.id),
                        embeds: [questionEmbed]
                    });

                    await this.waitForMessage(answerer.id);

                    // Continue Loop
                    runStep();

                } catch (error) {
                    if (error === 'TIMEOUT') {
                        // Kick the player who timed out
                        // Logic is tricky: capture who timed out?
                        // waitForMessage throws 'TIMEOUT' so we need to know who we were waiting for.
                        // Actually better to handle kick inside waitForMessage or pass ID?
                        // Let's refactor waitForMessage to handle the kick, or catch specific error.
                        // Simpler: catch block doesn't know WHO.
                        // We will modify waitForMessage to return true/false, or handle kick internally?
                        // Let's assume waitForMessage handles the kick message but we need to remove from available?
                        // If player kicked -> Game State Check -> if game over resolve() else runStep().
                        if (this.state === GAME_STATES.ENDED) return resolve();
                        runStep();
                    } else if (error === 'GAME_ENDED') {
                        resolve();
                    }
                }
            };

            runStep();
        });
    }

    async waitForMessage(userId) {
        return new Promise((resolve, reject) => {
            const filter = m => m.author.id === userId && !m.author.bot;
            const collector = this.channel.createMessageCollector({
                filter,
                time: require('./Constants').INTERACTION_TIMEOUT,
                max: 1
            });

            // Allow stopping externally
            this.messageCollector = collector;

            collector.on('collect', (m) => {
                resolve(m.content);
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    if (this.state === GAME_STATES.ENDED) return reject('GAME_ENDED');
                    this.kickPlayer(userId);
                    reject('TIMEOUT');
                } else if (reason === 'game_stopped') {
                    reject('GAME_ENDED');
                }
            });
        });
    }

    async kickPlayer(userId) {
        const player = this.players.get(userId);
        if (!player) return;

        this.players.delete(userId);

        // Announce Kick with Image
        const role = player.isImposter ? STRINGS.SYSTEM_IMPOSTER : STRINGS.SYSTEM_CREW;

        try {
            const kickImage = await ImageGenerator.generateKickCard(player, role, this.guildId);
            const attachment = new AttachmentBuilder(kickImage, { name: 'kick.png' });
            await this.channel.send({
                content: STRINGS.TIMEOUT_KICK.replace('{player}', userId),
                files: [attachment]
            });
        } catch (e) {
            console.error('Failed to generate kick image:', e);
            await this.channel.send(STRINGS.TIMEOUT_KICK.replace('{player}', userId) + '\n' + STRINGS.PLAYER_ROLE_REVEAL.replace('{role}', role));
        }

        // Check Win Condition
        if (player.isImposter) {
            // Check if any imposters left
            const remainingImposters = this.imposters.filter(p => this.players.has(p.id));
            if (remainingImposters.length === 0) {
                this.channel.send(STRINGS.CREW_WIN);
                this.awardPoints('CREW');
                this.stop();
            }
        } else {
            // Crew kicked. Check if Imposters >= Crew
            const impostersLeft = this.imposters.filter(p => this.players.has(p.id)).length;
            const crewLeft = this.players.size - impostersLeft;

            if (impostersLeft >= crewLeft) {
                this.channel.send(STRINGS.IMPOSTER_WIN);
                this.awardPoints('IMPOSTER');
                this.stop();
            } else if (this.players.size < 2) {
                // Should not happen if imposter logic is correct, but safety
                this.channel.send(STRINGS.IMPOSTER_WIN);
                this.awardPoints('IMPOSTER');
                this.stop();
            }
        }
    }

    stop() {
        this.state = GAME_STATES.ENDED;
        if (this.currentTimer) clearTimeout(this.currentTimer);
        if (this.messageCollector) this.messageCollector.stop('game_stopped');
        if (this.voteCollector) this.voteCollector.stop();
        if (this.roundResolve) this.roundResolve();
        if (this.onEnd) this.onEnd();
    }

    async startVoting() {
        this.state = GAME_STATES.VOTING;

        const votes = new Map(); // TargetId -> Count
        const voters = new Set(); // PlayerIds who voted

        const generateComponents = () => {
            const rows = [];
            let currentRow = new ActionRowBuilder();
            const players = Array.from(this.players.values()).filter(p => !p.isDead);

            players.forEach((p, index) => {
                if (index % 5 === 0 && index !== 0) {
                    rows.push(currentRow);
                    currentRow = new ActionRowBuilder();
                }

                const count = votes.get(p.id) || 0;
                currentRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`vote_${p.id}`)
                        .setLabel(`${p.displayName} (${count})`)
                        .setStyle(ButtonStyle.Secondary)
                );
            });
            rows.push(currentRow);
            return rows;
        };

        // Initial Voting Image
        const imageBuffer = await ImageGenerator.generateVotingCard(
            Array.from(this.players.values()),
            {}, // No votes yet
            this.guildId
        );
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'voting.png' });

        const voteMsg = await this.channel.send({
            content: '**🗳️ وقت التصويت!**',
            files: [attachment],
            components: generateComponents()
        });

        const collector = voteMsg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: VOTE_TIMEOUT
        });
        this.voteCollector = collector;

        collector.on('collect', async i => {
            if (!this.players.has(i.user.id)) {
                return i.reply({ content: 'أنت لست مشاركاً في اللعبة ولا يمكنك التصويت!', flags: 64 });
            }

            if (voters.has(i.user.id)) {
                return i.reply({ content: 'لقد صوت بالفعل!', flags: 64 });
            }

            const targetId = i.customId.split('_')[1];
            votes.set(targetId, (votes.get(targetId) || 0) + 1);
            voters.add(i.user.id);

            // Update voting image
            try {
                const voteData = {};
                votes.forEach((count, playerId) => { voteData[playerId] = count; });

                const newImageBuffer = await ImageGenerator.generateVotingCard(
                    Array.from(this.players.values()),
                    voteData,
                    this.guildId
                );
                const newAttachment = new AttachmentBuilder(newImageBuffer, { name: 'voting.png' });

                await i.update({
                    components: generateComponents(),
                    files: [newAttachment]
                });
            } catch (e) {
                console.error('Voting update error:', e);
                await i.update({ components: generateComponents() });
            }
        });

        collector.on('end', () => {
            this.handleResults(votes);
        });
    }

    async handleResults(votes) {
        this.state = GAME_STATES.ENDED;

        // Find who got most votes
        let maxVotes = 0;
        let votedOutId = null;

        votes.forEach((count, id) => {
            if (count > maxVotes) {
                maxVotes = count;
                votedOutId = id;
            }
        });

        if (!votedOutId) {
            // Imposter Wins (No one voted out)
            await this.sendResultsImage('IMPOSTER');
            this.awardPoints('IMPOSTER');
            this.stop();
            return;
        }

        const votedPlayer = this.players.get(votedOutId);
        if (votedPlayer.isImposter) {
            // Crew Wins
            await this.sendResultsImage('CREW');
            this.awardPoints('CREW');
        } else {
            await this.sendResultsImage('IMPOSTER');
            this.awardPoints('IMPOSTER');
        }

        this.stop();
    }

    async sendResultsImage(winner) {
        try {
            const imageBuffer = await ImageGenerator.generateResultCard(
                winner,
                this.imposters,
                this.secretWord,
                this.guildId
            );
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'results.png' });
            await this.channel.send({ files: [attachment] });
        } catch (e) {
            console.error('Results image error:', e);
            // Fallback to text
            const winnerText = winner === 'CREW' ? STRINGS.CREW_WIN : STRINGS.IMPOSTER_WIN;
            const imposterNames = this.imposters.map(p => `<@${p.id}>`).join(', ');
            await this.channel.send(`${winnerText}\n\nالـ Imposters: ${imposterNames}\nالكلمة السرية: **${this.secretWord}**`);
        }
    }

    awardPoints(winningTeam) {
        this.players.forEach(player => {
            if (winningTeam === 'CREW') {
                if (!player.isImposter) PointsManager.addPoints(this.guildId, player.id, 5);
            } else if (winningTeam === 'IMPOSTER') {
                if (player.isImposter) PointsManager.addPoints(this.guildId, player.id, 10);
            }
        });
    }
}

module.exports = Game;
