const db = require('../db');

module.exports = (bot) => {

  bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const tgId = q.from.id;

    if (q.data !== 'menu_alumno') return;

    const [[u]] = await db.query(
      "SELECT id FROM usuarios WHERE telegram_id=?",
      [tgId]
    );

    if (!u) {
      return bot.sendMessage(chatId, '❌ No estás registrado');
    }

    const [pagos] = await db.query(
      "SELECT fecha_semana,monto FROM pagos WHERE usuario_id=? ORDER BY fecha_semana DESC",
      [u.id]
    );

    if (!pagos.length) {
      return bot.sendMessage(chatId, 'ℹ️ Aún no tienes pagos registrados');
    }

    let txt = '📄 Tus pagos:\n\n';
    pagos.forEach(p => {
      txt += `📅 ${p.fecha_semana} — $${p.monto}\n`;
    });

    bot.sendMessage(chatId, txt);
  });
};
