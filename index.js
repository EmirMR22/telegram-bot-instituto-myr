require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const bot = require('./bot');
const db = require('./db');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ================= HANDLERS =================
const adminHandler = require('./handlers/admin')(bot);
require('./handlers/alumno')(bot);
require('./handlers/informes')(bot);

const estadoLogin = {};

// ============ TELEGRAM WEBHOOK ============
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ============ START ============
bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    '🤖 *Bienvenido al SYS-BOT del Instituto de Estilismo y Barbería M&R*\n\nSelecciona una opción:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '👨‍💼 Administrador', callback_data: 'login_admin' }],
          [{ text: '👩‍🎓 Alumno', callback_data: 'login_alumno' }],
          [{ text: 'ℹ️ Informes', callback_data: 'info_menu' }]
        ]
      }
    }
  );
});

// ============ CALLBACK ============
bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const tgId = q.from.id;

  await bot.answerCallbackQuery(q.id);

  if (q.data === 'login_admin') estadoLogin[tgId] = 'ADMIN';
  if (q.data === 'login_alumno') estadoLogin[tgId] = 'ALUMNO';

  if (estadoLogin[tgId]) {
    await bot.sendMessage(chatId, '📱 Comparte tu número para validar acceso', {
      reply_markup: {
        keyboard: [[{ text: '📲 Compartir número', request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard: true
      }
    });
  }
});

// ============ CONTACT ============
bot.on('contact', async (msg) => {
  const tgId = msg.from.id;
  const chatId = msg.chat.id;
  const tipo = estadoLogin[tgId];
  if (!tipo) return;

  const telefono = msg.contact.phone_number.replace(/\D/g, '');

  try {
    const [[usuario]] = await db.query(
      'SELECT id, rol FROM usuarios WHERE telefono=? AND activo=1',
      [telefono]
    );

    if (!usuario) {
      delete estadoLogin[tgId];
      return bot.sendMessage(chatId, '❌ Número no registrado.', {
        reply_markup: { remove_keyboard: true }
      });
    }

    await db.query(
      'UPDATE usuarios SET telegram_id=? WHERE id=?',
      [tgId, usuario.id]
    );

    delete estadoLogin[tgId];

    await bot.sendMessage(chatId, '✅ Acceso concedido', {
      reply_markup: { remove_keyboard: true }
    });

    if (tipo === 'ADMIN') {
      await adminHandler.showAdminMenu(bot, chatId, tgId);
    } else {
      bot.emit('alumno_menu', msg);
    }

  } catch (err) {
    console.error(err);
    delete estadoLogin[tgId];
    bot.sendMessage(chatId, '❌ Error de servidor');
  }
});

// ============ SERVER ============
app.listen(PORT, async () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);

  const webhookURL = `${process.env.APP_URL}/bot${process.env.BOT_TOKEN}`;
  await bot.setWebHook(webhookURL);
  console.log('🤖 Webhook configurado');
});
