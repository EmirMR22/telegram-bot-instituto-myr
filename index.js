const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');

// =======================
// EXPRESS (OBLIGATORIO)
// =======================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🤖 Bot Telegram Instituto M&R activo');
});

app.listen(PORT, () => {
  console.log(`🌐 Servidor HTTP activo en puerto ${PORT}`);
});

// =======================
// TELEGRAM BOT (TOKEN DIRECTO)
// =======================

// ⚠️ TOKEN DIRECTO (NO seguro, pero funcional)
const BOT_TOKEN = '8137593924:AAE9Jhe_3MbB5Q2Nj9kXznYZcqy2Ua0zeoQ';

if (!BOT_TOKEN || BOT_TOKEN.includes('8137593924:AAE9Jhe_3MbB5Q2Nj9kXznYZcqy2Ua0zeoQ')) {
  console.error('❌ BOT_TOKEN inválido');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

console.log('🤖 BOT TELEGRAM INICIADO CON POLLING');

// =======================
// HANDLERS
// =======================
const adminHandler = require('./handlers/admin')(bot);
require('./handlers/alumno')(bot);
require('./handlers/informes')(bot);

// =======================
// LOGIN
// =======================
const estadoLogin = {};

bot.onText(/\/start/, async (msg) => {
  console.log('📩 /start recibido:', msg.chat.id);

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

// =======================
// CALLBACKS
// =======================
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

// =======================
// CONTACTO
// =======================
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

    if (tipo === 'ADMIN' && !['ADMIN', 'SUPER_ADMIN'].includes(usuario.rol)) {
      delete estadoLogin[tgId];
      return bot.sendMessage(chatId, '❌ Sin permisos.', {
        reply_markup: { remove_keyboard: true }
      });
    }

    if (tipo === 'ALUMNO' && usuario.rol !== 'ALUMNO') {
      delete estadoLogin[tgId];
      return bot.sendMessage(chatId, '❌ Sin permisos.', {
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
    console.error('❌ Error login:', err);
    delete estadoLogin[tgId];
    await bot.sendMessage(chatId, '❌ Error al validar acceso');
  }
});
