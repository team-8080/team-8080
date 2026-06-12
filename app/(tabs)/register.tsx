import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

// ★ 파이어베이스 auth 추가 (질문자님 원래 코드 복구)
import { auth } from '../../firebaseConfig';

import { AiRegisterModal, AiSearchModal, MedicineFormModal } from '../../src/chatfunction';
import { medicineAiStyles as aiStyles } from '../../styles/medicineAiStyles';
import { registerStyles as styles } from '../../styles/registerStyles';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type Medicine = {
  id: number;
  medicineName: string;
  pillboxNumber: number;
  alarmTime: string;
};

export default function RegisterScreen() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);

  // 등록 및 검색 흐름 상태 (동료분 UI 코드 유지)
  const [registerSheet, setRegisterSheet] = useState(false);
  const [manualFormVisible, setManualFormVisible] = useState(false);
  const [aiRegisterVisible, setAiRegisterVisible] = useState(false);
  const [searchSheet, setSearchSheet] = useState(false);
  const [aiSearchVisible, setAiSearchVisible] = useState(false);
  const [searchTab, setSearchTab] = useState<'ai' | 'manual'>('ai');

  useEffect(() => {
    fetchMedicines();

    const requestPermissions = async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '약 복용 알림을 받으려면 기기 설정에서 알림 권한을 허용해주세요.');
      }
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('medicine-alarm', {
          name: '약 복용 알림',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
    };
    requestPermissions();
  }, []);

  // 🌟 [복구됨] 질문자님의 확실한 데이터 불러오기 로직 (auth 포함)
  const fetchMedicines = async () => {
    try {
      let savedUserId = await AsyncStorage.getItem('userId');
      if (!savedUserId && auth.currentUser) {
        savedUserId = auth.currentUser.uid;
      }
      if (!savedUserId) return;

      const baseUrl = process.env.EXPO_PUBLIC_API_URL;
      const response = await axios.get(`${baseUrl}/api/medicines/list/${savedUserId}`);
      
      if (response.status === 200) {
        setMedicines(response.data);
      }
    } catch (error) {
      console.error('약 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMedicine = (id: number) => {
    Alert.alert('약 삭제', '정말 이 약을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            const baseUrl = process.env.EXPO_PUBLIC_API_URL;
            const response = await axios.delete(`${baseUrl}/api/medicines/${id}`);
            if (response.status === 200) {
              Alert.alert('알림', '삭제되었습니다.');
              fetchMedicines();
            }
          } catch (error) {
            console.error('약 삭제 실패:', error);
            Alert.alert('에러', '삭제에 실패했습니다.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.headerTitle}>스마트 약통</Text>

        <View style={styles.mainCard}>
          <Text style={styles.cardTitle}>약 등록 / 검색</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.actionButton, styles.searchBtn]} onPress={() => setSearchSheet(true)}>
              <MaterialCommunityIcons name="magnify" size={32} color="#1565C0" />
              <Text style={styles.searchText}>검색하기</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionButton, styles.registerBtn]} onPress={() => setRegisterSheet(true)}>
              <MaterialCommunityIcons name="camera-outline" size={32} color="#2E7D32" />
              <Text style={styles.registerText}>등록하기</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={localStyles.listSection}>
          <Text style={localStyles.sectionMenuTitle}>📋 등록된 약 목록</Text>

          {/* 🌟 [복구됨] 약이 없을 때 표시되는 UI */}
          {medicines.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="pill" size={60} color="#E0E0E0" />
              <Text style={styles.emptyText}>등록된 약 정보가 여기에 표시됩니다.</Text>
            </View>
          ) : (
            medicines.map((item) => (
              <View key={item.id} style={localStyles.medCard}>
                <View style={localStyles.medIconCircle}>
                  <MaterialCommunityIcons name="pill" size={24} color="#2E7D32" />
                </View>
                <View style={{ flex: 1, marginLeft: 15 }}>
                  <Text style={localStyles.medName}>{item.medicineName}</Text>
                  <Text style={localStyles.medSub}>약통 칸: {item.pillboxNumber}번 칸</Text>
                </View>
                <View style={localStyles.timeTag}>
                  <Text style={localStyles.timeText}>{item.alarmTime.substring(0, 5)}</Text>
                </View>
                <TouchableOpacity style={{ padding: 10, marginLeft: 5 }} onPress={() => handleDeleteMedicine(item.id)}>
                  <MaterialCommunityIcons name="trash-can-outline" size={26} color="#E53935" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* 등록하기 선택 시트 */}
      <Modal visible={registerSheet} animationType="fade" transparent>
        <TouchableOpacity style={aiStyles.sheetOverlay} activeOpacity={1} onPress={() => setRegisterSheet(false)}>
          <View style={aiStyles.sheet}>
            <Text style={aiStyles.sheetTitle}>약을 어떻게 등록할까요?</Text>
            <TouchableOpacity style={[aiStyles.sheetBtn, aiStyles.sheetBtnAi]} onPress={() => { setRegisterSheet(false); setAiRegisterVisible(true); }}>
              <MaterialCommunityIcons name="camera-iris" size={24} color="#2E7D32" />
              <Text style={[aiStyles.sheetBtnText, { color: '#2E7D32' }]}>AI 등록</Text>
              <Text style={aiStyles.sheetBtnSub}>사진으로 자동</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[aiStyles.sheetBtn, aiStyles.sheetBtnManual]} onPress={() => { setRegisterSheet(false); setManualFormVisible(true); }}>
              <MaterialCommunityIcons name="pencil" size={24} color="#1565C0" />
              <Text style={[aiStyles.sheetBtnText, { color: '#1565C0' }]}>수동 등록</Text>
              <Text style={aiStyles.sheetBtnSub}>직접 입력</Text>
            </TouchableOpacity>
            <TouchableOpacity style={aiStyles.sheetCancel} onPress={() => setRegisterSheet(false)}>
              <Text style={aiStyles.sheetCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 검색하기 선택 시트 */}
      <Modal visible={searchSheet} animationType="fade" transparent>
        <TouchableOpacity style={aiStyles.sheetOverlay} activeOpacity={1} onPress={() => setSearchSheet(false)}>
          <View style={aiStyles.sheet}>
            <Text style={aiStyles.sheetTitle}>약을 어떻게 검색할까요?</Text>
            <TouchableOpacity style={[aiStyles.sheetBtn, aiStyles.sheetBtnManual]} onPress={() => { setSearchSheet(false); setSearchTab('ai'); setAiSearchVisible(true); }}>
              <MaterialCommunityIcons name="camera-iris" size={24} color="#1565C0" />
              <Text style={[aiStyles.sheetBtnText, { color: '#1565C0' }]}>AI 검색</Text>
              <Text style={aiStyles.sheetBtnSub}>사진으로 자동</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[aiStyles.sheetBtn, aiStyles.sheetBtnManual]} onPress={() => { setSearchSheet(false); setSearchTab('manual'); setAiSearchVisible(true); }}>
              <MaterialCommunityIcons name="pencil" size={24} color="#1565C0" />
              <Text style={[aiStyles.sheetBtnText, { color: '#1565C0' }]}>수동 검색</Text>
              <Text style={aiStyles.sheetBtnSub}>특징 입력</Text>
            </TouchableOpacity>
            <TouchableOpacity style={aiStyles.sheetCancel} onPress={() => setSearchSheet(false)}>
              <Text style={aiStyles.sheetCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 모달 연동 부분 */}
      <MedicineFormModal visible={manualFormVisible} onClose={() => setManualFormVisible(false)} onSaved={fetchMedicines} />
      <AiRegisterModal visible={aiRegisterVisible} onClose={() => setAiRegisterVisible(false)} onSaved={fetchMedicines} />
      <AiSearchModal visible={aiSearchVisible} initialTab={searchTab} onClose={() => setAiSearchVisible(false)} />
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  listSection: { marginTop: 10, width: '100%', paddingHorizontal: 5 },
  sectionMenuTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 15 },
  medCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 15, marginBottom: 12, borderWidth: 1, borderColor: '#ECECEC', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  medIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },
  medName: { fontSize: 16, fontWeight: 'bold', color: '#222' },
  medSub: { fontSize: 13, color: '#777', marginTop: 3 },
  timeTag: { backgroundColor: '#F1F3F9', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  timeText: { fontSize: 14, fontWeight: '600', color: '#1565C0' },
});