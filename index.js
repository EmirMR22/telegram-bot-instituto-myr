const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// DEBUG TOTAL
app.get('/', (req, res) => {
  res.json({
    PORT: process.env.PORT,
    BOT_TOKEN: process.env.BOT_TOKEN ? 'EXISTE ✅' : 'NO EXISTE ❌',
    ALL_ENV_KEYS: Object.keys(process.env).filter(k =>
      k.toLowerCase().includes('bot') ||
      k.toLowerCase().includes('telegram')
    )
  });
});

app.listen(PORT, () => {
  console.log('Servidor activo');
  console.log('BOT_TOKEN:', process.env.BOT_TOKEN);
});
