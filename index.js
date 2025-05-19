const normalizer = require('./fontNormalizer');
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const Fuse = require("fuse.js");

const TOKEN = process.env.TOKEN;
const JSON_FILE = "./DBTag.json";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
  ],
});

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
    fs.writeFileSync(JSON_FILE, JSON.stringify(tags));
    return true;
  } catch {
    return false;
  }
}

function searchTags(query, tags) {
  const fuse = new Fuse(tags, {
    keys: ['name'],
    threshold: 0.4,
    includeScore: true,
    distance: 100,
    minMatchCharLength: 3,
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

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "addtag") {
    const input = interaction.options.getString("input");
    if (!input.includes(",")) {
      await interaction.reply({ content: "Invalid format. Use: Tag_name, Tag_url", ephemeral: true });
      return;
    }
    const [nameRaw, linkRaw] = input.split(",");
    const name = nameRaw.trim();
    const link = linkRaw.trim();
    if (!name || !link) {
      await interaction.reply({ content: "Both tag name and URL must be provided.", ephemeral: true });
      return;
    }
    const tags = loadTags();
    if (tags.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      await interaction.reply({ content: `Tag with name "${name}" already exists.`, ephemeral: true });
      return;
    }
    tags.push({ name, link });
    if (saveTags(tags)) {
      await interaction.reply({ content: `Tag **${name}** added successfully!`, ephemeral: true });
    } else {
      await interaction.reply({ content: "Failed to save the tag. Try again later.", ephemeral: true });
    }
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.mentions.has(client.user)) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[1]?.toLowerCase() || "";
  const language = args[2]?.toLowerCase() || "";

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

    // Initial Loading Embed
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

  // --- Fuzzy (Regular) Search Section ---
  const tagQuery = args[args.length - 1];
  const loadingSteps = [
    "Processing Request",
    "Generating Job Application",
    "Finalizing Query",
  ];

  let loadingEmbed = buildEmbed(`<a:loading:1373152608759582771> Starting...`, `Searching for tag: ${tagQuery}`, 0x808080);
  const sent = await message.channel.send({ embeds: [loadingEmbed] });

  for (let i = 0; i < loadingSteps.length; i++) {
    await new Promise(r => setTimeout(r, 1700));
    loadingEmbed = buildEmbed(`<a:loading:1373152608759582771> ${loadingSteps[i]}`, `Searching for tag: ${tagQuery}`, 0x808080);
    await sent.edit({ embeds: [loadingEmbed] });
  }

  try {
    const allTags = loadTags();
    const results = searchTags(tagQuery, allTags);
    const exactMatch = results.find(t => t.name.toLowerCase() === tagQuery.toLowerCase());

    if (exactMatch) {  
      const embed = buildEmbed(exactMatch.name, exactMatch.link, 0x32cd32);
      await sent.edit({ embeds: [embed], components: [] });
    } else if (results.length > 0) {  
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
