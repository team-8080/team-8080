import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { onValue, ref, update } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, SafeAreaView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { auth, db } from '../../firebaseConfig';
import { useAlertHistory, useAlertListener } from '../../src/chatfunction';
import { seniorHomeStyles as styles } from '../../styles/seniorHomeStyles';

// ★ 약 데이터 타입 정의
type Medicine = {
  id: number;
  medicineName: string;
  pillboxNumber: number;
  alarmTime: string;
};

export default function SeniorHomeScreen() {
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  
  // 동적으로 계산된 약 정보를 저장할 상태
  const [nextMedicine, setNextMedicine] = useState<Medicine | null>(null); 
  const [medLoading, setMedLoading] = useState(true);

  const [isBluetoothConnected, setIsBluetoothConnected] = useState(true);
  const [isLocked, setIsLocked] = useState(false);

  const [historyVisible, setHistoryVisible] = useState(false);
  const { history, fetchHistory, loading } = useAlertHistory();
  const [protectorPhone, setProtectorPhone] = useState('');
  useAlertListener();
  
  // 1. 잠금 상태 리스너
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const lockRef = ref(db, `users/${user.uid}/settings/isLocked`);
    const unsubscribe = onValue(lockRef, (snapshot) => {
      if (snapshot.exists()) setIsLocked(snapshot.val());
    });
    return () => unsubscribe();
  }, []);

  // 2. 보호자 전화번호 로드
  useEffect(() => {
    const getPhone = async () => {
      try {
        const user = auth.currentUser;
        if (user) {
          const baseUrl = process.env.EXPO_PUBLIC_API_URL; 
          if (!baseUrl) return;

          const response = await fetch(`${baseUrl}/api/protector-phone/${user.uid}`);
          if (response.ok) {
            const data = await response.json();
            const phone = data.protectorPhone || data.phoneNumber;
            if (phone) setProtectorPhone(phone);
          }
        }
      } catch (error) {
        console.error("보호자 번호 로드 중 네트워크 오류:", error);
      }
    };
    getPhone();
  }, []);

  // 3. 시간 업데이트 및 약 정보 실시간 갱신 (10초 주기 통합)
  useEffect(() => {
    const fetchNextMedicine = async () => {
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
          return;
        }

        const now = new Date();
        const currentTimeString = now.toTimeString().split(' ')[0]; 
        const sortedMeds = [...medicines].sort((a, b) => a.alarmTime.localeCompare(b.alarmTime));
        const upcomingMed = sortedMeds.find((med) => med.alarmTime > currentTimeString);

        setNextMedicine(upcomingMed || sortedMeds[0]); // 오늘 없으면 내일 첫 약
      } catch (error) {
        console.error("다음 약 계산 실패:", error);
      } finally {
        setMedLoading(false); // 로딩 스피너는 최초 1회만 끄고 이후엔 조용히 갱신
      }
    };

    const updateTimeAndData = () => {
      // 1. 시간 갱신
      const now = new Date();
      const date = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
      const time = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
      setDateStr(date);
      setTimeStr(time);

      // 2. 약 정보 갱신
      fetchNextMedicine();
    };

    // 화면 켜질 때 1번 즉시 실행
    updateTimeAndData();
    
    // 이후 10초(1000 * 10)마다 반복
    const timer = setInterval(updateTimeAndData, 1000 * 10);
    return () => clearInterval(timer);
  }, []);

  // 버튼 액션 핸들러들
  const handleSirenPress = () => {
    Alert.alert("긴급 호출", "119에 전화하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "전화하기", onPress: () => Linking.openURL('tel:119').catch(() => Alert.alert("오류", "전화 앱을 열 수 없습니다.")) }
    ]);
  };

  const handleCallPress = () => {
    if (protectorPhone) {
      Linking.openURL(`tel:${protectorPhone}`).catch(() => Alert.alert("오류", "전화 앱을 열 수 없습니다."));
    } else {
      Alert.alert("알림", "연결된 보호자 번호가 없습니다.");
    }
  };

  const toggleLock = () => {
    const user = auth.currentUser;
    if (!user) return;
    const nextLockState = !isLocked;
    update(ref(db, `users/${user.uid}/settings`), { isLocked: nextLockState });
    Alert.alert(nextLockState ? "화면 잠금" : "잠금 해제", nextLockState ? "홈 화면 외 다른 탭 이동이 제한됩니다." : "이제 다른 탭으로 이동할 수 있습니다.");
  };

  const handlePressBell = () => {
    const user = auth.currentUser;
    if (user) {
      fetchHistory(user.uid);
      setHistoryVisible(true);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F7FF" />

      <View style={styles.statusBar}>
        <View style={styles.dateContainer}>
          <Text style={styles.dateText}>{dateStr}</Text>
          <Text style={styles.timeText}>{timeStr}</Text>
        </View>

        <View style={styles.iconGroup}>
          <IconBtn name="bell-outline" isAlert onPress={handlePressBell} />
          <IconBtn name="bluetooth" isConnected={isBluetoothConnected} />
          <TouchableOpacity onPress={toggleLock} activeOpacity={0.7} style={styles.statusIconCircle}>
            <MaterialCommunityIcons name={isLocked ? "lock" : "lock-open-variant-outline"} size={22} color={isLocked ? Colors.danger : "#555"} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ★ 복약 정보 카드 (디자인 수정됨) */}
      <View style={[styles.infoCard, { justifyContent: 'center', paddingVertical: 20 }]}>
        {medLoading ? (
          <ActivityIndicator size="large" color="#1A73E8" style={{ marginTop: 40 }} />
        ) : nextMedicine ? (
          <>
            {/* 1. 상단 시간 및 약 이름 (여백 축소) */}
            <View style={[styles.cardHeader, { marginBottom: 5 }]}>
              <Text style={styles.labelLarge}>
                ⏰ {nextMedicine.alarmTime.substring(0, 5)}
              </Text>
              <View style={styles.medicineNameTag}>
                <Text style={styles.medicineName}>{nextMedicine.medicineName}</Text>
              </View>
            </View>

            {/* 2. 중앙 번호 및 텍스트 (위아래 여백 조임) */}
            <View style={[styles.pillCountContainer, { marginVertical: 10, alignItems: 'center' }]}>
              <Text style={[styles.pillCount, { marginBottom: -5 }]}>
                {nextMedicine.pillboxNumber < 10 ? `0${nextMedicine.pillboxNumber}` : nextMedicine.pillboxNumber}
              </Text>
              <Text style={styles.unitText}>번 칸 열기</Text>
            </View>

            {/* 🌟 3. 새롭게 추가된 큼직한 [복약 완료] 버튼 */}
            <TouchableOpacity 
              style={{
                backgroundColor: '#1A73E8',
                paddingVertical: 18,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                marginTop: 15,
                marginHorizontal: 15,
                elevation: 3, 
                shadowColor: '#000', 
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
              }}
              activeOpacity={0.8}
onPress={() => {
                // 1. 현재 시간과 알람 시간(분 단위)으로 변환해서 비교
                const now = new Date();
                const currentMins = now.getHours() * 60 + now.getMinutes();
                
                const [alarmHour, alarmMinute] = nextMedicine.alarmTime.split(':').map(Number);
                const alarmMins = alarmHour * 60 + alarmMinute;

                // 2. 시간 차이 계산 (예: 앞뒤 30분 이내면 제시간으로 인정)
                const diffMins = Math.abs(currentMins - alarmMins);
                const isRightTime = diffMins <= 30; // 허용 오차 30분

                // 3. 서버에 기록하는 공통 함수
                const sendIntakeLog = async () => {
                  try {
                    const user = auth.currentUser;
                    if (!user) return;

                    const baseUrl = process.env.EXPO_PUBLIC_API_URL;
                    
                    await axios.post(`${baseUrl}/api/medicines/intake`, {
                      scheduleId: nextMedicine.id, 
                      intakeStatus: 'taken',
                      userPk: user.uid // 🌟 추가됨: 누가 먹었는지 DB에 알려주기 위한 UID
                    });

                    Alert.alert('완료', '참 잘하셨습니다! 보호자에게 전달되었습니다.');
                  } catch (error) {
                    console.error('복약 기록 실패:', error);
                    Alert.alert('오류', '기록을 저장하는 중 문제가 발생했습니다.');
                  }
                };

                // 4. 시간에 따라 다른 알림창 띄우기
                if (isRightTime) {
                  // 제시간일 때
                  Alert.alert('복약 확인', '약을 모두 드셨습니까?', [
                    { text: '아직이요', style: 'cancel' },
                    { text: '먹었어요!', onPress: sendIntakeLog }
                  ]);
                } else {
                  // 시간이 아닐 때 (너무 빠르거나 늦었을 때)
                  Alert.alert('알림', '복약 시간이 아닙니다. 드시겠습니까?', [
                    { text: '취소', style: 'cancel' },
                    { text: '네', onPress: sendIntakeLog }
                  ]);
                }
              }}
            >
              <MaterialCommunityIcons name="check-circle" size={26} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: 'bold' }}>
                복약 완료
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1, paddingVertical: 30 }}>
            <MaterialCommunityIcons name="emoticon-happy-outline" size={60} color="#9E9E9E" />
            <Text style={{ marginTop: 15, fontSize: 20, color: '#666', fontWeight: 'bold' }}>
              오늘 약을 모두 드셨습니다!
            </Text>
          </View>
        )}
      </View>

      <View style={styles.bottomActionArea}>
        <TouchableOpacity style={[styles.hugeCircleBtn, styles.callBtn]} activeOpacity={0.8} onPress={handleCallPress}>
          <FontAwesome5 name="phone-alt" size={65} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.hugeSirenBtn, styles.sirenBtn]} activeOpacity={0.8} onPress={handleSirenPress}>
          <MaterialCommunityIcons name="alert-octagon" size={85} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* --- 전송 기록 모달 --- */}
      <Modal visible={historyVisible} animationType="slide" transparent={true}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: 'white', height: '70%', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ fontSize: 22, fontWeight: 'bold' }}>도착한 메시지 목록</Text>
              <TouchableOpacity onPress={() => setHistoryVisible(false)}>
                <MaterialCommunityIcons name="close" size={30} color="#333" />
              </TouchableOpacity>
            </View>
            {loading ? (
              <Text style={{ textAlign: 'center', marginTop: 20 }}>불러오는 중...</Text>
            ) : (
              <FlatList
                data={history}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={{ paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                    <Text style={{ fontSize: 19, fontWeight: '600', color: '#222' }}>{item.message}</Text>
                    <Text style={{ fontSize: 14, color: '#888', marginTop: 5 }}>{new Date(item.timestamp).toLocaleString()}</Text>
                  </View>
                )}
                ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 50, color: '#bbb' }}>기록이 없습니다.</Text>}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function IconBtn({ name, isConnected, isAlert, onPress }: any) {
  let iconColor = '#555';
  if (isConnected) iconColor = Colors.primary;
  if (isAlert) iconColor = Colors.danger;
  return (
    <TouchableOpacity style={styles.statusIconCircle} activeOpacity={0.7} onPress={onPress}>
      <MaterialCommunityIcons name={name} size={22} color={iconColor} />
    </TouchableOpacity>
  );
}