require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  Events,
  ChannelType,
  PermissionsBitField,
} = require("discord.js");
const GameManager = require("./src/GameManager");
const PointsManager = require("./src/PointsManager");
const {
  STRINGS,
  JOIN_TIMEOUT,
  GAME_STATES,
  EMBED_COLOR,
} = require("./src/Constants");

const fs = require("fs");
const path = require("path");
const ImageGenerator = require("./src/utils/ImageGenerator"); // Preload fonts
const CONFIG_PATH = path.join(__dirname, "server_config.json");

// Helper for safe replies
const safeReply = async (message, content) => {
  try {
    return await message.reply(content);
  } catch (error) {
    if (error.code === 10008 || error.code === 50035) {
      // Unknown Message or Invalid Form Body
      return await message.channel.send(content);
    }
    console.error("SafeReply Error:", error);
  }
};

// Load Config
let serverConfig = {};
try {
  if (fs.existsSync(CONFIG_PATH)) {
    serverConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  }
} catch (e) {
  console.error("Failed to load config:", e);
}

// Default prefix if not set
if (!serverConfig.prefix) {
  serverConfig.prefix = "#";
  saveConfig();
}

const saveConfig = () => {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(serverConfig, null, 2));
  } catch (e) {
    console.error("Failed to save config:", e);
  }
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
});

const BOT_ADMINS = ["mido_tarek14", "samasemo14"];

const isAdmin = (member, user) => {
  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    BOT_ADMINS.includes(user.username)
  );
};

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (message.content === serverConfig.prefix + "setup") {
    if (!isAdmin(message.member, message.author)) {
      return safeReply(message, STRINGS.NOT_ADMIN);
    }

    const channels = message.guild.channels.cache
      .filter((c) => c.type === ChannelType.GuildText)
      .first(25); // Limit to 25 for buttons

    const rows = [];
    let currentRow = new ActionRowBuilder();

    channels.forEach((channel, index) => {
      if (index % 5 === 0 && index !== 0) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`setup_channel_${channel.id}`)
          .setLabel(channel.name.substring(0, 80))
          .setStyle(ButtonStyle.Secondary),
      );
    });
    rows.push(currentRow);

    const embed = new EmbedBuilder()
      .setTitle(STRINGS.SETUP_TITLE)
      .setDescription(STRINGS.SETUP_DESC)
      .setColor(EMBED_COLOR);

    return message
      .reply({ embeds: [embed], components: rows })
      .catch((e) =>
        message.channel.send({ embeds: [embed], components: rows }),
      );
  }

  if (message.content.startsWith(serverConfig.prefix + "setbg")) {
    if (!isAdmin(message.member, message.author)) {
      return safeReply(message, STRINGS.NOT_ADMIN);
    }

    const args = message.content.split(" ");
    if (args.length < 3) {
      return safeReply(
        message,
        `الاستخدام: \`${serverConfig.prefix}setbg <type> <imageUrl>\`\nالأنواع: lobby, voting, results, leaderboard`,
      );
    }

    const type = args[1];
    const imageUrl = args[2];
    const validTypes = ["lobby", "voting", "results", "leaderboard"];

    if (!validTypes.includes(type)) {
      return safeReply(
        message,
        `❌ نوع غير صحيح! استخدم: ${validTypes.join(", ")}`,
      );
    }

    try {
      const BackgroundManager = require("./src/utils/BackgroundManager");
      await BackgroundManager.setBackground(message.guild.id, imageUrl, type);
      return safeReply(message, `✅ تم تعيين خلفية ${type} بنجاح!`);
    } catch (error) {
      console.error("Background set error:", error);
      return safeReply(message, "❌ فشل تحميل الصورة. تأكد من الرابط.");
    }
  }

  if (message.content === serverConfig.prefix + "imposter") {
    // Enforce Channel Restriction
    if (
      serverConfig.allowedChannelId &&
      message.channel.id !== serverConfig.allowedChannelId
    ) {
      return safeReply(
        message,
        STRINGS.WRONG_CHANNEL.replace(
          "{channel}",
          serverConfig.allowedChannelId,
        ),
      );
    }

    if (GameManager.hasGame(message.channel.id)) {
      return safeReply(message, STRINGS.ALREADY_GAME);
    }

    const game = GameManager.createGame(message.channel, message.author);
    game.onEnd = () => GameManager.endGame(message.channel.id);

    // Generate initial lobby image
    // ImageGenerator is now preloaded at top
    const { AttachmentBuilder } = require("discord.js");
    const imageBuffer = await ImageGenerator.generateLobbyCard(
      Array.from(game.players.values()),
      message.guild.id,
    );
    const attachment = new AttachmentBuilder(imageBuffer, {
      name: "lobby.png",
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("join_game")
        .setLabel(STRINGS.JOIN_BTN)
        .setStyle(ButtonStyle.Success),
    );

    const msg = await message.channel.send({
      content: `**🎮 لعبة Imposter**\nاللاعبين: 0/20`,
      files: [attachment],
      components: [row],
    });
    game.lobbyMessage = msg;

    // Start Join Timer
    setTimeout(async () => {
      if (game.state === GAME_STATES.LOBBY) {
        await game.startGame();
        if (game.state === GAME_STATES.ENDED) {
          GameManager.endGame(message.channel.id);
        }
      }
    }, JOIN_TIMEOUT);
  }

  if (message.content === serverConfig.prefix + "stop") {
    const game = GameManager.getGame(message.channel.id);
    if (!game) return safeReply(message, STRINGS.NO_GAME);

    // Check permissions (Admin or Host or Bot Admin)
    if (
      !isAdmin(message.member, message.author) &&
      message.author.id !== game.host.id
    ) {
      return safeReply(message, STRINGS.NOT_ADMIN);
    }

    game.stop();
    // GameManager.endGame called via onEnd inside stop()
    message.channel.send(STRINGS.GAME_STOPPED);
  }

  if (message.content === serverConfig.prefix + "points") {
    const points = PointsManager.getPoints(message.guild.id);
    const sorted = Object.entries(points).sort(([, a], [, b]) => b - a);

    if (sorted.length === 0) {
      return safeReply(message, "لا يوجد نقاط مسجلة بعد.");
    }

    // Use Canvas to generate leaderboard image
    try {
      // ImageGenerator is preloaded
      const topUserIds = sorted.slice(0, 10);
      const topPlayers = [];

      for (const [userId, pts] of topUserIds) {
        let name = "Unknown";
        try {
          const user = await client.users.fetch(userId);
          name = user.username;
        } catch (err) {
          name = `User ${userId}`;
        }
        topPlayers.push({ name, points: pts });
      }

      const imageBuffer = await ImageGenerator.generateLeaderboard(
        topPlayers,
        message.guild.id,
      );

      return message.channel.send({
        files: [{ attachment: imageBuffer, name: "leaderboard.png" }],
      });
    } catch (error) {
      console.error("Leaderboard generation error:", error);
      // Fallback to text
      const top = sorted
        .map((entry, i) => `${i + 1}. <@${entry[0]}> : ${entry[1]} نقطة`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setTitle("🏆 لوحة المتصدرين")
        .setDescription(top)
        .setColor("#F1C40F");

      return message.channel.send({ embeds: [embed] });
    }
  }

  if (message.content === serverConfig.prefix + "reset_points") {
    if (!isAdmin(message.member, message.author)) {
      return safeReply(message, STRINGS.NOT_ADMIN);
    }
    PointsManager.resetPoints(message.guild.id);
    return safeReply(message, "✅ تم تصفير جميع النقاط بنجاح.");
  }

  if (message.content.startsWith(serverConfig.prefix + "setprefix")) {
    if (!isAdmin(message.member, message.author)) {
      return safeReply(message, STRINGS.NOT_ADMIN);
    }

    const args = message.content.split(" ");
    if (args.length < 2) {
      return safeReply(
        message,
        `الاستخدام: \`${serverConfig.prefix}setprefix <new_prefix>\``,
      );
    }

    const newPrefix = args[1];
    if (newPrefix.length > 3) {
      return safeReply(message, "⚠️ البرفكس يجب أن يكون 3 أحرف أو أقل.");
    }

    serverConfig.prefix = newPrefix;
    saveConfig();
    return safeReply(message, `✅ تم تغيير البرفكس إلى: **${newPrefix}**`);
  }
});

// Setup Interaction Handler
const InteractionHandler = require("./src/handlers/InteractionHandler");
const interactionHandler = new InteractionHandler(client);

// Setup Slash Handler
const SlashHandler = require("./src/handlers/SlashHandler");
new SlashHandler(client);

// Register handlers
const handleJoinGame = require("./src/interactions/buttons/joinGame");
const handleSetupChannel = require("./src/interactions/buttons/setupChannel");
// const handleVote = require('./src/interactions/buttons/vote');

interactionHandler.register("join_game", handleJoinGame);
interactionHandler.register("setup_channel_*", (interaction) =>
  handleSetupChannel(interaction, serverConfig, saveConfig, isAdmin),
);
// interactionHandler.register('vote_*', handleVote);

// Global Error Handling to prevent crashes
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

client.login(process.env.DISCORD_TOKEN);
const http = require("http");

const PORT = process.env.PORT || 8000;

http
  .createServer((req, res) => {
    res.writeHead(200);
    res.end("Bot is alive");
  })
  .listen(PORT, () => {
    console.log(`Health server running on port ${PORT}`);
  });
