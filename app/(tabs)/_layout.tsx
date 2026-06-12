// cd server
// nodemon index.js

// npx expo start  
// npx expo run:android

import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Tabs } from 'expo-router';
// 🌟 추가: onAuthStateChanged 임포트
import { onAuthStateChanged } from 'firebase/auth';
import { onValue, ref } from 'firebase/database';
import { useEffect, useState } from 'react';
import { Alert, TouchableOpacity } from 'react-native';
import { auth, db } from '../../firebaseConfig';

export default function TabLayout() {
  const [isLocked, setIsLocked] = useState(false);
  
  // 모니터링 탭 조건부 렌더링용 상태
  const [userRole, setUserRole] = useState<string | null>(null);
  const [hasSenior, setHasSenior] = useState(false);

  // 🌟 수정: Firebase 인증 상태를 안전하게 기다렸다가 감시
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      // AsyncStorage에서 먼저 가져와보고, 없으면 파이어베이스 user.uid 사용
      let uid = await AsyncStorage.getItem('userId');
      if (!uid && user) {
        uid = user.uid;
      }

      // 유저 정보가 확실히 로딩되었을 때만 실행!
      if (uid) {
        // 1. 잠금 상태 감시
        const lockRef = ref(db, `users/${uid}/settings/isLocked`);
        onValue(lockRef, (snap) => setIsLocked(snap.val() || false));

        // 2. 권한 및 등록 어르신 유무 확인
        checkUserStatus(uid);
      }
    });

    return () => unsubscribeAuth(); // 컴포넌트 꺼질 때 감시 종료
  }, []);

const checkUserStatus = async (uid: string) => {
    try {
      const baseUrl = process.env.EXPO_PUBLIC_API_URL;
      console.log(`🧐 [DB 직접 조회] 어르신 연결 여부 묻기 (대상 UID: ${uid})`);
      
      // 🌟 핵심: AsyncStorage의 role 값을 믿지 않고 무조건 백엔드에 찔러봅니다.
      const response = await axios.get(`${baseUrl}/api/relation/check/${uid}`);
      console.log("🧐 [백엔드 응답]:", response.data);
      
      // DB 확인 결과, 이 유저가 관리하는 어르신이 있다면?
      if (response.data.hasSenior) {
        setUserRole('protector'); // 강제로 보호자 역할로 덮어씌움
        setHasSenior(true);       // 탭 열기 스위치 ON
        console.log("🟢 성공! 관리하는 어르신이 DB에서 확인되어 모니터링 탭을 엽니다.");
      } else {
        console.log("🔴 관리하는 어르신이 DB에 없습니다.");
      }
    } catch (error) {
      console.error('❌ 상태 확인 실패:', error);
    }
  };

  // 잠금 시 클릭 가로채는 공통 함수
  const lockListener = (props: any) => (
    <TouchableOpacity 
      {...props} 
      onPress={(e) => {
        if (isLocked) {
          Alert.alert("화면 잠금", "자물쇠를 눌러 잠금을 해제해야 이동할 수 있습니다.");
        } else {
          props.onPress?.(e);
        }
      }} 
    />
  );

  return (
    <Tabs screenOptions={{ 
      tabBarActiveTintColor: '#000', 
      headerShown: false,
      tabBarStyle: { height: 90, paddingBottom: 10 }
    }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="home" size={28} color={color} />,
        }}
      />

      <Tabs.Screen
        name="register"
        options={{
          title: '약 등록',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="plus-circle-outline" size={28} color={color} />,
          tabBarButton: lockListener, // 잠금 적용
        }}
      />

      {/* 🌟 수정: 모니터링 탭 (보호자 && 등록 어르신 있을 때만 표시) */}
      <Tabs.Screen
        name="monitor"
        options={{
          title: '모니터링',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="heart-pulse" size={28} color={color} />,
          
          ...(userRole === 'protector' && hasSenior
            ? {
                tabBarButton: lockListener,
              }
            : {
                href: null as any,
              }
          ),
        }}
      />

      <Tabs.Screen
        name="explore" 
        options={{
          title: '통계',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="chart-bar" size={28} color={color} />,
          tabBarButton: lockListener, // 잠금 적용
        }}
      />

      <Tabs.Screen
        name="chat" 
        options={{
          title: '채팅',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="chat-processing-outline" size={28} color={color} />
          ),
          tabBarButton: lockListener,
        }}
      />

      <Tabs.Screen
        name="setting"
        options={{
          title: '설정',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="cog" size={28} color={color} />,
          tabBarButton: lockListener, // 잠금 적용
        }}
      />
    </Tabs>
  );
}