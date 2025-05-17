require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const Fuse = require("fuse.js");

const TOKEN = process.env.TOKEN;
const LOADING_EMOJI = "<a:loading:1373152608759582771>";
const CHECK_EMOJI = "✅";
const NO_RESULT_EMOJI = "🔴";

const JSON_FILE = "./DBTag.json";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
  ],
});

const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(client.user?.id || "YOUR_CLIENT_ID"),
      {
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
      }
    );
  } catch (error) {
    console.error(error);
  }
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

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

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
        `${NO_RESULT_EMOJI} No ${language.charAt(0).toUpperCase() + language.slice(1)} Tags Found`,
        `Sorry, no tags found for ${language}.`,
        0xff0000
      );
      await message.channel.send({ embeds: [noResultEmbed] });
      return;
    }

    let currentIndex = 0;

    async function buildTagList(start) {
      const chunk = langTags.slice(start, start + 5);
      return chunk.map(t => `${t.name}\n${t.link}`).join("\n\n");
    }

    const initialDesc = await buildTagList(currentIndex);
    currentIndex += 5;

    const embed = buildEmbed(
      `${CHECK_EMOJI} Showing ${language.charAt(0).toUpperCase() + language.slice(1)} Tags`,
      initialDesc,
      getRandomColor()
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("unicode_retry_0")
        .setLabel("Retry")
        .setStyle(ButtonStyle.Primary)
    );

    const sent = await message.channel.send({ embeds: [embed], components: [row] });

    const filter = (interaction) =>
      interaction.customId.startsWith("unicode_retry_") &&
      interaction.message.id === sent.id &&
      interaction.user.id === message.author.id;

    const collector = sent.createMessageComponentCollector({ filter, time: 180000 });

    collector.on("collect", async (interaction) => {
      const loadingEmbed = buildEmbed(`${LOADING_EMOJI} Loading...`, `Fetching more ${language} tags...`, getRandomColor());
      await interaction.update({ embeds: [loadingEmbed], components: [] });

      await new Promise(r => setTimeout(r, 2000));

      const nextDesc = await buildTagList(currentIndex);
      currentIndex += 5;

      const newEmbed = buildEmbed(
        `${CHECK_EMOJI} Showing ${language.charAt(0).toUpperCase() + language.slice(1)} Tags (Page)`,
        nextDesc,
        getRandomColor()
      );

      const components = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`unicode_retry_${Date.now()}`)
            .setLabel("Retry")
            .setStyle(ButtonStyle.Primary)
        )
      ];

      await interaction.editReply({ embeds: [newEmbed], components });
    });

    return;
  }

  const tagQuery = args[args.length - 1];

  const loadingSteps = [
    "Processing Request",
    "Generating Job Application",
    "Finalizing Query",
  ];

  let loadingEmbed = buildEmbed(`${LOADING_EMOJI} Starting...`, `Searching for tag: ${tagQuery}`, getRandomColor());
  const sent = await message.channel.send({ embeds: [loadingEmbed] });

  for (let i = 0; i < loadingSteps.length; i++) {
    await new Promise(r => setTimeout(r, 1700));
    loadingEmbed = buildEmbed(`${LOADING_EMOJI} ${loadingSteps[i]}`, `Searching for tag: ${tagQuery}`, getRandomColor());
    await sent.edit({ embeds: [loadingEmbed] });
  }

  try {
    const allTags = loadTags();
    const results = searchTags(tagQuery, allTags);
    const exactMatch = results.find(t => t.name.toLowerCase() === tagQuery.toLowerCase());

    if (exactMatch) {
      const embed = buildEmbed(exactMatch.name, exactMatch.link, getRandomColor());
      await sent.edit({ embeds: [embed], components: [] });
    } else if (results.length > 0) {
      const desc = buildTagDescription(results.slice(0, 5));
      const embed = buildEmbed(`Found ${results.length} tags`, desc, getRandomColor());

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("retry_0")
          .setLabel("Retry")
          .setStyle(ButtonStyle.Primary)
      );

      await sent.edit({ embeds: [embed], components: [row] });

      let retryCount = 0;
      let currentIndex = 5;

      const filter = (interaction) =>
        interaction.customId.startsWith("retry_") &&
        interaction.message.id === sent.id &&
        interaction.user.id === message.author.id;

      const collector = sent.createMessageComponentCollector({ filter, time: 180000 });

      collector.on("collect", async (interaction) => {
        retryCount++;
        const loadingEmbed = buildEmbed(`${LOADING_EMOJI} Loading...`, `Fetching more tags...`, getRandomColor());
        await interaction.update({ embeds: [loadingEmbed], components: [] });

        await new Promise(r => setTimeout(r, 2000));

        const nextChunk = results.slice(currentIndex, currentIndex + 5);
        if (nextChunk.length === 0) {
          await interaction.editReply({ content: "No more tags found.", embeds: [], components: [] });
          collector.stop();
          return;
        }

        const desc = buildTagDescription(nextChunk, currentIndex + 1);
        currentIndex += 5;

        const newEmbed = buildEmbed(`Found ${results.length} tags (Page ${retryCount + 1})`, desc, getRandomColor());

        const components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`retry_${retryCount}`)
              .setLabel("Retry")
              .setStyle(ButtonStyle.Primary)
          )
        ];

        await interaction.editReply({ embeds: [newEmbed], components });
      });
    } else {
      const noResultEmbed = buildEmbed(
        `${NO_RESULT_EMOJI} No Results`,
        `No tags found matching "${tagQuery}".`,
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

