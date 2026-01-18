const estados = {};

function iniciar(telegramId) {
  estados[telegramId] = {};
}

function setCampo(telegramId, campo, valor) {
  estados[telegramId][campo] = valor;
}

function getEstado(telegramId) {
  return estados[telegramId];
}

function limpiar(telegramId) {
  delete estados[telegramId];
}

module.exports = {
  iniciar,
  setCampo,
  getEstado,
  limpiar
};
