const express = require('express');
const path = require('path');
const { getDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(require('express-session')({
  secret: 'pos-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 86400000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

getDb();

app.use('/api/public', require('./routes/public'));
app.use('/api', require('./routes/auth').router);
app.use('/api', require('./routes/tenants'));
app.use('/api', require('./routes/menu'));
app.use('/api', require('./routes/orders'));
app.use('/api', require('./routes/reports'));
app.use('/api', require('./routes/settings'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`POS Server running at http://localhost:${PORT}`);
});
