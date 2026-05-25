const express = require('express');
const path = require('path');
const { getDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

getDb();

app.use('/api', require('./routes/menu'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`POS Server running at http://localhost:${PORT}`);
});
