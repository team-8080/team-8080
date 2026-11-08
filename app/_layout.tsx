// app/_layout.tsx
import { Stack, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { auth } from '../firebaseConfig'; // 우리가 만든 설정

export default function RootLayout() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const segments = useSegments(); // 현재 사용자가 있는 위치 (경로) 확인

  // 1. 로그인 상태 감시 (MySQL의 세션 체크와 비슷함)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (initializing) setInitializing(false);
    });

    return unsubscribe;
  }, []);

  // 2. 상태에 따라 페이지 자동 이동
  useEffect(() => {
    if (initializing) return;

    const inAuthGroup = segments[0] === '(tabs)'; // 현재 탭 화면에 있는지 확인

    if (!user && inAuthGroup) {
      // 로그인이 안 됐는데 탭(메인)에 가려고 하면 로그인으로 이동
      router.replace('/login');
    } else if (user && !inAuthGroup) {
      // 로그인이 됐는데 로그인 페이지에 있으면 메인으로 이동
      router.replace('/(tabs)');
    }
  }, [user, initializing, segments]);

  // 로딩 중일 때 보여줄 화면
  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1A73E8" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}