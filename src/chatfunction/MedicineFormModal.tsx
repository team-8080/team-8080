// src/chatfunction/MedicineFormModal.tsx
// 약 정보 등록 폼 (기존 register.tsx 의 등록 모달을 컴포넌트로 분리)
// - 수동 등록 버튼에서도, AI 등록에서 약을 고른 뒤에도 동일하게 사용
// - initialName 으로 약 이름을 미리 채워서 열 수 있음
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth } from '../../firebaseConfig';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;       // 저장 성공 후 목록 갱신 콜백
  initialName?: string;      // AI 선택 시 미리 채워질 약 이름
}

export const MedicineFormModal = ({
  visible,
  onClose,
  onSaved,
  initialName = '',
}: Props) => {
  const [medicineName, setMedicineName] = useState('');
  const [pillboxNumber, setPillboxNumber] = useState('');
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [alarmTimeStr, setAlarmTimeStr] = useState('시간 선택');

  // 모달이 열릴 때 초기 약 이름 반영
  useEffect(() => {
    if (visible) {
      setMedicineName(initialName);
      setPillboxNumber('');
      setAlarmTimeStr('시간 선택');
    }
  }, [visible, initialName]);

  const onTimeChange = (event: any, selectedDate?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDate(selectedDate);
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      setAlarmTimeStr(`${hours}:${minutes}`);
    }
  };

  // 기존 register.tsx 의 handleRegister 로직 그대로 이식
  const handleRegister = async () => {
    const pNumber = parseInt(pillboxNumber);
    if (!medicineName || !pillboxNumber || alarmTimeStr === '시간 선택') {
      return Alert.alert('알림', '모든 정보를 입력해주세요.');
    }
    if (isNaN(pNumber) || pNumber < 1 || pNumber > 3) {
      return Alert.alert('알림', '약통 번호는 1번에서 3번까지만 가능합니다.');
    }

    try {
      let savedUserId = await AsyncStorage.getItem('userId');
      if (!savedUserId && auth.currentUser) {
        savedUserId = auth.currentUser.uid;
      }
      if (!savedUserId) {
        return Alert.alert('오류', '로그인 세션이 만료되었습니다.');
      }

      const baseUrl = process.env.EXPO_PUBLIC_API_URL;
      const response = await axios.post(`${baseUrl}/api/medicines/add`, {
        seniorId: savedUserId,
        medicineName,
        pillboxNumber: pNumber,
        dosage: '1알',
        alarmTime: `${alarmTimeStr}:00`,
      });

      if (response.status === 200) {
        Alert.alert('성공', '약 등록이 완료되었습니다!');

        const [hour, minute] = alarmTimeStr.split(':').map(Number);
        const savedSetting = await AsyncStorage.getItem('phoneAlert');
        const isAlertEnabled =
          savedSetting !== null ? JSON.parse(savedSetting) : true;

        if (isAlertEnabled) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '💊 스마트 약통 알림',
              body: `${medicineName} (${pNumber}번 칸) 드실 시간입니다! 잊지 말고 챙겨 드세요.`,
              sound: true,
            },
            trigger: {
              hour,
              minute,
              repeats: true,
              channelId: 'medicine-alarm',
            } as any,
          });
        }

        onClose();
        onSaved();
      }
    } catch (error) {
      console.error('약 등록 실패 상세:', error);
      Alert.alert('에러', 'DB 등록에 실패했습니다.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={s.content}>
          <Text style={s.title}>💊 새 약 등록 (1~3번 칸)</Text>
          <TextInput
            style={s.input}
            placeholder="약 이름"
            placeholderTextColor="#AAA"
            value={medicineName}
            onChangeText={setMedicineName}
          />
          <TextInput
            style={s.input}
            placeholder="약통 번호 (1, 2, 3)"
            keyboardType="number-pad"
            value={pillboxNumber}
            onChangeText={(text) => setPillboxNumber(text.replace(/[^1-3]/g, ''))}
          />
          <TouchableOpacity style={s.timeInput} onPress={() => setShowPicker(true)}>
            <Text
              style={{
                fontSize: 16,
                color: alarmTimeStr === '시간 선택' ? '#AAA' : '#000',
              }}
            >
              ⏰ {alarmTimeStr}
            </Text>
          </TouchableOpacity>
          {showPicker && (
            <DateTimePicker
              value={date}
              mode="time"
              is24Hour={true}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onTimeChange}
            />
          )}
          <View style={s.buttons}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
              <Text>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.saveBtn} onPress={handleRegister}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>DB 저장</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// register.tsx 의 localStyles 와 동일한 디자인
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { width: '85%', backgroundColor: '#fff', borderRadius: 20, padding: 25 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { borderBottomWidth: 1, borderColor: '#DDD', marginBottom: 20, padding: 10, fontSize: 16 },
  timeInput: { borderBottomWidth: 1, borderColor: '#DDD', marginBottom: 30, padding: 10 },
  buttons: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelBtn: { flex: 1, padding: 15, alignItems: 'center' },
  saveBtn: { flex: 1, padding: 15, backgroundColor: '#2E7D32', borderRadius: 10, alignItems: 'center' },
});
