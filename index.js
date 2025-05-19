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
