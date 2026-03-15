import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator
} from 'react-native';

const LoginScreen = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('خطأ', 'الرجاء إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    setLoading(true);
    console.log('🔍 محاولة تسجيل الدخول:', username);

    try {
      const response = await fetch('http://localhost:3000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      console.log('📡 حالة الاستجابة:', response.status);
      const data = await response.json();
      console.log('📦 البيانات الواردة:', data);

      if (response.ok) {
        // تأكد من وجود data.player
        if (data.player && data.player.id) {
          console.log('✅ تم تسجيل الدخول بنجاح، معرف اللاعب:', data.player.id);
          navigation.replace('Game', {
            userId: data.player.id,
            username: data.player.username
          });
        } else {
          Alert.alert('خطأ', 'استجابة غير صالحة من الخادم');
        }
      } else {
        Alert.alert('خطأ', data.error || 'فشل تسجيل الدخول');
      }
    } catch (error) {
      console.error('❌ خطأ في الاتصال:', error);
      Alert.alert('خطأ', 'فشل الاتصال بالخادم. تأكد من أن الخادم يعمل على localhost:3000');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>⚡ THE UNDERWORLD ⚡</Text>
      <Text style={styles.subtitle}>عالم الجريمة ينتظرك</Text>

      <TextInput
        style={styles.input}
        placeholder="اسم المستخدم"
        placeholderTextColor="#999"
        value={username}
        onChangeText={setUsername}
      />

      <TextInput
        style={styles.input}
        placeholder="كلمة المرور"
        placeholderTextColor="#999"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity
        style={styles.loginButton}
        onPress={handleLogin}
        disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>تسجيل الدخول</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 40,
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#444',
  },
  loginButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default LoginScreen;