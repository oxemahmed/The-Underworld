const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// بيانات مؤقتة (سنستبدلها بقاعدة بيانات لاحقاً)
let players = [];
const SECRET_KEY = 'your-secret-key-change-it'; // غيّر هذا بمفتاح سري قوي

// WebSocket للاتصال المباشر
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ========== مسارات API ==========

// تسجيل حساب جديد
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    // التحقق من وجود المستخدم
    if (players.find(p => p.username === username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newPlayer = {
      id: players.length + 1,
      username,
      password: hashedPassword,
      money: 1000,
      level: 1,
      reputation: 0
    };
    players.push(newPlayer);
    res.status(201).json({ 
      message: 'Player created', 
      player: { id: newPlayer.id, username: newPlayer.username, money: newPlayer.money, level: newPlayer.level } 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const player = players.find(p => p.username === username);
    if (!player) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, player.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: player.id, username: player.username }, SECRET_KEY);
    res.json({ 
      token, 
      player: { id: player.id, username: player.username, money: player.money, level: player.level, reputation: player.reputation } 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// مسار اختبار محمي (يتطلب توكن)
app.get('/api/profile', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const player = players.find(p => p.id === decoded.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    res.json({ id: player.id, username: player.username, money: player.money, level: player.level });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// الصفحة الرئيسية
app.get('/', (req, res) => res.send('The Underworld API'));

// بدء الخادم
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});