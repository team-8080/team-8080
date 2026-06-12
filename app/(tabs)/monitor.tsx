import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { auth } from '../../firebaseConfig';

type MonitorItem = {
  scheduleId: number;
  medicineName: string;
  alarmTime: string;
  pillboxNumber: number;
  intakeStatus: 'taken' | 'not_taken' | null;
  checkedAt: string | null;
};

export default function ProtectorMonitorScreen() {
  const [medications, setMedications] = useState<MonitorItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = async () => {
    try {
      let protectorUid = await AsyncStorage.getItem('userId') || auth.currentUser?.uid;
      if (!protectorUid) return;

      const baseUrl = process.env.EXPO_PUBLIC_API_URL;
      const response = await axios.get(`${baseUrl}/api/monitor/${protectorUid}`);
      
      if (response.status === 200) {
        setMedications(response.data);
      }
    } catch (error) {
      console.error('상태 로드 실패:', error);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStatus();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.headerTitle}>어르신 복약 현황</Text>
        <Text style={styles.subTitle}>화면을 아래로 당겨서 새로고침 하세요</Text>

        <View style={styles.listSection}>
          {medications.length === 0 ? (
             <View style={styles.emptyState}>
               <Text>등록된 약 일정이 없습니다.</Text>
             </View>
          ) : (
            medications.map((item) => {
              // 상태에 따른 UI 색상 및 텍스트 결정
              const isTaken = item.intakeStatus === 'taken';
              const isMissed = item.intakeStatus === 'not_taken';
              
              let statusText = "복용 전";
              let statusColor = "#9E9E9E"; // 기본 회색
              let iconName = "clock-outline";

              if (isTaken) {
                statusText = "복용 완료";
                statusColor = "#2E7D32"; // 초록색
                iconName = "check-circle";
              } else if (isMissed) {
                statusText = "미복용";
                statusColor = "#D32F2F"; // 빨간색
                iconName = "alert-circle";
              }

              return (
                <View key={item.scheduleId} style={styles.medCard}>
                  <View style={styles.timeSection}>
                    <Text style={styles.timeText}>{item.alarmTime.substring(0, 5)}</Text>
                    <Text style={styles.pillboxText}>{item.pillboxNumber}번 칸</Text>
                  </View>
                  
                  <View style={styles.infoSection}>
                    <Text style={styles.medName}>{item.medicineName}</Text>
                    {item.checkedAt && (
                       <Text style={styles.checkTime}>확인: {new Date(item.checkedAt).toLocaleTimeString().substring(0, 5)}</Text>
                    )}
                  </View>

                  <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                    <MaterialCommunityIcons name={iconName as any} size={16} color="#FFF" style={{ marginRight: 4 }} />
                    <Text style={styles.statusText}>{statusText}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: 20 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#1A1A1A', marginTop: 10 },
  subTitle: { fontSize: 14, color: '#666', marginTop: 5, marginBottom: 20 },
  listSection: { marginTop: 10 },
  emptyState: { padding: 30, alignItems: 'center' },
  medCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ECECEC',
    elevation: 2,
  },
  timeSection: { width: 60, alignItems: 'center', borderRightWidth: 1, borderColor: '#EEE', paddingRight: 10 },
  timeText: { fontSize: 18, fontWeight: 'bold', color: '#1565C0' },
  pillboxText: { fontSize: 12, color: '#666', marginTop: 4 },
  infoSection: { flex: 1, paddingLeft: 15 },
  medName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  checkTime: { fontSize: 12, color: '#888', marginTop: 4 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  statusText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' }
});