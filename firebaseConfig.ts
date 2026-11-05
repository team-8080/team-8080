import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// 1. Firebase 앱 초기화
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// 2. 인증(Auth) 객체 초기화 (가장 안전한 방식)
let tempAuth: any;

try {
  // 이미 인증 객체가 생성되어 있는지 확인합니다.
  tempAuth = (FirebaseAuth as any).getAuth(app);
} catch (e) {
  // 생성되어 있지 않다면 Persistence(로그인 유지) 설정과 함께 초기화합니다.
  tempAuth = (FirebaseAuth as any).initializeAuth(app, {
    persistence: (FirebaseAuth as any).getReactNativePersistence(ReactNativeAsyncStorage),
  });
}

export const auth = tempAuth;
export const db = getDatabase(app);
export default app;