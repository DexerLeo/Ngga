const normalizer = require('./fontNormalizer');
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const Fuse = require("fuse.js");

const TOKEN = process.env.TOKEN;
const JSON_FILE = "./DBTag.json";

// Role ID allowed to use the addtag command
const ALLOWED_ROLE_ID = "1373976275953385513";

const SYMBOLS = [
  "<3",
  ":3",
  ";(",
  ":p",
  ":D",
  ":P",
  ":/",
  ";p"
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
  ],
});

// ---- Logging Channel ID ----
const LOGGING_CHANNEL_ID = "1373983013087613049";
// ----------------------------

client.once("ready", () => {
  if (client.user) {
    console.log(`online as ${client.user.tag}`);
  } else {
    console.log("online as (unknown bot user)");
  }
});

const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(client.user?.id || "me"), {
      body: [
        new SlashCommandBuilder()
          .setName("addtag")
          .setDescription("Add a new tag with name and url")
          .addStringOption(option =>
            option.setName("input")
              .setDescription("Format: Tag_name, Tag_url")
              .setRequired(true)
          )
          .toJSON(),
      ],
    });
  } catch {}
})();

function loadTags() {
  try {
    const rawData = fs.readFileSync(JSON_FILE);
    return JSON.parse(rawData);
  } catch {
    return [];
  }
}

function saveTags(tags) {
  try {
    fs.writeFileSync(JSON_FILE, JSON.stringify(tags, null, 2));
    return true;
  } catch {
    return false;
  }
}

function searchTagsFuzzy(query, tags) {
  const fuse = new Fuse(tags, {
    keys: ['name'],
    threshold: 0.4,
    includeScore: true,
    distance: 100,
    minMatchCharLength: 3, // Keep accuracy for longer queries
  });
  return fuse.search(query).map(res => res.item);
}

function getRandomColor() {
  const colors = [0xffa500, 0x1e90ff, 0x32cd32, 0xff69b4, 0x9370db];
  return colors[Math.floor(Math.random() * colors.length)];
}

function buildEmbed(title, description, color) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color);
}

function buildTagDescription(tags, startIndex = 1) {
  return tags.map((t, i) => `${i + startIndex}. **${t.name}**\n${t.link}`).join("\n\n");
}

// MAIN: Normalized search for all DB-stored variants
function searchTagsNormalized(query, tags) {
  const normQuery = normalizer.normalizeToAscii(query);
  return tags.filter(t => normalizer.normalizeToAscii(t.name) === normQuery);
}

// --- NEW: Guild Join Logging ---
client.on("guildCreate", async (guild) => {
  try {
    const logChannel = await client.channels.fetch(LOGGING_CHANNEL_ID);
    if (!logChannel) return;
    const embed = new EmbedBuilder()
      .setTitle("Bot Added to New Server")
      .addFields(
        { name: "Server Name", value: guild.name, inline: true },
        { name: "Server Members", value: `${guild.memberCount}`, inline: true }
      )
      .setColor(0x1e90ff)
      .setTimestamp();
    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Failed to log guild join:", err);
  }
});
// ------------------------------

// --- !help Command Handler ---
client.on("messageCreate", async (message) => {
  if (
    message.author.bot ||
    typeof message.content !== "string" ||
    message.content.trim().toLowerCase() !== "!help"
  ) return;

  if (message.deletable) {
    try { await message.delete(); } catch (e) {}
  }

  const helpEmbed = new EmbedBuilder()
    .setTitle("**Commands**")
    .setDescription(
      `@Bot addtag\nor \n@Bot at\n\n` +
      `**Use:** @Bot addtag name, url\n` +
      `**Who:** Only users with BACKEND ACCESS role\n` +
      `**What:** Adds a tag to the database\n\n` +

      `@Bot DT, [Link]\n` +
      `**Use:** @Bot DT, link\n` +
      `**Who:** Only users with BACKEND ACCESS role\n` +
      `**What:** Delete tag by link, asks for confirmation\n\n` +

      `@Bot RL, [Old Link] [New Link]\n` +
      `**Use:** @Bot RL, oldLink newLink\n` +
      `**Who:** Only users with BACKEND ACCESS role\n` +
      `**What:** Replace tag's link, asks for confirmation\n\n` +

      `@Bot Show Japanese/Chinese/Korean\n\n` +
      `**Use:** @Bot show chinese/korean/japanese\n` +
      `**Who:** Anyone\n` +
      `**What:** Shows tags with Chinese, Korean, or Japanese text\n\n` +

      `@Bot show symbols\n\n` +
      `**Use:** @Bot show symbols\n` +
      `**Who:** Anyone\n` +
      `**What:** Shows tags that include symbols like <3 or :3\n\n` +

      `!Help\n` +
      `**Use:** !Help\n` +
      `**Who:** Anyone\n` +
      `**What:** shows commands of bot and what they do`
    )
    .setColor(0x2B90D9)
    .setFooter({ text: 'This message will be deleted in 60 seconds.' });

  const sentMsg = await message.channel.send({ embeds: [helpEmbed] });

  setTimeout(async () => {
    try { await sentMsg.delete(); } catch (e) {}
  }, 60000);
});
// ----------------------------

// --- !fetch command for logging all guilds ---
client.on("messageCreate", async (message) => {
  if (message.content.startsWith("!fetch")) {
    const args = message.content.split(" ");
    let channelId = args[1] || LOGGING_CHANNEL_ID;
    try {
      const targetChannel = await client.channels.fetch(channelId);
      if (!targetChannel) return message.reply("Invalid channel ID.");
      const guilds = client.guilds.cache.map(guild => ({
        name: guild.name,
        memberCount: guild.memberCount
      }));
      if (guilds.length === 0) return targetChannel.send("The bot is not in any servers.");
      let desc = guilds.map((g, i) => `${i + 1}. **${g.name}** | Members: ${g.memberCount}`).join("\n");
      const embed = new EmbedBuilder()
        .setTitle("Bot Server Logs")
        .setDescription(desc)
        .setColor(0x32cd32)
        .setTimestamp();
      await targetChannel.send({ embeds: [embed] });
      if (message.channelId !== channelId) await message.reply("Logs sent!");
    } catch (e) {
      await message.reply("Failed to send logs. Make sure the channel ID is valid and the bot has access.");
    }
    return;
  }
});
// --------------------------------------------------

// ----- INTERACTION HANDLER (Slash Command Addtag) -----
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "addtag") {
    const input = interaction.options.getString("input");
    if (!input.includes(",")) {
      await interaction.reply({ content: "Invalid format. Use: Tag_name, Tag_url", ephemeral: true });
      return;
    }
    const [nameRaw, linkRaw] = input.split(",");
    const name = `> Tags: ${nameRaw.trim()}`;
    const link = linkRaw.trim();
    if (!name || !link) {
      await interaction.reply({ content: "Both tag name and URL must be provided.", ephemeral: true });
      return;
    }
    const tags = loadTags();
    tags.push({ name, link });
    if (saveTags(tags)) {
      await interaction.reply({ content: `Tag **${name}** added successfully!`, ephemeral: true });
    } else {
      await interaction.reply({ content: "Failed to save the tag. Try again later.", ephemeral: true });
    }
  }
});
// ------------------------------------------------------

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.mentions.has(client.user)) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[1]?.toLowerCase() || "";
  const language = args[2]?.toLowerCase() || "";

  // --- ADD TAG (Text Command, role-restricted) ---
  if (command === "addtag" || command === "at") {
    const member = message.member;
    if (!member || !member.roles.cache.has(ALLOWED_ROLE_ID)) {
      await message.channel.send({
        embeds: [
          buildEmbed(
            "❌ Permission Denied",
            "You do not have permission to use this command.",
            0xff0000
          ),
        ],
      });
      return;
    }

    const addTagRaw = message.content
      .slice(message.content.indexOf(command) + command.length)
      .trim();
    const split = addTagRaw.split(",");
    if (split.length < 2) {
      await message.channel.send({
        embeds: [
          buildEmbed(
            "❌ Add Tag Failed",
            "Invalid format. Use: `@Bot addtag name, url` or `@Bot at name, url`",
            0xff0000
          ),
        ],
      });
      return;
    }
    const name = `> Tags: ${split[0].trim()}`;
    const link = split.slice(1).join(",").trim();
    if (!name || !link) {
      await message.channel.send({
        embeds: [
          buildEmbed(
            "❌ Add Tag Failed",
            "Both tag name and URL must be provided.",
            0xff0000
          ),
        ],
      });
      return;
    }
    const tags = loadTags();
    tags.push({ name, link });
    if (saveTags(tags)) {
      await message.channel.send({
        embeds: [
          buildEmbed(
            "✅ Tag Added",
            `Tag **${name}** added successfully!`,
            0x32cd32
          ),
        ],
      });
    } else {
      await message.channel.send({
        embeds: [
          buildEmbed(
            "❌ Add Tag Failed",
            "Failed to save the tag. Try again later.",
            0xff0000
          ),
        ],
      });
    }
    return;
  }

  // --- DELETE TAG (DT, [Link]) ---
  if (command === "dt") {
    const member = message.member;
    if (!member || !member.roles.cache.has(ALLOWED_ROLE_ID)) {
      await message.channel.send({
        embeds: [
          buildEmbed(
            "❌ Permission Denied",
            "You do not have permission to use this command.",
            0xff0000
          ),
        ],
      });
      return;
    }
    const linkToDelete = args.slice(2).join(" ").trim();
    if (!linkToDelete) {
      await message.channel.send({
        embeds: [
          buildEmbed(
            "❌ Delete Tag Failed",
            "You must provide the link of the tag to delete. Example: `@Bot DT, https://discord.gg/yourlink`",
            0xff0000
          ),
        ],
      });
      return;
    }
    const tags = loadTags();
    const tagIndex = tags.findIndex(t => t.link === linkToDelete);
    if (tagIndex === -1) {
      await message.channel.send({
        embeds: [
          buildEmbed(
            "❌ Delete Tag Failed",
            "No tag found with that link.",
            0xff0000
          ),
        ],
      });
      return;
    }
    const tag = tags[tagIndex];

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("confirm_delete_tag")
        .setLabel("Yes, Delete")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("cancel_delete_tag")
        .setLabel("No, Cancel")
        .setStyle(ButtonStyle.Secondary)
    );
    const confirmMsg = await message.channel.send({
      embeds: [
        buildEmbed(
          "Delete Tag Confirmation",
          `Are you sure you want to delete the tag:\n**${tag.name}**\n${tag.link}`,
          0xffa500
        )
      ],
      components: [confirmRow]
    });

    const filter = (i) => i.user.id === message.author.id;
    const collector = confirmMsg.createMessageComponentCollector({ filter, max: 1, time: 30000 });

    collector.on("collect", async (interaction) => {
      if (interaction.customId === "confirm_delete_tag") {
        tags.splice(tagIndex, 1);
        saveTags(tags);
        await interaction.update({
          embeds: [
            buildEmbed(
              "✅ Tag Deleted",
              `Tag **${tag.name}** deleted successfully!`,
              0x32cd32
            )
          ],
          components: []
        });
      } else {
        await interaction.update({
          embeds: [
            buildEmbed(
              "Cancelled",
              "Delete tag action cancelled.",
              0xffa500
            )
          ],
          components: []
        });
      }
    });
    return;
  }

  // --- REPLACE LINK (RL, [Old Link] [New Link]) ---
  if (command === "rl") {
    const member = message.member;
    if (!member || !member.roles.cache.has(ALLOWED_ROLE_ID)) {
      await message.channel.send({
        embeds: [
          buildEmbed(
            "❌ Permission Denied",
            "You do not have permission to use this command.",
            0xff0000
          ),
        ],
      });
      return;
    }
    // Accept: @Bot RL, oldLink newLink  or @Bot RL oldLink newLink (comma optional)
    const rlRaw = message.content.match(/RL,?\s*([^\s]+)\s+([^\s]+)/i);
    if (!rlRaw) {
      await message.channel.send({
        embeds: [
          buildEmbed(
            "❌ Replace Link Failed",
            "Invalid format! Use: `@Bot RL, oldLink newLink`",
            0xff0000
          ),
        ],
      });
      return;
    }
    let [, oldLink, newLink] = rlRaw;
    if (!oldLink || !newLink) {
      await message.channel.send({
        embeds: [
          buildEmbed(
            "❌ Replace Link Failed",
            "You must provide both old link and new link. Example: `@Bot RL, oldLink newLink`",
            0xff0000
          ),
        ],
      });
      return;
    }
    const tags = loadTags();
    const tagIndex = tags.findIndex(t => t.link === oldLink);
    if (tagIndex === -1) {
      await message.channel.send({
        embeds: [
          buildEmbed(
            "❌ Replace Link Failed",
            "No tag found with that old link.",
            0xff0000
          ),
        ],
      });
      return;
    }

    const tag = tags[tagIndex];
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("confirm_replace_link")
        .setLabel("Yes, Replace")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("cancel_replace_link")
        .setLabel("No, Cancel")
        .setStyle(ButtonStyle.Secondary)
    );
    const confirmMsg = await message.channel.send({
      embeds: [
        buildEmbed(
          "Replace Link Confirmation",
          `Are you sure you want to update the link for:\n**${tag.name}**\nFrom: ${tag.link}\nTo: ${newLink}`,
          0xffa500
        )
      ],
      components: [confirmRow]
    });

    const filter = (i) => i.user.id === message.author.id;
    const collector = confirmMsg.createMessageComponentCollector({ filter, max: 1, time: 30000 });

    collector.on("collect", async (interaction) => {
      if (interaction.customId === "confirm_replace_link") {
        tags[tagIndex].link = newLink;
        saveTags(tags);
        await interaction.update({
          embeds: [
            buildEmbed(
              "✅ Link Replaced",
              `Link for tag **${tag.name}** updated successfully!`,
              0x32cd32
            )
          ],
          components: []
        });
      } else {
        await interaction.update({
          embeds: [
            buildEmbed(
              "Cancelled",
              "Replace link action cancelled.",
              0xffa500
            )
          ],
          components: []
        });
      }
    });
    return;
  }

  // --- Unicode Search Section (Show Chinese/Korean/Japanese) ---
  if (command === "show" && ["chinese", "korean", "japanese"].includes(language)) {
    const allTags = loadTags();
    const langTags = allTags.filter(tag => {
      if (tag.language) return tag.language.toLowerCase() === language;
      if (language === "chinese") return /[\u4e00-\u9fff]/.test(tag.name);
      if (language === "korean") return /[\uac00-\ud7af]/.test(tag.name);
      if (language === "japanese") return /[\u3040-\u30ff\u31f0-\u31ff]/.test(tag.name);
      return false;
    });

    if (langTags.length === 0) {  
      const noResultEmbed = buildEmbed(  
        `🔴 No ${language.charAt(0).toUpperCase() + language.slice(1)} Tags Found`,  
        `Sorry, no tags found for ${language}.`,  
        0xff0000  
      );  
      await message.channel.send({ embeds: [noResultEmbed] });  
      return;  
    }  

    const pageSize = 5;
    let page = 0;
    const totalPages = Math.ceil(langTags.length / pageSize);

    async function buildTagList(page) {
      const chunk = langTags.slice(page * pageSize, page * pageSize + pageSize);
      return chunk.map(t => `${t.name}\n${t.link}`).join("\n\n");
    }

    const loadingEmbed = buildEmbed(
      `<a:loading:1373152608759582771> Loading...`,
      `Fetching tags..`,
      getRandomColor()
    );
    const sent = await message.channel.send({ embeds: [loadingEmbed] });

    setTimeout(async () => {
      const initialDesc = await buildTagList(page);
      const embed = buildEmbed(
        `✅ Showing ${language.charAt(0).toUpperCase() + language.slice(1)} Tags (Page ${page + 1}/${totalPages})`,
        initialDesc,
        getRandomColor()
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("unicode_prev")
          .setLabel("⬅️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("unicode_next")
          .setLabel("➡️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(totalPages <= 1)
      );
      await sent.edit({ embeds: [embed], components: [row] });

      const filter = (interaction) =>
        (interaction.customId === "unicode_prev" || interaction.customId === "unicode_next") &&
        interaction.message.id === sent.id &&
        interaction.user.id === message.author.id;

      const collector = sent.createMessageComponentCollector({ filter, time: 180000 });

      collector.on("collect", async (interaction) => {
        if (interaction.customId === "unicode_prev" && page > 0) {
          page--;
        } else if (interaction.customId === "unicode_next" && page < totalPages - 1) {
          page++;
        }
        const desc = await buildTagList(page);
        const embedUpdated = buildEmbed(
          `✅ Showing ${language.charAt(0).toUpperCase() + language.slice(1)} Tags (Page ${page + 1}/${totalPages})`,
          desc,
          getRandomColor()
        );
        const rowUpdated = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("unicode_prev")
            .setLabel("⬅️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId("unicode_next")
            .setLabel("➡️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
        );
        await interaction.update({ embeds: [embedUpdated], components: [rowUpdated] });
      });

    }, 2000);

    return;
  }

  // --- SYMBOLS SHOWCASE SECTION ---
  if (command === "show" && language === "symbols") {
    const allTags = loadTags();
    const symbolCounts = {};
    for (const symbol of SYMBOLS) {
      symbolCounts[symbol] = allTags.filter(tag => (tag.name || "").toLowerCase().includes(symbol.toLowerCase())).length;
    }

    const symbolButtons = SYMBOLS.map(symbol =>
      new ButtonBuilder()
        .setCustomId(`symbol_${encodeURIComponent(symbol)}`)
        .setLabel(`${symbol}  x${symbolCounts[symbol]}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(symbolCounts[symbol] === 0)
    );

    const rows = [];
    for (let i = 0; i < symbolButtons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(...symbolButtons.slice(i, i + 5)));
    }

    const pageSize = 8;
    const embed = buildEmbed(
      `Fetched ${allTags.length} Tags!`,
      "Select a symbol below to view tags containing it.",
      0x32cd32
    );
    const sent = await message.channel.send({ embeds: [embed], components: rows });

    const filter = (interaction) =>
      interaction.message.id === sent.id &&
      interaction.user.id === message.author.id;
    const collector = sent.createMessageComponentCollector({ filter, time: 180000 });

    let inSymbolView = false;
    let lastSymbol = null;
    let page = 0;
    let symbolTagPages = [];

    collector.on("collect", async (interaction) => {
      if (!inSymbolView && interaction.customId.startsWith("symbol_")) {
        lastSymbol = decodeURIComponent(interaction.customId.slice(7));
        const tagsWithSymbol = allTags.filter(tag => (tag.name || "").toLowerCase().includes(lastSymbol.toLowerCase()));
        symbolTagPages = [];
        for (let i = 0; i < tagsWithSymbol.length; i += pageSize) {
          symbolTagPages.push(tagsWithSymbol.slice(i, i + pageSize));
        }
        page = 0;
        inSymbolView = true;

        const desc = symbolTagPages[page].map((t, idx) => `${idx + 1 + page * pageSize}. **${t.name}**\n${t.link}`).join('\n\n');
        const embedSymbol = buildEmbed(
          `Tags with "${lastSymbol}" (${tagsWithSymbol.length} found) (Page ${page + 1}/${symbolTagPages.length})`,
          desc || "No tags found.",
          0x32cd32
        );

        const navRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("symbol_back")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("symbol_prev")
            .setLabel("⬅️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId("symbol_next")
            .setLabel("➡️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= symbolTagPages.length - 1)
        );
        await interaction.update({ embeds: [embedSymbol], components: [navRow] });

      } else if (inSymbolView && interaction.customId === "symbol_back") {
        inSymbolView = false;
        lastSymbol = null;
        page = 0;
        await interaction.update({ embeds: [embed], components: rows });

      } else if (inSymbolView && (interaction.customId === "symbol_prev" || interaction.customId === "symbol_next")) {
        if (interaction.customId === "symbol_prev" && page > 0) page--;
        if (interaction.customId === "symbol_next" && page < symbolTagPages.length - 1) page++;
        const desc = symbolTagPages[page].map((t, idx) => `${idx + 1 + page * pageSize}. **${t.name}**\n${t.link}`).join('\n\n');
        const embedSymbol = buildEmbed(
          `Tags with "${lastSymbol}" (${symbolTagPages.flat().length} found) (Page ${page + 1}/${symbolTagPages.length})`,
          desc || "No tags found.",
          0x32cd32
        );
        const navRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("symbol_back")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("symbol_prev")
            .setLabel("⬅️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId("symbol_next")
            .setLabel("➡️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= symbolTagPages.length - 1)
        );
        await interaction.update({ embeds: [embedSymbol], components: [navRow] });

      } else {
        await interaction.deferUpdate();
      }
    });

    return;
  }

  // --- Normalized Multi-Variant Tag Search Section ---
  // RL/DT commands are handled above, so skip search if those were used
  if (["dt", "rl"].includes(command)) return;

  const tagQuery = args.slice(1).join(' ').trim();
  if (!tagQuery) return;

  let loadingEmbed = buildEmbed(
    `<a:loading:1373152608759582771> Starting...`,
    `Searching for tag: ${tagQuery}`,
    0x808080
  );
  const sent = await message.channel.send({ embeds: [loadingEmbed] });

  try {
    const allTags = loadTags();
    const normResults = searchTagsNormalized(tagQuery, allTags);

    if (normResults.length > 0) {
      let desc = normResults.map(
        t => `**${t.name}**\n${t.link}`
      ).join('\n\n');

      const embed = buildEmbed(
        `Found ${normResults.length} variant(s) for "${tagQuery}"`,
        desc,
        0x32cd32
      );
      await sent.edit({ embeds: [embed], components: [] });
      return;
    }

    // --- ADDED: Direct match for short queries (<=2 chars), removing "> Tags: " prefix for exact match ---
    if (tagQuery.length <= 2) {
      const exact = allTags.filter(t => {
        const tagName = t.name.replace(/^>\s*tags:\s*/i, "").trim();
        return normalizer.normalizeToAscii(tagName).toLowerCase() === normalizer.normalizeToAscii(tagQuery).toLowerCase();
      });
      if (exact.length > 0) {
        let desc = exact.map(
          t => `**${t.name}**\n${t.link}`
        ).join('\n\n');
        const embed = buildEmbed(
          `Found ${exact.length} tag(s) exactly matching "${tagQuery}"`,
          desc,
          0x32cd32
        );
        await sent.edit({ embeds: [embed], components: [] });
        return;
      }
    }
    // ------------------------------------------------------
  } catch (e) {}

  try {
    const allTags = loadTags();
    const results = searchTagsFuzzy(tagQuery, allTags);

    if (results.length > 0) {
      let page = 0;
      const pageSize = 3;
      const totalPages = Math.ceil(results.length / pageSize);
      let desc = buildTagDescription(results.slice(page * pageSize, (page + 1) * pageSize));
      let embed = buildEmbed(`✅ Found ${results.length} Tags (Page ${page + 1}/${totalPages})`, desc, 0x32cd32);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("fuzzy_prev")
          .setLabel("⬅️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("fuzzy_next")
          .setLabel("➡️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(totalPages <= 1)
      );

      await sent.edit({ embeds: [embed], components: [row] });

      const filter = (interaction) =>
        (interaction.customId === "fuzzy_prev" || interaction.customId === "fuzzy_next") &&
        interaction.message.id === sent.id &&
        interaction.user.id === message.author.id;

      const collector = sent.createMessageComponentCollector({ filter, time: 180000 });

      collector.on("collect", async (interaction) => {
        if (interaction.customId === "fuzzy_prev" && page > 0) {
          page--;
        } else if (interaction.customId === "fuzzy_next" && page < totalPages - 1) {
          page++;
        }
        desc = buildTagDescription(results.slice(page * pageSize, (page + 1) * pageSize));
        embed = buildEmbed(`✅ Found ${results.length} Tags (Page ${page + 1}/${totalPages})`, desc, 0x32cd32);
        const rowUpdated = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("fuzzy_prev")
            .setLabel("⬅️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId("fuzzy_next")
            .setLabel("➡️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
        );
        await interaction.update({ embeds: [embed], components: [rowUpdated] });
      });
    } else {
      let noResultMsg = "";
      if (tagQuery.length > 4) {
        noResultMsg = "No Match Found, Try 4 Letters";
      } else {
        noResultMsg = "No Match Found, Be More Specific";
      }
      const noResultEmbed = buildEmbed(
        `🔴 No Results`,
        noResultMsg,
        0xff0000
      );
      await sent.edit({ embeds: [noResultEmbed], components: [] });
    }
  } catch {
    const errorEmbed = buildEmbed(
      "Error",
      "An error occurred while searching tags.",
      0xff0000
    );
    await sent.edit({ embeds: [errorEmbed], components: [] });
  }
});

client.login(TOKEN);