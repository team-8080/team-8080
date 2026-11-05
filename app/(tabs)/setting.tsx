import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage'; // ★ 추가됨
import axios from 'axios';
import * as Notifications from 'expo-notifications'; // ★ 추가됨
import {
  equalTo,
  get,
  onValue,
  orderByChild,
  query,
  ref,
  update
} from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, SafeAreaView, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { settingStyles as styles } from '../../styles/settingStyles';

// --- 파이어베이스 관련 임포트 ---
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../firebaseConfig';

function SettingSwitch({ label, subLabel, value, onValueChange }: any) {
  return (
    <View style={styles.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingSubLabel}>{subLabel}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const SERVER_URL = process.env.EXPO_PUBLIC_API_URL;

export default function SettingScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isBluetoothConnected, setIsBluetoothConnected] = useState(false);
  const [guardian, setGuardian] = useState({ name: '', phone: '', relation: '' });
  const [modalVisible, setModalVisible] = useState(false);
  const [tempPhone, setTempPhone] = useState('');
  const [managedUsers, setManagedUsers] = useState<any[]>([]);

  const [settings, setSettings] = useState({
    pushEnabled: true,
    ledEnabled: true,
    buzzerEnabled: true,
    stockAlertEnabled: true,
    alertThreshold: 5,
    isSimpleMode: false,
  });

  // 1. [데이터 불러오기] 실시간 동기화
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const guardianRef = ref(db, `users/${user.uid}/guardian`);
    const unsubGuardian = onValue(guardianRef, (snapshot) => {
      if (snapshot.exists()) setGuardian(snapshot.val());
      else setGuardian({ name: '', phone: '', relation: '' });
    });

    const settingsRef = ref(db, `users/${user.uid}/settings`);
    const unsubSettings = onValue(settingsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setSettings(data);
        // 앱을 켰을 때 DB에 설정된 푸시 알림 상태를 AsyncStorage에도 동기화
        AsyncStorage.setItem('phoneAlert', JSON.stringify(data.pushEnabled));
      }
      setLoading(false);
    });

    const managedRef = ref(db, `users/${user.uid}/managedUsers`);
    const unsubManaged = onValue(managedRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const userList = Object.keys(data).map(key => ({
          uid: key,
          ...data[key]
        }));
        setManagedUsers(userList);
      } else {
        setManagedUsers([]);
      }
    });

    return () => {
      unsubGuardian();
      unsubSettings();
      unsubManaged();
    };
  }, []);

  // 3. 관리 대상 삭제
  const handleRemoveManagedUser = (patientUid: string, patientName: string) => {
    Alert.alert(
      "관리 중단",
      `${patientName}님을 관리 목록에서 삭제하시겠습니까?\n(상대방과의 연결이 끊어집니다.)`,
      [
        { text: "취소", style: "cancel" },
        { 
          text: "삭제", 
          style: "destructive",
          onPress: async () => {
            try {
              const myUid = auth.currentUser?.uid;
              const updates: any = {};
              
              updates[`users/${myUid}/managedUsers/${patientUid}`] = null;
              updates[`users/${patientUid}/guardian`] = null;

              await update(ref(db), updates);
              Alert.alert("완료", "삭제되었습니다.");
            } catch (e) {
              Alert.alert("에러", "삭제에 실패했습니다.");
            }
          }
        }
      ]
    );
  };

  // 2. 보호자 검색 및 대조 
  const handleSearchGuardian = async () => {
    const user = auth.currentUser;
    if (!user) return;
    if (!tempPhone) {
      Alert.alert("알림", "전화번호를 입력해주세요.");
      return;
    }

    setLoading(true); 

    try {
      const response = await axios.get(`${SERVER_URL}/api/users/search/${tempPhone}`);
      const mysqlUser = response.data; 

      const usersRef = ref(db, 'users');
      const phoneQuery = query(usersRef, orderByChild('profile/phone'), equalTo(tempPhone));
      const snapshot = await get(phoneQuery);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const uids = Object.keys(data);
        
        if (uids.length === 0) {
          setLoading(false);
          Alert.alert("알림", "사용자 정보를 찾을 수 없습니다.");
          return;
        }

        const actualUid = uids[0]; 
        const userData = data[actualUid];

        const gName = userData?.name || userData?.profile?.name || "사용자";
        const tempPhone = userData?.phone || "";

        setLoading(false); 

        Alert.alert(
          "보호자 확인",
          `${gName}님이 보호자가 맞으십니까?`,
          [
            { text: "아니요", style: "cancel" },
            { text: "네, 맞습니다", onPress: () => finalizeConnection(user.uid, actualUid, gName, tempPhone) }
          ]
        );
      } else {
        setLoading(false);
        Alert.alert("알림", "가입되지 않은 번호입니다.");
      }
    } catch (error) {
      setLoading(false);
      console.error("검색 에러 상세:", error);
      Alert.alert("에러", "검색 중 알 수 없는 오류가 발생했습니다.");
    }
  };

  const finalizeConnection = async (myUid: string, gUid: string, gName: string, gPhone: string) => {
    setLoading(true); 
    
    try {
      const updates: any = {};
      const mySnapshot = await get(ref(db, `users/${myUid}/profile/name`));
      const myActualName = mySnapshot.exists() ? mySnapshot.val() : "알 수 없음";

      updates[`users/${myUid}/guardian`] = {
        uid: gUid, 
        name: gName,
        phone: gPhone,
        relation: "보호자",
        connected: true
      };

      updates[`users/${gUid}/managedUsers/${myUid}`] = {
        name: myActualName,
        connected: true
      };

      await update(ref(db), updates);

      await axios.post(`${SERVER_URL}/api/relation`, {
        protectorId: gUid, 
        seniorId: myUid,
        relationType: "보호자"
      });

      Alert.alert("성공", `${gName}님과 연동되었습니다.`);
      
    } catch (error: any) {
      console.error("연동 실패 상세:", error);
      Alert.alert("오류", "연동 중 문제가 발생했습니다. (데이터 형식 확인)");
    } finally {
      setLoading(false); 
      setModalVisible(false);
      setTempPhone(''); 
    }
  };

  // ★ 4. [수정됨] 설정 업데이트 함수 (알림 취소/활성화 및 기기 제어 로직 추가)
  const toggleSetting = async (key: string, value: any) => {
    const user = auth.currentUser;
    if (!user) return;

    let safeValue = value;
    if (key === 'alertThreshold' && (isNaN(value) || value === undefined)) {
      safeValue = 5; 
    }

    // 🟢 푸시 알림 스위치를 조작했을 때
    if (key === 'pushEnabled') {
      try {
        await AsyncStorage.setItem('phoneAlert', JSON.stringify(safeValue)); // 로컬 저장
        
        if (safeValue === false) {
          await Notifications.cancelAllScheduledNotificationsAsync();
        } else {
          Alert.alert("알림 설정", "휴대폰 알림이 켜졌습니다.\n새로 등록하는 약부터 푸시 알림이 적용됩니다.");
        }
      } catch (error) {
        console.error("알림 설정 변경 에러:", error);
      }
    }

    // 🔴 [추가됨] 부저 및 LED 스위치를 조작했을 때 Node.js 서버로 하드웨어 제어 명령 전송
    if (key === 'ledEnabled' || key === 'buzzerEnabled') {
      try {
        const targetDevice = key === 'ledEnabled' ? 'led' : 'buzzer';
        const commandState = safeValue ? 'on' : 'off';
        
        // 백엔드 서버로 하드웨어 제어 요청 (ESP32로 시리얼 명령 전달을 위함)
        await axios.post(`${SERVER_URL}/api/hardware/control`, {
          deviceUid: "ESP32_001", // 하드웨어 식별자
          target: targetDevice,
          state: commandState
        });
      } catch (error) {
        console.error("하드웨어 제어 에러:", error);
        Alert.alert("통신 오류", "기기 제어 명령을 서버에 전달하지 못했습니다.");
      }
    }

    // DB 및 상태 업데이트
    setSettings(prev => ({ ...prev, [key]: safeValue }));
    update(ref(db, `users/${user.uid}/settings`), { [key]: safeValue });
  };

  const toggleBluetooth = () => {
    setIsBluetoothConnected(!isBluetoothConnected);
    Alert.alert("블루투스", !isBluetoothConnected ? "스마트 약통과 연결되었습니다." : "연결 해제됨");
  };

  const handleLogout = async () => {
    Alert.alert("로그아웃", "정말 로그아웃 하시겠습니까?", [
      { text: "취소" },
      { text: "확인", onPress: () => { signOut(auth); router.replace('/login'); } }
    ]);
  };

  if (loading) return <ActivityIndicator style={{flex:1}} />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]}>

        {/* 보호자 정보 카드 */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="shield-check-outline" size={20} color="#333" />
            <Text style={styles.sectionTitle}>등록된 보호자</Text>
          </View>
          <View style={{ padding: 10 }}>
             <Text style={{ fontSize: 16, fontWeight: 'bold' }}>
               {guardian.name ? `${guardian.name} (${guardian.relation || '보호자'})` : "보호자를 등록해주세요"}
             </Text>
             <Text style={{ color: '#888' }}>{guardian.phone || "번호 없음"}</Text>
             <TouchableOpacity 
               onPress={() => setModalVisible(true)}
               style={{ marginTop: 10, backgroundColor: '#eee', padding: 8, alignItems: 'center', borderRadius: 5 }}
             >
               <Text>보호자 검색 및 연동</Text>
             </TouchableOpacity>
          </View>
        </View>

        {/* 관리 대상 목록 카드 */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="account-group" size={20} color="#2196F3" />
            <Text style={styles.sectionTitle}>내가 관리하는 분들</Text>
          </View>
          
          <View style={{ padding: 10 }}>
            {managedUsers.length > 0 ? (
              managedUsers.map((item) => (
                <View key={item.uid} style={{ 
                  flexDirection: 'row', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: '#eee'
                }}>
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: '600' }}>{item.name} 님</Text>
                    <Text style={{ fontSize: 12, color: '#888' }}>상태: 연결됨</Text>
                  </View>
                  
                  <TouchableOpacity 
                    onPress={() => handleRemoveManagedUser(item.uid, item.name)}
                    style={{ backgroundColor: '#FFF1F0', padding: 8, borderRadius: 6 }}
                  >
                    <MaterialCommunityIcons name="account-remove" size={20} color="#FF4D4F" />
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <Text style={{ color: '#999', textAlign: 'center', py: 10 }}>관리 중인 대상이 없습니다.</Text>
            )}
          </View>
        </View>

        {/* 화면 모드 설정 */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="cellphone-cog" size={20} color="#FF9800" />
            <Text style={styles.sectionTitle}>화면 모드 설정</Text>
          </View>
          <SettingSwitch 
            label="간단 모드" 
            subLabel="글씨를 크게 보고 기능을 단순화합니다." 
            value={settings.isSimpleMode} 
            onValueChange={(val: boolean) => toggleSetting('isSimpleMode', val)} 
          />
        </View>

        {/* 장치 설정 */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="bluetooth" size={20} color="#2196F3" />
            <Text style={styles.sectionTitle}>장치 설정</Text>
          </View>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>연결 상태</Text>
              <Text style={{ fontSize: 12, color: isBluetoothConnected ? '#2196F3' : '#888' }}>
                {isBluetoothConnected ? '연결됨' : '연결 안됨'}
              </Text>
            </View>
            <TouchableOpacity onPress={toggleBluetooth} style={[styles.connectMiniBtn, {backgroundColor: isBluetoothConnected ? '#888' : '#2196F3'}]}>
              <Text style={{color: '#FFF'}}>{isBluetoothConnected ? '해제' : '연결'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 알림 설정 */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="bell-outline" size={20} color="#333" />
            <Text style={styles.sectionTitle}>알림 설정</Text>
          </View>
          {/* 🟢 실제 알림 기능과 연동된 스위치 */}
          <SettingSwitch label="휴대폰 알림" subLabel="푸시 알림" value={settings.pushEnabled} onValueChange={(val: boolean) => toggleSetting('pushEnabled', val)} />
          <SettingSwitch label="부저 알림" subLabel="약통 소리" value={settings.buzzerEnabled} onValueChange={(val: boolean) => toggleSetting('buzzerEnabled', val)} />
          <SettingSwitch label="LED 표시등" subLabel="약통 불빛" value={settings.ledEnabled} onValueChange={(val: boolean) => toggleSetting('ledEnabled', val)} />
          <SettingSwitch label="재고 알림" subLabel="잔여 개수 알림" value={settings.stockAlertEnabled} onValueChange={(val: boolean) => toggleSetting('stockAlertEnabled', val)} />

          {settings.stockAlertEnabled && (
            <View style={styles.thresholdContainer}>
              <Text style={styles.thresholdLabel}>기준: {settings.alertThreshold}개</Text>
              <View style={styles.stepper}>
                <TouchableOpacity onPress={() => toggleSetting('alertThreshold', Math.max(1, settings.alertThreshold - 1))} style={styles.stepBtn}>
                  <MaterialCommunityIcons name="minus" size={18} />
                </TouchableOpacity>
                <Text style={styles.stepText}>{settings.alertThreshold}</Text>
                <TouchableOpacity onPress={() => toggleSetting('alertThreshold', settings.alertThreshold + 1)} style={styles.stepBtn}>
                  <MaterialCommunityIcons name="plus" size={18} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <TouchableOpacity style={{ marginTop: 20, alignItems: 'center' }} onPress={handleLogout}>
          <Text style={{ color: '#FF4D4F', textDecorationLine: 'underline' }}>로그아웃</Text>
        </TouchableOpacity>

        {/* 보호자 검색 모달 */}
        <Modal visible={modalVisible} animationType="fade" transparent={true}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ backgroundColor: 'white', padding: 25, borderRadius: 15, width: '85%' }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15 }}>보호자 찾기</Text>
              <Text style={{ fontSize: 14, color: '#666', marginBottom: 10 }}>보호자님의 전화번호를 입력해주세요.</Text>
              
              <TextInput 
                placeholder="전화번호 (- 없이 입력)"
                keyboardType="phone-pad"
                style={{ borderBottomWidth: 1, borderColor: '#ddd', padding: 10, marginBottom: 25, fontSize: 16 }}
                onChangeText={(text) => setTempPhone(text)}
                value={tempPhone}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <TouchableOpacity onPress={() => { setModalVisible(false); setTempPhone(''); }} style={{ marginRight: 25 }}>
                  <Text style={{ color: '#888', fontSize: 16 }}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSearchGuardian}>
                  <Text style={{ color: '#2196F3', fontWeight: 'bold', fontSize: 16 }}>검색하기</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </ScrollView>
    </SafeAreaView>
  );
}