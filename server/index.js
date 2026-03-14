const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Game = require('./utils/gameLogic.js');
const GangSystem = require('./utils/gangSystem.js');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ========== البيانات المؤقتة ==========
let players = [];               // قائمة اللاعبين المسجلين
let waitingPlayers = [];         // قائمة اللاعبين المنتظرين (للبحث عن مباراة)
let activeGames = {};            // الألعاب النشطة (gameId -> Game object)
const gangSystem = new GangSystem(); // نظام العصابات

// ========== إدارة ربط socketId بمعرف اللاعب ==========
const socketToPlayer = new Map();   // socketId -> playerId
const playerToSocket = new Map();   // playerId -> socketId

// مفتاح سري (يُفضل وضعه في متغير بيئة)
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key-change-it';

// ========== دوال مساعدة ==========
function getPlayerIdFromSocket(socketId) {
  return socketToPlayer.get(socketId) || null;
}

function getSocketIdFromPlayerId(playerId) {
  return playerToSocket.get(playerId) || null;
}

function registerSocket(socketId, playerId) {
  socketToPlayer.set(socketId, playerId);
  playerToSocket.set(playerId, socketId);
}

function unregisterSocket(socketId) {
  const playerId = socketToPlayer.get(socketId);
  if (playerId) {
    playerToSocket.delete(playerId);
  }
  socketToPlayer.delete(socketId);
}

// ========== WebSocket ==========
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // تسجيل الدخول عبر WebSocket (بعد المصادقة عبر REST)
  socket.on('authenticate', ({ playerId, token }) => {
    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      if (decoded.id === playerId) {
        registerSocket(socket.id, playerId);
        socket.emit('authenticated', { success: true });
        console.log(`Player ${playerId} authenticated on socket ${socket.id}`);
      } else {
        socket.emit('authenticated', { success: false, error: 'Invalid token' });
      }
    } catch (err) {
      socket.emit('authenticated', { success: false, error: 'Authentication failed' });
    }
  });

  // انضمام لاعب للبحث عن مباراة
  socket.on('join-game', ({ playerId }) => {
    const player = players.find(p => p.id === playerId);
    if (!player) {
      socket.emit('error', 'Player not found');
      return;
    }

    // إذا كان هناك لاعب منتظر
    if (waitingPlayers.length > 0) {
      const opponent = waitingPlayers.shift();
      const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

      // إنشاء غرفة للمباراة
      socket.join(gameId);
      const opponentSocket = getSocketIdFromPlayerId(opponent.playerId);
      if (opponentSocket) {
        io.sockets.sockets.get(opponentSocket)?.join(gameId);
      }

      // إنشاء كائن اللعبة الجديد
      const game = new Game(playerId, opponent.playerId);
      game.startGame();
      activeGames[gameId] = game;

      // إرسال بداية المباراة لكل لاعب
      io.to(opponentSocket).emit('game-start', {
        gameId,
        opponent: player.username,
        yourTurn: (game.turn === opponent.playerId),
        state: game.getStateForPlayer(opponent.playerId)
      });

      io.to(socket.id).emit('game-start', {
        gameId,
        opponent: opponent.playerName,
        yourTurn: (game.turn === playerId),
        state: game.getStateForPlayer(playerId)
      });

      console.log(`Game started: ${playerId} vs ${opponent.playerId}`);
    } else {
      // لا يوجد لاعب منتظر، نضيف هذا اللاعب إلى قائمة الانتظار
      waitingPlayers.push({
        socketId: socket.id,
        playerId: playerId,
        playerName: player.username
      });
      socket.emit('waiting', 'جاري البحث عن خصم...');
    }
  });

  // تنفيذ نشاط إجرامي
  socket.on('perform-crime', ({ gameId, crimeType }) => {
    const game = activeGames[gameId];
    if (!game) {
      socket.emit('error', 'Game not found');
      return;
    }

    const playerId = getPlayerIdFromSocket(socket.id);
    if (!playerId) {
      socket.emit('error', 'Player not authenticated');
      return;
    }

    const result = game.performCrime(playerId, crimeType);

    // إرسال النتيجة للاعب الحالي
    socket.emit('crime-result', result);

    // إرسال التحديث للاعب الخصم
    if (result.newState) {
      const opponentId = Object.keys(game.players).find(id => id !== playerId);
      const opponentSocket = getSocketIdFromPlayerId(opponentId);
      if (opponentSocket) {
        io.to(opponentSocket).emit('game-update', result.newState);
      }
    }
  });

  // إنهاء الدور
  socket.on('end-turn', ({ gameId }) => {
    const game = activeGames[gameId];
    if (!game) {
      socket.emit('error', 'Game not found');
      return;
    }

    const playerId = getPlayerIdFromSocket(socket.id);
    if (!playerId) {
      socket.emit('error', 'Player not authenticated');
      return;
    }

    const result = game.endTurn(playerId);

    if (result.success) {
      // إرسال تحديث للاعب الجديد
      const newTurnPlayerSocket = getSocketIdFromPlayerId(result.newTurn);
      if (newTurnPlayerSocket) {
        io.to(newTurnPlayerSocket).emit('turn-notification', {
          message: 'إنه دورك الآن!',
          state: result.state
        });
      }

      // إعلام اللاعب القديم
      socket.emit('turn-ended', { message: result.message });
    } else {
      socket.emit('error', result.message);
    }
  });

  // قطع الاتصال
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // إزالة اللاعب من قائمة الانتظار إذا كان موجوداً
    waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
    // إزالة الربط
    unregisterSocket(socket.id);
    // TODO: التعامل مع انسحاب لاعب من مباراة نشطة (إعلان فوز الخصم)
  });
});

// ========== مسارات API (REST) ==========

// تسجيل حساب جديد
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
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

// مسار محمي: الحصول على الملف الشخصي
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

// ========== مسارات العصابات (Gang System) ==========

// إنشاء عصابة جديدة
app.post('/api/gangs/create', (req, res) => {
  const { playerId, gangName, playerName } = req.body;
  // التحقق من وجود اللاعب
  const player = players.find(p => p.id === playerId);
  if (!player) {
    return res.status(404).json({ success: false, message: 'Player not found' });
  }
  const result = gangSystem.createGang(playerId, gangName, playerName);
  res.json(result);
});

// إرسال دعوة للانضمام إلى عصابة
app.post('/api/gangs/invite', (req, res) => {
  const { gangId, leaderId, targetPlayerId, targetPlayerName } = req.body;
  const result = gangSystem.sendInvitation(gangId, leaderId, targetPlayerId, targetPlayerName);
  res.json(result);
});

// قبول دعوة
app.post('/api/gangs/accept', (req, res) => {
  const { playerId, gangId } = req.body;
  const result = gangSystem.acceptInvitation(playerId, gangId);
  res.json(result);
});

// الحصول على معلومات عصابة اللاعب
app.get('/api/gangs/player/:playerId', (req, res) => {
  const gang = gangSystem.getPlayerGang(req.params.playerId);
  if (gang) {
    res.json({ success: true, gang });
  } else {
    res.json({ success: false, message: 'اللاعب ليس عضواً في أي عصابة' });
  }
});

// الحصول على معلومات عصابة محددة
app.get('/api/gangs/:gangId', (req, res) => {
  const gang = gangSystem.getGangInfo(req.params.gangId);
  if (gang) {
    res.json({ success: true, gang });
  } else {
    res.status(404).json({ success: false, message: 'عصابة غير موجودة' });
  }
});

// الحصول على إحصائيات عصابة
app.get('/api/gangs/:gangId/stats', (req, res) => {
  const stats = gangSystem.getGangStats(req.params.gangId);
  if (stats) {
    res.json({ success: true, stats });
  } else {
    res.status(404).json({ success: false, message: 'عصابة غير موجودة' });
  }
});

// المساهمة في خزينة العصابة
app.post('/api/gangs/contribute', (req, res) => {
  const { playerId, gangId, amount } = req.body;
  const player = players.find(p => p.id === playerId);
  if (!player) {
    return res.status(404).json({ success: false, message: 'Player not found' });
  }
  if (player.money < amount) {
    return res.json({ success: false, message: 'لا تملك هذا المبلغ' });
  }
  const result = gangSystem.contributeToGang(gangId, playerId, amount, 0);
  if (result.success) {
    player.money -= amount;
  }
  res.json(result);
});

// الصفحة الرئيسية
app.get('/', (req, res) => res.send('The Underworld API'));

// بدء الخادم
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});