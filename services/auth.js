const db = require('../db');

async function obtenerUsuario(telegramId) {
  const [[row]] = await db.query(
    'SELECT id, rol, plantel_id FROM usuarios WHERE telegram_id=? AND activo=1',
    [telegramId]
  );
  return row || null;
}

async function esAdmin(telegramId) {
  const user = await obtenerUsuario(telegramId);
  return user && (user.rol === 'ADMIN' || user.rol === 'SUPER_ADMIN');
}

async function esSuperAdmin(telegramId) {
  const user = await obtenerUsuario(telegramId);
  return user && user.rol === 'SUPER_ADMIN';
}

module.exports = {
  esAdmin,
  esSuperAdmin,
  obtenerUsuario
};
