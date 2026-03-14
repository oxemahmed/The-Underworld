import io from 'socket.io-client';
import { Platform } from 'react-native';

// استخدم عنوان الخادم المحلي أو العام حسب البيئة
const SERVER_URL = Platform.OS === 'android' 
  ? 'http://10.0.2.2:3000'  // للأندرويد (محاكي)
  : 'http://localhost:3000'; // للآيفون أو الويب

class SocketManager {
  constructor() {
    this.socket = null;
    this.listeners = {};
  }

  connect(userId, username) {
    this.socket = io(SERVER_URL);
    
    this.socket.on('connect', () => {
      console.log('Connected to server');
      // الانضمام للعبة بعد الاتصال
      this.socket.emit('join-game', { playerId: userId, playerName: username });
    });

    this.socket.on('waiting', (msg) => {
      this.emit('waiting', msg);
    });

    this.socket.on('game-start', (data) => {
      this.emit('game-start', data);
    });

    this.socket.on('game-update', (data) => {
      this.emit('game-update', data);
    });

    this.socket.on('crime-result', (data) => {
      this.emit('crime-result', data);
    });

    this.socket.on('turn-notification', (data) => {
      this.emit('turn-notification', data);
    });

    this.socket.on('error', (msg) => {
      this.emit('error', msg);
    });
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  performCrime(gameId, crimeType) {
    if (this.socket) {
      this.socket.emit('perform-crime', { gameId, crimeType });
    }
  }

  endTurn(gameId) {
    if (this.socket) {
      this.socket.emit('end-turn', { gameId });
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

export default new SocketManager();