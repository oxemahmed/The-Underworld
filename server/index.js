const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Game = require('./utils/gameLogic.js'); // استيراد منطق اللعبة

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// بيانات مؤقتة (سنستبدلها بقاعدة بيانات لاحقاً)
let players = [];
let waitingPlayers = []; // قائمة اللاعبين المنتظرين
let activeGames = {}; // الألعاب النشطة (gameId -> Game object)

const SECRET_KEY = 'your-secret-key-change-it'; // غيّر هذا بمفتاح سري قوي

// ========== WebSocket للاتصال المباشر ==========
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // انضمام لاعب للبحث عن مباراة
  socket.on('join-game', ({ playerId, playerName }) => {
    console.log(`Player ${playerName} (${playerId}) is looking for a game`);
    
    // التحقق من وجود اللاعب في قائمة اللاعبين
    const player = players.find(p => p.id === playerId);
    if (!player) {
      socket.emit('error', 'Player not found');
      return;
    }

    // إذا كان هناك لاعب منتظر
    if (waitingPlayers.length > 0) {
      const opponent = waitingPlayers.shift(); // لاعب منتظر
      const gameId = `game_${Date.now()}`;

      // إنشاء غرفة للمباراة
      socket.join(gameId);
      io.sockets.sockets.get(opponent.socketId)?.join(gameId);

      // إنشاء كائن اللعبة الجديد
      const game = new Game(playerId, opponent.playerId);
      game.startGame();
      activeGames[gameId] = game;

      // إرسال بداية المباراة لكل لاعب مع الحالة
      io.to(opponent.socketId).emit('game-start', {
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
        playerName: playerName
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

    // الحصول على معرف اللاعب (يجب تخزينه عند الاتصال)
    const playerId = getPlayerIdFromSocket(socket.id); // تحتاج لتنفيذ هذه الدالة
    if (!playerId) {
      socket.emit('error', 'Player not identified');
      return;
    }

    const result = game.performCrime(playerId, crimeType);
    
    // إرسال النتيجة للاعب الحالي
    socket.emit('crime-result', result);
    
    // إرسال التحديث للاعب الخصم
    if (result.newState) {
      const opponentId = Object.keys(game.players).find(id => id !== playerId);
      const opponentSocket = getSocketIdFromPlayerId(opponentId); // تحتاج لتنفيذ هذه الدالة
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
      socket.emit('error', 'Player not identified');
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
    // TODO: التعامل مع انسحاب لاعب من مباراة نشطة
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

// ========== دوال مساعدة (يجب تطويرها) ==========
function getPlayerIdFromSocket(socketId) {
  // TODO: ربط socketId بمعرف اللاعب
  // يمكن استخدام Map أو تخزينه عند الاتصال
  return null; // مؤقتاً
}

function getSocketIdFromPlayerId(playerId) {
  // TODO: العثور على socketId من معرف اللاعب
  return null; // مؤقتاً
}

// بدء الخادم
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});