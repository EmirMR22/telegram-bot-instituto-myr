require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN no definido');
  process.exit(1);
}

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = `https://bot-telegram.institutomyr.com/webhook/${BOT_TOKEN}`;

const bot = new TelegramBot(BOT_TOKEN);

// ===== WEBHOOK =====
bot.setWebHook(WEBHOOK_URL);

// ===== RUTA PRINCIPAL =====
app.get('/', (req, res) => {
  res.send('🤖 Bot Telegram Instituto M&R activo (WEBHOOK)');
});

// ===== RUTA WEBHOOK =====
app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ===== BOT =====
bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    '🤖 *Bienvenido al Instituto M&R*\n\nSelecciona una opción:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'ℹ️ Informes', callback_data: 'info' }],
          [{ text: '📲 WhatsApp', url: 'https://wa.me/522281191773' }]
        ]
      }
    }
  );
});

bot.on('callback_query', async (q) => {
  await bot.answerCallbackQuery(q.id);

  if (q.data === 'info') {
    await bot.sendMessage(
      q.message.chat.id,
      '📌 *Informes Instituto M&R*\n\n📲 WhatsApp:\nhttps://wa.me/522281191773',
      { parse_mode: 'Markdown' }
    );
  }
});

// ===== SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Servidor webhook activo en puerto ${PORT}`);
  console.log(`🔗 Webhook: ${WEBHOOK_URL}`);
});
