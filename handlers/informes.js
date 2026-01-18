const db = require('../db');

module.exports = function (bot) {

  const estadoWhatsapp = {};

  bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    await bot.answerCallbackQuery(q.id);

    // ===== MENÚ INFORMES =====
    if (q.data === 'info_menu') {
      return bot.sendMessage(chatId, 'ℹ️ *Información General*', {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏫 Planteles', callback_data: 'info_planteles' }],
            [{ text: '🎓 Carreras', callback_data: 'info_carreras' }],
            [{ text: '💰 Costos', callback_data: 'info_costos' }],
            [{ text: '📍 Contacto', callback_data: 'info_contacto' }],
            [{ text: '⬅️ Volver', callback_data: 'start_menu' }]
          ]
        }
      });
    }

    // ===== PLANTELES =====
    if (q.data === 'info_planteles') {
      const [rows] = await db.query('SELECT id, nombre, direccion, telefono FROM planteles WHERE activo=1');
      const keyboard = rows.map(p => [{ text: p.nombre, callback_data: `info_plantel_${p.id}` }]);
      keyboard.push([{ text: '⬅️ Volver', callback_data: 'info_menu' }]);
      return bot.sendMessage(chatId, '🏫 *Nuestros planteles*', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });
    }

    if (q.data.startsWith('info_plantel_')) {
      const id = q.data.split('_')[2];
      const [[plantel]] = await db.query('SELECT nombre, direccion, telefono FROM planteles WHERE id=?', [id]);
      return bot.sendMessage(chatId,
        `🏫 *${plantel.nombre}*\n📍 Dirección: ${plantel.direccion}\n📞 Tel: ${plantel.telefono}`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Volver', callback_data: 'info_planteles' }]] }
        }
      );
    }

    // ===== CARRERAS =====
    if (q.data === 'info_carreras') {
      const [rows] = await db.query('SELECT id, nombre, descripcion FROM carreras WHERE activo=1');
      const keyboard = rows.map(c => [{ text: c.nombre, callback_data: `info_carrera_${c.id}` }]);
      keyboard.push([{ text: '⬅️ Volver', callback_data: 'info_menu' }]);
      return bot.sendMessage(chatId, '🎓 *Carreras disponibles*', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });
    }

    if (q.data.startsWith('info_carrera_')) {
      const id = q.data.split('_')[2];
      const [[carrera]] = await db.query('SELECT nombre, descripcion FROM carreras WHERE id=?', [id]);
      return bot.sendMessage(chatId,
        `🎓 *${carrera.nombre}*\n\n${carrera.descripcion}`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Volver', callback_data: 'info_carreras' }]] }
        }
      );
    }

    // ===== COSTOS =====
    if (q.data === 'info_costos') {
      return bot.sendMessage(chatId,
        '💰 *Costos*\n\n✂️ Para conocer nuestros costos por favor comunícate con uno de nuestros asesores\n📆 Pagos semanales',
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '⬅️ Volver', callback_data: 'info_menu' }]] } }
      );
    }

    // ===== CONTACTO =====
    if (q.data === 'info_contacto') {
      const [planteles] = await db.query('SELECT nombre, telefono FROM planteles WHERE activo=1');
      const keyboard = planteles.map(p => [{ text: `💬 WhatsApp ${p.nombre}`, callback_data: `info_whatsapp_${p.telefono}` }]);
      keyboard.push([{ text: '⬅️ Volver', callback_data: 'info_menu' }]);
      return bot.sendMessage(chatId,
        '📍 *Contacto*\n\nSelecciona el plantel con el que deseas comunicarte por WhatsApp:',
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
      );
    }

    // ===== FORMULARIO WHATSAPP =====
    if (q.data.startsWith('info_whatsapp_')) {
      const telefono = q.data.split('_')[2];
      estadoWhatsapp[chatId] = { paso: 'carrera', telefono };
      const [carreras] = await db.query('SELECT id, nombre FROM carreras WHERE activo=1');
      return bot.sendMessage(chatId, '💬 Selecciona la carrera que te interesa:', {
        reply_markup: { inline_keyboard: carreras.map(c => [{ text: c.nombre, callback_data: `ws_carrera_${c.id}` }]) }
      });
    }

    // Selección carrera
    if (q.data.startsWith('ws_carrera_')) {
      const chat = estadoWhatsapp[chatId];
      chat.carrera_id = q.data.split('_')[2];
      const [[carrera]] = await db.query('SELECT nombre FROM carreras WHERE id=?', [chat.carrera_id]);
      chat.carrera_nombre = carrera.nombre;

      chat.paso = 'plantel';
      const [planteles] = await db.query('SELECT id, nombre FROM planteles WHERE activo=1');
      return bot.sendMessage(chatId, '🏫 Selecciona el plantel que te interesa:', {
        reply_markup: { inline_keyboard: planteles.map(p => [{ text: p.nombre, callback_data: `ws_plantel_${p.id}` }]) }
      });
    }

    // Selección plantel
    if (q.data.startsWith('ws_plantel_')) {
      const chat = estadoWhatsapp[chatId];
      chat.plantel_id = q.data.split('_')[2];
      const [[plantel]] = await db.query('SELECT nombre FROM planteles WHERE id=?', [chat.plantel_id]);
      chat.plantel_nombre = plantel.nombre;

      chat.paso = 'nombre';
      return bot.sendMessage(chatId, '✍️ Ingresa tu nombre completo:');
    }

    // Botones de edición directa
    if (q.data === 'ws_editar_carrera') {
      estadoWhatsapp[chatId].paso = 'carrera';
      const [carreras] = await db.query('SELECT id, nombre FROM carreras WHERE activo=1');
      return bot.sendMessage(chatId, '💬 Selecciona nuevamente la carrera:', {
        reply_markup: { inline_keyboard: carreras.map(c => [{ text: c.nombre, callback_data: `ws_carrera_${c.id}` }]) }
      });
    }

    if (q.data === 'ws_editar_plantel') {
      estadoWhatsapp[chatId].paso = 'plantel';
      const [planteles] = await db.query('SELECT id, nombre FROM planteles WHERE activo=1');
      return bot.sendMessage(chatId, '🏫 Selecciona nuevamente el plantel:', {
        reply_markup: { inline_keyboard: planteles.map(p => [{ text: p.nombre, callback_data: `ws_plantel_${p.id}` }]) }
      });
    }

    // Confirmar y generar WhatsApp
    if (q.data === 'ws_confirmar') {
      const chat = estadoWhatsapp[chatId];
      await db.query('INSERT INTO prospectos (nombre, carrera_id, plantel_id) VALUES (?,?,?)', [chat.nombre, chat.carrera_id, chat.plantel_id]);

      const waText = `Hola, soy *${chat.nombre}* y me interesa la carrera de *${chat.carrera_nombre}* en el plantel *${chat.plantel_nombre}*`;
      const waUrl = `https://wa.me/52${chat.telefono}?text=${encodeURIComponent(waText)}`;

      delete estadoWhatsapp[chatId];

      return bot.sendMessage(chatId,
        `✅ Gracias por completar tu solicitud.\n\n` +
        `💬 Puedes enviar tu mensaje por WhatsApp haciendo clic en el botón de abajo:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💬 Enviar por WhatsApp', url: waUrl }],
              [{ text: '⬅️ Volver al menú', callback_data: 'info_menu' }]
            ]
          }
        }
      );
    }

  });

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const chat = estadoWhatsapp[chatId];
    if (!chat) return;

    if (chat.paso === 'nombre') {
      if (!msg.text || !msg.text.trim()) return bot.sendMessage(chatId, '❌ Debes ingresar un nombre válido');
      chat.nombre = msg.text.trim();

      // Resumen final con botones de edición directa
      return bot.sendMessage(chatId,
        `💬 *Resumen de tu solicitud*\n\n` +
        `🎓 Carrera: ${chat.carrera_nombre}\n` +
        `🏫 Plantel: ${chat.plantel_nombre}\n` +
        `✍️ Nombre: ${chat.nombre}`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Editar Carrera', callback_data: 'ws_editar_carrera' }],
              [{ text: 'Editar Plantel', callback_data: 'ws_editar_plantel' }],
              [{ text: '✅ Enviar', callback_data: 'ws_confirmar' }],
              [{ text: '⬅️ Volver', callback_data: 'info_menu' }]
            ]
          }
        }
      );
    }
  });

};
