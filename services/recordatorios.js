const cron = require('node-cron');
const db = require('../db');

function iniciarRecordatorios(bot) {

  // Corre todos los días a las 8:00 AM
  //cron.schedule('0 8 * * *', async () => {

    //corre el cron cada minuto
    cron.schedule('*/1 * * * *', async () => {

    const hoy = new Date().getDay(); // 0=Domingo, 1=Lunes...

    if (hoy === 0 || hoy === 6) return; // opcional: no fines

    const [alumnos] = await db.query(
      `SELECT telegram_id, nombre
       FROM usuarios
       WHERE rol='ALUMNO'
       AND activo=1
       AND dia_pago=? 
       AND telegram_id IS NOT NULL`,
      [hoy]
    );

    for (const alumno of alumnos) {
      bot.sendMessage(
        alumno.telegram_id,
        `💳 Hola ${alumno.nombre}\n\n` +
        `Hoy corresponde tu *pago semanal*.\n` +
        `Por favor realiza tu pago al llegar a clases.`,
        { parse_mode: 'Markdown' }
      );
    }

  });

}

module.exports = { iniciarRecordatorios };
