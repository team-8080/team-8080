import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { auth } from '../../firebaseConfig';
import { useAlertHistory, useAlertListener, useManagedUsers } from '../../src/chatfunction';
import { homeStyles as styles } from '../../styles/homeStyles';

// ★ 약 데이터 타입 정의
type Medicine = {
  id: number;
  medicineName: string;
  pillboxNumber: number;
  alarmTime: string;
};

export default function HomeScreen() {
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [historyVisible, setHistoryVisible] = useState(false);

  const [nextMedicine, setNextMedicine] = useState<Medicine | null>(null);
  // 🌟 추가: 전체 약 목록을 담을 상태
  const [allMedicines, setAllMedicines] = useState<Medicine[]>([]);
  const [medLoading, setMedLoading] = useState(true);

  const managedUsers = useManagedUsers();
  const { history, fetchHistory, loading } = useAlertHistory();
  
  useAlertListener();

  // 시간 업데이트 및 약 정보 실시간 갱신 (10초 주기)
  useEffect(() => {
    const fetchMedicines = async () => {
      try {
        let savedUserId = await AsyncStorage.getItem('userId');
        if (!savedUserId && auth.currentUser) {
          savedUserId = auth.currentUser.uid;
        }
        
        if (!savedUserId) return;

        const baseUrl = process.env.EXPO_PUBLIC_API_URL;
        if (!baseUrl) return;

        const response = await axios.get(`${baseUrl}/api/medicines/list/${savedUserId}`);
        const medicines: Medicine[] = response.data;
        
        if (medicines.length === 0) {
          setNextMedicine(null);
          setAllMedicines([]);
          return;
        }

        const now = new Date();
        const currentTimeString = now.toTimeString().split(' ')[0]; 
        const sortedMeds = [...medicines].sort((a, b) => a.alarmTime.localeCompare(b.alarmTime));
        
        // 🌟 전체 약 목록 저장
        setAllMedicines(sortedMeds);

        const upcomingMed = sortedMeds.find((med) => med.alarmTime > currentTimeString);
        setNextMedicine(upcomingMed || sortedMeds[0]); // 오늘 남은 약이 없으면 내일 첫 약
      } catch (error) {
        console.error("약 데이터 불러오기 실패:", error);
      } finally {
        setMedLoading(false);
      }
    };

    const updateTimeAndData = () => {
      const now = new Date();
      const date = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
      const time = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
      setDateStr(date);
      setTimeStr(time);

      fetchMedicines();
    };

    updateTimeAndData();
    const timer = setInterval(updateTimeAndData, 1000 * 10);
    
    return () => clearInterval(timer);
  }, []);

  const handlePressBell = async () => {
    if (managedUsers && managedUsers.length > 0) {
      setHistoryVisible(true);
      await fetchHistory(managedUsers[0].id);
    } else {
      Alert.alert("알림", "관리 중인 어르신이 없습니다.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F7FF" />
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.statusBar}>
          <View style={styles.dateContainer}>
            <Text style={styles.dateText}>{dateStr}</Text>
            <Text style={styles.timeText}>{timeStr}</Text>
          </View>

          <View style={styles.iconGroup}>
            <TouchableOpacity 
              style={styles.statusIconCircle} 
              activeOpacity={0.5}
              onPress={handlePressBell}
            >
              <MaterialCommunityIcons name="bell-outline" size={22} color={Colors.danger} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.statusIconCircle} activeOpacity={0.5}>
              <MaterialCommunityIcons name="bluetooth" size={22} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* --- 상단 복약 알림 카드 --- */}
        <View style={styles.alertCard}>
          <View style={styles.alertHeader}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <MaterialCommunityIcons name="bell-outline" size={18} color="#FFF" />
              <Text style={styles.alertHeaderText}> 다음 복약</Text>
            </View>
            <View style={styles.tag}><Text style={styles.tagText}>예정</Text></View>
          </View>

          {medLoading ? (
            <ActivityIndicator size="small" color="#FFF" style={{ marginTop: 10, marginBottom: 10 }} />
          ) : nextMedicine ? (
            <>
              <Text style={styles.medTitle}>{nextMedicine.medicineName}</Text>
              <Text style={styles.medTime}>
                복용 시간: {nextMedicine.alarmTime.substring(0, 5)} | {nextMedicine.pillboxNumber}번 칸
              </Text>
              <TouchableOpacity style={styles.whiteBtn}>
                <Text style={styles.blueBtnText}>복용 확인</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: '#FFF', fontSize: 16 }}>등록된 약이 없습니다.</Text>
            </View>
          )}
        </View>

        {/* 🌟 탭 버튼 삭제 및 DB 기반 리스트로 교체 */}
        <View style={[styles.statusSection, { marginTop: 20 }]}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15, marginLeft: 5, color: '#333' }}>
            📋 오늘의 복약 일정
          </Text>

          {allMedicines.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 20 }}>
              <Text style={{ color: '#999' }}>등록된 일정이 없습니다.</Text>
            </View>
          ) : (
            allMedicines.map((med) => {
              // 현재 시간과 약 알람 시간을 비교하여 지났는지 판단
              const nowTime = new Date().toTimeString().split(' ')[0];
              const isPassed = med.alarmTime < nowTime;

              return (
                <MedRow 
                  key={med.id}
                  name={med.medicineName} 
                  time={med.alarmTime.substring(0, 5)} 
                  isDone={false} // 복용 로그 연동 전이므로 기본값 false
                  isLate={isPassed} // 시간이 지났으면 빨간색 경고
                />
              );
            })
          )}
        </View>
      </ScrollView>

      {/* --- 가족 메시지 전송 기록 모달 --- */}
      <Modal 
        visible={historyVisible} 
        animationType="slide" 
        transparent={true}
        onRequestClose={() => setHistoryVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ 
            backgroundColor: 'white', 
            height: '75%', 
            borderTopLeftRadius: 25, 
            borderTopRightRadius: 25, 
            padding: 20,
            elevation: 5
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold' }}>가족 메시지 전송 기록</Text>
              <TouchableOpacity onPress={() => setHistoryVisible(false)}>
                <MaterialCommunityIcons name="close" size={26} color="#333" />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={{ marginTop: 30, alignItems: 'center' }}>
                <Text>기록을 불러오고 있습니다...</Text>
              </View>
            ) : (
              <FlatList
                data={history}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={{ paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
                    <Text style={{ fontSize: 17, fontWeight: '600', color: '#222' }}>{item.message}</Text>
                    <Text style={{ fontSize: 13, color: '#999', marginTop: 6 }}>
                      보낸 시간: {new Date(item.timestamp).toLocaleString()}
                    </Text>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={{ marginTop: 60, alignItems: 'center' }}>
                    <Text style={{ color: '#BBB' }}>아직 전송한 기록이 없습니다.</Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MedRow({ name, time, isDone, isLate }: any) {
  return (
    <View style={[styles.itemRow, isLate && !isDone && styles.lateRow]}>
      <View style={{flexDirection: 'row', alignItems: 'center'}}>
        <MaterialCommunityIcons 
          name={isDone ? "check-circle" : "alert-circle"} 
          size={26} 
          color={isDone ? "#4CAF50" : (isLate ? "#F44336" : "#CCC")} 
        />
        <View style={{marginLeft: 12}}>
          <Text style={styles.itemName}>{name}</Text>
          <Text style={styles.itemTime}>{time} • 1정</Text>
        </View>
      </View>
    </View>
  );
}