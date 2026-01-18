require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Importamos handlers
const adminHandler = require('./handlers/admin')(bot); // inicializa listeners solo 1 vez
require('./handlers/alumno')(bot);
require('./handlers/informes')(bot);


const estadoLogin = {};

bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    '🤖 *Bienvenido al SYS-BOT del Instituto de Estilismo y Barbería M&R*\n\nPor favor selecciona una opción:',
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

bot.on('contact', async (msg) => {
    const tgId = msg.from.id;
    const chatId = msg.chat.id;
    const tipo = estadoLogin[tgId];
    if (!tipo) return;

    const telefono = msg.contact.phone_number.replace(/\D/g, '');

    try {
        const [[usuario]] = await db.query('SELECT id, rol FROM usuarios WHERE telefono=? AND activo=1', [telefono]);

        if (!usuario) {
            delete estadoLogin[tgId];
            return await bot.sendMessage(chatId, '❌ Número no registrado.\nContacta a administración.', { reply_markup: { remove_keyboard: true } });
        }

        if (
            tipo === 'ADMIN' &&
            !['ADMIN', 'SUPER_ADMIN'].includes(usuario.rol)
        ) {
            delete estadoLogin[tgId];
            return await bot.sendMessage(
                chatId,
                '❌ No tienes permisos para este acceso.',
                { reply_markup: { remove_keyboard: true } }
            );
        }

        if (tipo === 'ALUMNO' && usuario.rol !== 'ALUMNO') {
            delete estadoLogin[tgId];
            return await bot.sendMessage(
                chatId,
                '❌ No tienes permisos para este acceso.',
                { reply_markup: { remove_keyboard: true } }
            );
        }


        await db.query('UPDATE usuarios SET telegram_id=? WHERE id=?', [tgId, usuario.id]);
        delete estadoLogin[tgId];

        await bot.sendMessage(chatId, '✅ Acceso concedido', { reply_markup: { remove_keyboard: true } });

        if (tipo === 'ADMIN' || tipo === 'SUPER_ADMIN') {
            // Aquí llamamos showAdminMenu sin crear listeners extra
            await adminHandler.showAdminMenu(bot, chatId, tgId);
        } else {
            bot.emit('alumno_menu', msg);
        }

    } catch (err) {
        console.error(err);
        delete estadoLogin[tgId];
        await bot.sendMessage(chatId, '❌ Error al validar acceso', { reply_markup: { remove_keyboard: true } });
    }
});
