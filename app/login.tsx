import axios from 'axios'; // ★ 추가됨
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import React, { useState } from 'react';
import { auth, db } from '../firebaseConfig';

import {
  ActivityIndicator,
  Alert, // ★ 추가됨
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

// 서버 주소 설정 (에뮬레이터 환경 대응)
const SERVER_URL = process.env.EXPO_PUBLIC_API_URL

export default function AuthScreen() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isGuardian, setIsGuardian] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleAuth = async () => {
    if (!email || !password) {
      return Alert.alert("알림", "이메일과 비밀번호를 입력해주세요.");
    }

    setLoading(true);
    try {
      if (isLoginMode) {
        // Firebase 로그인
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const fbUser = userCredential.user;
        console.log("Firebase 로그인 성공:", fbUser.uid);

        // MySQL 서버 로그인
        try {

          const response = await axios.post(`${SERVER_URL}/api/login`, {
            userId: email,
            password: password
          });

          const userData = response.data.user;
          console.log("✅ MySQL 로그인 성공! 역할:", userData.role);
          
          router.replace('/(tabs)'); 
        } catch (mysqlError) {
          console.error("❌ MySQL 로그인 실패:", mysqlError);
          Alert.alert("로그인 오류", "등록된 사용자 정보를 찾을 수 없습니다.");
        }
    } else {
        //[2] 회원가입: 하이브리드 로직 실행 
        
        // A. Firebase Auth 계정 생성 (인증용)
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // B. MySQL 서버에 사용자 정보 저장 (Node.js API 호출)
        try {
          await axios.post(`${SERVER_URL}/api/signup`, {
            userId: email,
            password: password, // 실무에선 암호화 필요
            name: name,
            phone: phone, // ★ 이 줄이 빠져있었습니다! 꼭 추가해주세요.
            role: isGuardian ? 'protector' : 'senior'
          });
          console.log("MySQL 저장 완료!");
        } catch (mysqlError) {
          console.error("MySQL 저장 실패:", mysqlError);
          // MySQL 저장 실패 시 사용자에게 알림 (필요 시 Firebase 계정 삭제 로직 추가 가능)
        }

        // C. Firebase Realtime Database에 실시간 설정값 저장 (기존 로직 유지)
        await set(ref(db, 'users/' + user.uid), {
          profile: {
            email: email,
            name: name,
            phone: phone,
            isGuardian: isGuardian,
            createdAt: new Date().toISOString(),
          },
          settings: {
            pushEnabled: true,
            buzzerEnabled: true,
            ledEnabled: true,
            ledLevel: 1
          }
        });

        Alert.alert("성공", "회원가입이 완료되었습니다!");
        router.replace('/(tabs)');
      }
    } catch (error: any) { // 여기에 : any 를 추가합니다.
      console.error(error);
      // 이제 error.message를 마음껏 쓸 수 있습니다.
      Alert.alert("에러 발생", error.message || "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* 아까 확인하신 그 글자 부분입니다! */}
      <Text style={styles.title}></Text>
      
      <TextInput 
        placeholder="이메일" 
        style={styles.input} 
        onChangeText={setEmail} 
        autoCapitalize="none" 
        keyboardType="email-address"
      />
      <TextInput 
        placeholder="비밀번호" 
        style={styles.input} 
        secureTextEntry 
        onChangeText={setPassword} 
      />

      {!isLoginMode && (
        <>
          <TextInput placeholder="이름" style={styles.input} onChangeText={setName} />
          <TextInput placeholder="전화번호" style={styles.input} onChangeText={setPhone} keyboardType="phone-pad" />
          <View style={styles.switchRow}>
            <Text>보호자이신가요?</Text>
            <Switch value={isGuardian} onValueChange={setIsGuardian} />
          </View>
        </>
      )}

      <TouchableOpacity 
        style={[styles.mainButton, { opacity: loading ? 0.7 : 1 }]} 
        onPress={handleAuth}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{isLoginMode ? '로그인하기' : '가입 완료'}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)} style={{ marginTop: 20 }}>
        <Text style={styles.toggleText}>
          {isLoginMode ? "계정이 없으신가요? 회원가입" : "이미 계정이 있나요? 로그인"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 40, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 50, textAlign: 'center', color: '#1A73E8' },
  input: { borderBottomWidth: 1.5, borderColor: '#F0F0F0', marginBottom: 30, paddingVertical: 12, fontSize: 16 },
  mainButton: { backgroundColor: '#1A73E8', paddingVertical: 18, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  toggleText: { color: '#888', textAlign: 'center', fontSize: 15, marginTop: 10, textDecorationLine: 'underline' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 35 }
});