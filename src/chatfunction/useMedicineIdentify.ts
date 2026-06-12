// src/chatfunction/useMedicineIdentify.ts
// 약 사진 촬영/선택 + 백엔드 약 식별 API 호출을 담당하는 공용 훅
// AI 등록 모달, AI 검색 모달에서 함께 사용합니다.
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert } from 'react-native';
import { auth } from '../../firebaseConfig';

// AiChatScreen.tsx / SummaryModal.tsx 와 동일한 서버 주소 규칙
export const SERVER_URL = process.env.EXPO_PUBLIC_API_URL;

export interface Candidate {
  masterId: number;
  medicineName: string;
  efficacy: string;
  reason: string;
}

export interface Features {
  shape: string;
  color: string;
  imprint: string;
  scoreLine: string;
}

export interface ManualInput {
  shape?: string;
  color?: string;
  imprint?: string;
  scoreLine?: string;
}

// 사진 한 장을 보관하는 형태 (화면 표시용 uri + 전송용 base64)
export interface PickedPhoto {
  uri: string;
  base64: string;
}

export function useMedicineIdentify(mode: 'register' | 'search') {
  const [front, setFront] = useState<PickedPhoto | null>(null);
  const [back, setBack] = useState<PickedPhoto | null>(null);
  const [loading, setLoading] = useState(false);
  const [features, setFeatures] = useState<Features | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);

  const uid = auth.currentUser?.uid;

  // 권한 요청 후 카메라 실행
  const takePhoto = async (side: 'front' | 'back') => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('권한 필요', '카메라 사용 권한을 허용해주세요.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      base64: true,
    });
    handleResult(result, side);
  };

  // 권한 요청 후 갤러리 실행
  const pickFromLibrary = async (side: 'front' | 'back') => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('권한 필요', '사진 보관함 접근 권한을 허용해주세요.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      base64: true,
    });
    handleResult(result, side);
  };

  const handleResult = (
    result: ImagePicker.ImagePickerResult,
    side: 'front' | 'back'
  ) => {
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const photo: PickedPhoto = {
      uri: asset.uri,
      base64: asset.base64 || '',
    };
    if (side === 'front') setFront(photo);
    else setBack(photo);
  };

  const reset = () => {
    setFront(null);
    setBack(null);
    setFeatures(null);
    setCandidates(null);
    setLoading(false);
  };

  // 사진 기반 식별 호출 (AI 등록 / AI 검색 공용)
  const identifyByPhoto = async () => {
    if (!uid) {
      Alert.alert('오류', '로그인 세션이 만료되었습니다.');
      return;
    }
    if (!front) {
      Alert.alert('알림', '약의 앞면 사진을 추가해주세요.');
      return;
    }
    setLoading(true);
    setCandidates(null);
    try {
      const res = await axios.post(`${SERVER_URL}/api/medicine/identify`, {
        userUid: uid,
        mode,
        frontImageBase64: front.base64,
        backImageBase64: back?.base64,
      });
      setFeatures(res.data.features || null);
      setCandidates(res.data.candidates || []);
    } catch (e) {
      console.error('약 식별 실패:', e);
      Alert.alert('에러', '약을 식별하지 못했습니다. 잠시 후 다시 시도해주세요.');
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  // 수동 입력값 기반 식별 (AI 검색의 '수동 검색' 용)
  const identifyByManual = async (manual: ManualInput) => {
    if (!uid) {
      Alert.alert('오류', '로그인 세션이 만료되었습니다.');
      return;
    }
    if (!manual.shape && !manual.color && !manual.imprint && !manual.scoreLine) {
      Alert.alert('알림', '약의 특징을 한 가지 이상 입력해주세요.');
      return;
    }
    setLoading(true);
    setCandidates(null);
    try {
      const res = await axios.post(`${SERVER_URL}/api/medicine/identify`, {
        userUid: uid,
        mode,
        manual,
      });
      setFeatures(res.data.features || null);
      setCandidates(res.data.candidates || []);
    } catch (e) {
      console.error('약 검색 실패:', e);
      Alert.alert('에러', '약을 검색하지 못했습니다. 잠시 후 다시 시도해주세요.');
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  return {
    front,
    back,
    loading,
    features,
    candidates,
    takePhoto,
    pickFromLibrary,
    identifyByPhoto,
    identifyByManual,
    reset,
  };
}
