require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { recognizeTable } = require('./utils/ocr');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages
  ]
});

const GUILD_ID = process.env.GUILD_ID;
const SCREENSHOT_CHANNEL_ID = process.env.SCREENSHOT_CHANNEL_ID;
const STATICS_FILE = path.join(__dirname, 'data', 'statics.json');

let savedStatics = new Map();
let cachedMembers = null;
let lastMemberFetch = 0;

async function getMembers() {
  const now = Date.now();
  if (cachedMembers && (now - lastMemberFetch) < 300000) {
    return cachedMembers;
  }
  
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch();
  cachedMembers = guild.members.cache;
  lastMemberFetch = now;
  console.log('Обновлён кеш участников');
  return cachedMembers;
}

function loadStatics() {
  try {
    if (fs.existsSync(STATICS_FILE)) {
      const fileContent = fs.readFileSync(STATICS_FILE, 'utf8');
      if (!fileContent.trim()) {
        saveStatics();
        return;
      }
      const data = JSON.parse(fileContent);
      savedStatics = new Map(Object.entries(data));
      console.log(`Загружено ${savedStatics.size} статиков`);
    } else {
      saveStatics();
    }
  } catch (e) {
    console.error('Ошибка загрузки:', e.message);
    saveStatics();
  }
}

function saveStatics() {
  try {
    const obj = Object.fromEntries(savedStatics);
    fs.writeFileSync(STATICS_FILE, JSON.stringify(obj, null, 2));
    console.log(`Сохранено ${savedStatics.size} статиков`);
  } catch (e) {
    console.error('Ошибка сохранения:', e);
  }
}

client.once('ready', async () => {
  loadStatics();
  console.log(`Бот запущен: ${client.user.tag}`);
  console.log(`Канал для скринов: ${SCREENSHOT_CHANNEL_ID}`);
  console.log(`Статиков в базе: ${savedStatics.size}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  
  if (interaction.customId === 'register_static_button') {
    const modal = new ModalBuilder()
      .setCustomId('register_static_modal')
      .setTitle('Регистрация статиков');
    
    const bulkInput = new TextInputBuilder()
      .setCustomId('bulk_statics')
      .setLabel('Введите статики (по одному на строку)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Формат: Имя Фамилия СТАТИК\n\nПример:\nLeo Pehota 45618\nVanchik Raiden 45598')
      .setRequired(true)
      .setMaxLength(2000);
    
    const row = new ActionRowBuilder().addComponents(bulkInput);
    modal.addComponents(row);
    
    await interaction.showModal(modal);
  }
  
  if (interaction.customId.startsWith('check_')) {
    await interaction.message.edit({
      content: interaction.message.content,
      components: []
    });
    
    await handleCheck(interaction);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId !== 'register_static_modal') return;
  
  const bulkText = interaction.fields.getTextInputValue('bulk_statics');
  
  const lines = bulkText.split('\n');
  const results = { success: [], errors: [] };
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) {
      results.errors.push({ line: trimmed, reason: 'Не хватает данных' });
      continue;
    }
    
    const staticRaw = parts[parts.length - 1];
    const nameRaw = parts.slice(0, -1).join(' ');
    
    if (!/^\d+$/.test(staticRaw)) {
      results.errors.push({ line: trimmed, reason: 'Статик должен быть числом' });
      continue;
    }
    
    if (savedStatics.has(staticRaw)) {
      const existing = savedStatics.get(staticRaw);
      results.errors.push({ line: trimmed, reason: `Статик ${staticRaw} уже зарегистрирован за ${existing.name}` });
      continue;
    }
    
    savedStatics.set(staticRaw, {
      name: nameRaw,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      date: new Date().toISOString()
    });
    
    results.success.push({ static: staticRaw, name: nameRaw });
  }
  
  saveStatics();
  
  let replyText = '';
  
  if (results.success.length > 0) {
    replyText += `✅ Успешно добавлено: ${results.success.length}\n`;
    for (const item of results.success.slice(0, 10)) {
      replyText += `• ${item.static} -> ${item.name}\n`;
    }
    if (results.success.length > 10) {
      replyText += `• ...и ещё ${results.success.length - 10}\n`;
    }
  }
  
  if (results.errors.length > 0) {
    replyText += `\n❌ Ошибки: ${results.errors.length}\n`;
    for (const err of results.errors.slice(0, 5)) {
      replyText += `• ${err.line.slice(0, 50)} — ${err.reason}\n`;
    }
    if (results.errors.length > 5) {
      replyText += `• ...и ещё ${results.errors.length - 5}\n`;
    }
  }
  
  await interaction.reply({ 
    content: replyText || 'Ничего не добавлено', 
    flags: 64
  });
  
  console.log(`📦 ${interaction.user.tag} добавил ${results.success.length} статиков`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  const adminIds = ['1073398399799398430'];
  
  if (message.content === '!создать_кнопку') {
    if (!adminIds.includes(message.author.id)) {
      return message.reply('❌ У вас нет прав для этой команды');
    }
    
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('register_static_button')
          .setLabel('➕ Добавить статики')
          .setStyle(ButtonStyle.Success)
      );
    
    await message.channel.send({
      content: '📝 **Регистрация статиков**\nНажмите на кнопку, чтобы добавить статики в базу',
      components: [row]
    });
    
    await message.reply('✅ Кнопка создана!');
    return;
  }
  
  if (message.content === '!список' && adminIds.includes(message.author.id)) {
    if (savedStatics.size === 0) {
      return message.reply('📭 База статиков пуста');
    }
    
    let list = '📋 Список зарегистрированных статиков:\n';
    let count = 0;
    
    for (const [staticNum, data] of savedStatics) {
      count++;
      list += `${count}. ${staticNum} -> ${data.name} (${data.userTag})\n`;
    }
    
    if (list.length > 1900) {
      const parts = list.match(/(.|[\r\n]){1,1900}/g);
      for (const part of parts) {
        await message.reply(part);
      }
    } else {
      await message.reply(list);
    }
  }
  
  if (message.content.startsWith('!удалить') && adminIds.includes(message.author.id)) {
    const args = message.content.split(' ');
    if (args.length < 2) {
      return message.reply('❌ Использование: !удалить СТАТИК');
    }
    
    const staticToDelete = args[1];
    
    if (savedStatics.has(staticToDelete)) {
      const deleted = savedStatics.get(staticToDelete);
      savedStatics.delete(staticToDelete);
      saveStatics();
      await message.reply(`✅ Статик ${staticToDelete} (${deleted.name}) удалён`);
    } else {
      await message.reply(`❌ Статик ${staticToDelete} не найден`);
    }
  }
  
  if (message.channel.id !== SCREENSHOT_CHANNEL_ID) return;
  if (!message.attachments.size) return;
  
  const images = [];
  for (const [id, attachment] of message.attachments) {
    if (attachment.contentType?.startsWith('image/')) {
      images.push(attachment);
    }
  }
  
  if (images.length === 0) return;
  
  for (const image of images) {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`check_${image.url}_${Date.now()}`)
          .setLabel(`🔍 Проверить: ${image.name}`)
          .setStyle(ButtonStyle.Primary)
      );
    
    await message.reply({
      content: `📸 **${image.name}**\nНажмите на кнопку для проверки`,
      components: [row]
    });
  }
  
  await message.reply({
    content: `✅ Добавлено ${images.length} кнопок для проверки скриншотов`,
    flags: 64
  });
});

async function handleCheck(interaction) {
  await interaction.reply({ content: '⏳ Проверяю...', flags: 64 });
  
  try {
    const parts = interaction.customId.split('_');
    const imageUrl = parts.slice(1, -1).join('_');
    
    const imageBuffer = await downloadImage(imageUrl);
    const tableData = await recognizeTable(imageBuffer);
    
    if (!tableData.length) {
      await interaction.followUp({ content: '❌ Ошибка: не удалось распознать таблицу', flags: 64 });
      return;
    }
    
    const members = await getMembers();
    const results = [];
    
    for (const row of tableData) {
      const targetStatic = row.static;
      const targetName = row.name;
      
      let savedFound = savedStatics.get(targetStatic);
      
      let discordFound = null;
      if (!savedFound) {
        for (const [id, member] of members) {
          const nick = (member.nickname || member.user.username).toLowerCase();
          const staticRegex = new RegExp(`\\b${targetStatic}\\b`);
          if (staticRegex.test(nick)) {
            discordFound = {
              nick: member.nickname || member.user.username,
              tag: member.user.tag
            };
            break;
          }
        }
      }
      
      results.push({
        name: targetName,
        static: targetStatic,
        savedFound: savedFound,
        discordFound: discordFound
      });
    }
    
    const embed = generateEmbed(results, interaction.user.tag);
    await interaction.followUp({ embeds: [embed], flags: 64 });
    
  } catch (error) {
    console.error(error);
    await interaction.followUp({ content: `❌ Ошибка: ${error.message}`, flags: 64 });
  }
}

async function downloadImage(url) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
}

function generateEmbed(results, authorName) {
  const total = results.length;
  const found = results.filter(r => r.savedFound || r.discordFound).length;
  const notFound = total - found;
  const foundInSaved = results.filter(r => r.savedFound).length;
  const foundInDiscord = results.filter(r => r.discordFound).length;
  
  const embed = new EmbedBuilder()
    .setTitle('📋 Результат проверки статиков')
    .setColor(found === total ? 0x00FF00 : (found > 0 ? 0xFFA500 : 0xFF0000))
    .setDescription(`Проверено статиков: ${total}\nНайдено: ${found}\nНе найдено: ${notFound}`)
    .addFields(
      { name: '💾 В базе бота', value: `${foundInSaved}`, inline: true },
      { name: '✅ В Discord никах', value: `${foundInDiscord}`, inline: true },
      { name: '❌ Не найдено', value: `${notFound}`, inline: true }
    )
    .setFooter({ text: `Запрос от ${authorName}` })
    .setTimestamp();
  
  const foundList = results.filter(r => r.savedFound || r.discordFound);
  if (foundList.length > 0) {
    let listText = '';
    for (const r of foundList.slice(0, 15)) {
      let sources = [];
      if (r.savedFound) sources.push('база');
      if (r.discordFound) sources.push('Discord');
      listText += `${r.static} - ${r.name} (${sources.join(', ')})\n`;
    }
    if (foundList.length > 15) {
      listText += `и ещё ${foundList.length - 15}...`;
    }
    embed.addFields({ name: '📌 Найденные статики', value: listText || 'Нет', inline: false });
  }
  
  const notFoundList = results.filter(r => !r.savedFound && !r.discordFound);
  if (notFoundList.length > 0) {
    let notFoundText = '';
    for (const r of notFoundList.slice(0, 15)) {
      notFoundText += `${r.static} - ${r.name}\n`;
    }
    if (notFoundList.length > 15) {
      notFoundText += `и ещё ${notFoundList.length - 15}...`;
    }
    embed.addFields({ name: '⚠️ Не найдены', value: notFoundText || 'Нет', inline: false });
  }
  
  return embed;
}

client.login(process.env.DISCORD_TOKEN);
