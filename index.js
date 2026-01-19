/*****************************************************
 * BOT TELEGRAM – Instituto de Estilismo y Barbería M&R
 * Compatible con Hostinger (Shared Hosting)
 *****************************************************/

const fs = require('fs');
const path = require('path');

/* ====================================================
   1️⃣ MOSTRAR CONTEXTO (DEBUG HOSTINGER)
==================================================== */
console.log('📂 Directorio actual:', __dirname);

try {
  console.log('📄 Archivos en el directorio:', fs.readdirSync(__dirname));
} catch (e) {
  console.error('❌ No se pudo listar el directorio', e);
}

/* ====================================================
   2️⃣ CARGAR VARIABLES DE ENTORNO (env.js o process.env)
==================================================== */
let ENV = {};
const envPath = path.join(__dirname, 'env.js');

if (fs.existsSync(envPath)) {
  console.log('✅ env.js encontrado');
  ENV = require(envPath);
} else {
  console.log('⚠️ env.js NO encontrado, usando process.env');
  ENV = process.env;
}

if (!ENV.BOT_TOKEN) {
  console.error('❌ ERROR CRÍTICO: BOT_TOKEN no definido');
  process.exit(1);
}

console.log('✅ BOT_TOKEN cargado correctamente');

/* ====================================================
   3️⃣ EXPRESS (REQUERIDO POR HOSTINGER)
==================================================== */
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🤖 Bot Telegram Instituto M&R activo');
});

app.listen(PORT, () => {
  console.log(`🌐 Servidor HTTP activo en puerto ${PORT}`);
});

/* ====================================================
   4️⃣ TELEGRAM BOT (POLLING)
==================================================== */
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(ENV.BOT_TOKEN, {
  polling: {
    interval: 300,
    autoStart: true
  }
});

console.log('🤖 Bot de Telegram iniciado correctamente');

/* ====================================================
   5️⃣ HANDLERS
==================================================== */
const db = require('./db');

const adminHandler = require('./handlers/admin')(bot);
require('./handlers/alumno')(bot);
require('./handlers/informes')(bot);

/* ====================================================
   6️⃣ LOGIN / START
==================================================== */
const estadoLogin = {};

bot.onText(/\/start/, async (msg) => {
  console.log('📩 /start recibido de', msg.from.id);

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

/* ====================================================
   7️⃣ CALLBACKS
==================================================== */
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

/* ====================================================
   8️⃣ CONTACTO (LOGIN)
==================================================== */
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

/* ====================================================
   9️⃣ ERRORES DE TELEGRAM
==================================================== */
bot.on('polling_error', (err) => {
  console.error('❌ Polling error:', err.message);
});
