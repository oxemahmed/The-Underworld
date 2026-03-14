import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import socketManager from '../services/socket';

const GameScreen = ({ route, navigation }) => {
  const { userId, username } = route.params;
  const [gameState, setGameState] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [opponent, setOpponent] = useState('');
  const [isYourTurn, setIsYourTurn] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // الاتصال بالخادم
    socketManager.connect(userId, username);

    // استماع للأحداث
    socketManager.on('waiting', (msg) => {
      setWaiting(true);
    });

    socketManager.on('game-start', (data) => {
      setWaiting(false);
      setGameId(data.gameId);
      setOpponent(data.opponent);
      setIsYourTurn(data.yourTurn);
      setGameState(data.state);
    });

    socketManager.on('game-update', (state) => {
      setGameState(state);
    });

    socketManager.on('crime-result', (result) => {
      setLoading(false);
      Alert.alert(result.success ? '✅ نجاح' : '❌ فشل', result.message);
      if (result.newState) {
        setGameState(result.newState);
      }
    });

    socketManager.on('turn-notification', (data) => {
      setIsYourTurn(true);
      Alert.alert('🎲 دورك الآن!', data.message);
      setGameState(data.state);
    });

    socketManager.on('error', (msg) => {
      Alert.alert('خطأ', msg);
    });

    return () => {
      socketManager.disconnect();
    };
  }, []);

  const performCrime = (crimeType) => {
    if (!isYourTurn) {
      Alert.alert('تنبيه', 'ليس دورك الآن');
      return;
    }
    setLoading(true);
    socketManager.performCrime(gameId, crimeType);
  };

  const endTurn = () => {
    if (!isYourTurn) {
      Alert.alert('تنبيه', 'ليس دورك الآن');
      return;
    }
    socketManager.endTurn(gameId);
    setIsYourTurn(false);
  };

  if (waiting) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FFD700" />
        <Text style={styles.waitingText}>جاري البحث عن خصم...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>⚔️ THE UNDERWORLD ⚔️</Text>
        <Text style={styles.opponent}>الخصم: {opponent}</Text>
        <Text style={[styles.turn, isYourTurn ? styles.yourTurn : styles.opponentTurn]}>
          {isYourTurn ? '🎲 دورك' : '⏳ دور الخصم'}
        </Text>
      </View>

      {gameState && (
        <View style={styles.gameInfo}>
          <View style={styles.resourcesBox}>
            <Text style={styles.sectionTitle}>مواردي</Text>
            <Text>💰 المال: {gameState.you.resources.money}$</Text>
            <Text>⭐ السمعة: {gameState.you.resources.reputation}</Text>
            <Text>📊 المستوى: {gameState.you.stats.level}</Text>
            <Text>🎯 الخبرة: {gameState.you.stats.xp}/100</Text>
          </View>

          <View style={styles.opponentBox}>
            <Text style={styles.sectionTitle}>موارد الخصم</Text>
            <Text>💰 المال: {gameState.opponent.resources.money}$</Text>
            <Text>📊 المستوى: {gameState.opponent.stats.level}</Text>
          </View>
        </View>
      )}

      <View style={styles.actionsBox}>
        <Text style={styles.sectionTitle}>أنشطة إجرامية</Text>
        
        <TouchableOpacity
          style={[styles.crimeButton, styles.robbery]}
          onPress={() => performCrime('robbery')}
          disabled={loading || !isYourTurn}>
          <Text style={styles.buttonText}>💰 سرقة بنك</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.crimeButton, styles.smuggling]}
          onPress={() => performCrime('smuggling')}
          disabled={loading || !isYourTurn}>
          <Text style={styles.buttonText}>📦 تهريب</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.crimeButton, styles.extortion]}
          onPress={() => performCrime('extortion')}
          disabled={loading || !isYourTurn}>
          <Text style={styles.buttonText}>😠 ابتزاز</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.crimeButton, styles.heist]}
          onPress={() => performCrime('heist')}
          disabled={loading || !isYourTurn}>
          <Text style={styles.buttonText}>💎 سرقة كبرى</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.endTurnButton}
          onPress={endTurn}
          disabled={loading || !isYourTurn}>
          <Text style={styles.buttonText}>🔚 إنهاء الدور</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  waitingText: {
    color: '#FFD700',
    fontSize: 18,
    marginTop: 20,
  },
  header: {
    padding: 20,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#FFD700',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 10,
  },
  opponent: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 5,
  },
  turn: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 5,
  },
  yourTurn: {
    color: '#4CAF50',
  },
  opponentTurn: {
    color: '#f44336',
  },
  gameInfo: {
    padding: 20,
  },
  resourcesBox: {
    backgroundColor: '#2a2a2a',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  opponentBox: {
    backgroundColor: '#2a2a2a',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#666',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 10,
  },
  actionsBox: {
    padding: 20,
  },
  crimeButton: {
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  robbery: {
    backgroundColor: '#4CAF50',
  },
  smuggling: {
    backgroundColor: '#2196F3',
  },
  extortion: {
    backgroundColor: '#FF9800',
  },
  heist: {
    backgroundColor: '#f44336',
  },
  endTurnButton: {
    backgroundColor: '#9C27B0',
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default GameScreen;