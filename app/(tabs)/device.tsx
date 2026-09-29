import { FontAwesome5, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface DeviceData {
  deviceUid: string;
  deviceName: string;
  batteryLevel: number;
  connected: number;
  lastSensorAvg?: number;
  lastDetected?: number;
  lastSlot?: number;
  lastMeasuredAt?: string;
}

export default function DeviceScreen() {
  const [device, setDevice] = useState<DeviceData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [testing, setTesting] = useState<string | null>(null); // 'led' | 'buzzer' | null
  const [measuring, setMeasuring] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<number>(1); // 1~3번 칸 선택

  // 기기 정보 및 최신 센서 로그 가져오기
  const fetchDeviceInfo = async () => {
    try {
      const userPk = (await AsyncStorage.getItem('userPk')) || '1';
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000';
      const res = await axios.get<DeviceData>(`${baseUrl}/api/device/details/${userPk}`);
      setDevice(res.data);
    } catch (error) {
      console.error('❌ 기기 정보 불러오기 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeviceInfo();
  }, []);

  // 1. 수동 측정 명령 전송
  const handleManualMeasure = async () => {
    try {
      setMeasuring(true);
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000';

      await axios.post(`${baseUrl}/api/device/measure`, {
        deviceUid: device?.deviceUid || 'ESP32_001',
        pillboxNumber: selectedSlot,
      });

      // 센서 20회 측정 시간(1.5초) 대기 후 화면 자동 갱신
      setTimeout(async () => {
        await fetchDeviceInfo();
        setMeasuring(false);
        Alert.alert('측정 완료', `${selectedSlot}번 칸 센서 측정이 완료되어 최신화되었습니다.`);
      }, 2000);
    } catch (error) {
      setMeasuring(false);
      Alert.alert('통신 오류', '측정 명령 전달에 실패했습니다.');
    }
  };

  // 2. LED / 부저 하드웨어 테스트
  const handleDeviceTest = async (testType: 'led' | 'buzzer') => {
    if (!device || !device.connected) {
      Alert.alert('연결 에러', '기기가 연결되어 있지 않습니다.');
      return;
    }

    try {
      setTesting(testType);
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000';
      await axios.post(`${baseUrl}/api/device/test`, {
        deviceUid: device.deviceUid,
        testType,
      });

      Alert.alert('테스트 성공', `${testType === 'led' ? '💡 LED가' : '🔔 부저가'} 작동합니다!`);
    } catch (error) {
      Alert.alert('테스트 실패', '기기 응답이 없습니다.');
    } finally {
      setTesting(null);
    }
  };

  // 배터리 아이콘 색상 선택
  const getBatteryIcon = (level: number) => {
    if (level > 70) return { name: 'battery-charging', color: '#4CAF50' };
    if (level > 20) return { name: 'battery-medium', color: '#FF9800' };
    return { name: 'battery-outline', color: '#F44336' };
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  const battery = getBatteryIcon(device?.batteryLevel || 0);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        
        {/* 상단 타이틀 */}
        <View style={styles.titleContainer}>
          <Text style={styles.pageTitle}>기기 관리</Text>
        </View>

        {/* 1. 기기 연결 상태 & 배터리 카드 */}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <MaterialCommunityIcons name="chip" size={32} color="#1976D2" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.deviceName}>{device?.deviceName || '스마트 약통'}</Text>
              <Text style={styles.deviceUid}>UID: {device?.deviceUid || 'ESP32_001'}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: device?.connected ? '#E8F5E9' : '#FFEBEE' }]}>
              <View style={[styles.statusDot, { backgroundColor: device?.connected ? '#4CAF50' : '#F44336' }]} />
              <Text style={{ fontSize: 12, fontWeight: 'bold', color: device?.connected ? '#2E7D32' : '#C62828' }}>
                {device?.connected ? '연결됨' : '연결 끊김'}
              </Text>
            </View>
          </View>

          <View style={styles.batteryRow}>
            <MaterialCommunityIcons name={battery.name as any} size={28} color={battery.color} />
            <Text style={styles.batteryText}>배터리 잔량</Text>
            <Text style={[styles.batteryPercent, { color: battery.color }]}>{device?.batteryLevel}%</Text>
          </View>
        </View>

        {/* 2. [신규] 약 잔여 수동 측정 섹션 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>약 잔여 수동 측정</Text>
          <Text style={styles.sectionSub}>약통 칸(1~3번)을 선택하고 센서로 잔여 여부를 확인합니다.</Text>

          <View style={styles.slotRow}>
            {[1, 2, 3].map((num) => (
              <TouchableOpacity
                key={num}
                onPress={() => setSelectedSlot(num)}
                style={[styles.slotBtn, selectedSlot === num && styles.slotBtnActive]}
              >
                <Text style={[styles.slotBtnText, selectedSlot === num && styles.slotBtnTextActive]}>
                  {num}번 칸
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.measureBtn, measuring && { opacity: 0.7 }]}
            onPress={handleManualMeasure}
            disabled={measuring}
          >
            {measuring ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <MaterialCommunityIcons name="radar" size={20} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.measureBtnText}>{selectedSlot}번 칸 즉시 측정</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* 3. [신규] 최근 센서 측정 결과 카드 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>최근 센서 측정 결과</Text>

          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>측정 칸:</Text>
            <Text style={styles.resultValue}>{device?.lastSlot ? `${device.lastSlot}번 약통` : '1번 약통'}</Text>
          </View>

          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>센서 측정치 (ADC):</Text>
            <Text style={styles.resultValue}>{device?.lastSensorAvg ?? '-'}</Text>
          </View>

          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>약 잔여 상태:</Text>
            <Text
              style={[
                styles.resultValue,
                { color: device?.lastDetected ? '#E53935' : '#1E88E5' },
              ]}
            >
              {device?.lastDetected !== undefined
                ? device.lastDetected
                  ? '약 있음 (미복용)'
                  : '약 없음 (복용 완료)'
                : '기록 없음'}
            </Text>
          </View>

          {device?.lastMeasuredAt && (
            <Text style={styles.timestampText}>
              마지막 측정 시간: {new Date(device.lastMeasuredAt).toLocaleTimeString()}
            </Text>
          )}
        </View>

        {/* 4. 기기 하드웨어 테스트 섹션 (LED / 부저) */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>하드웨어 동작 테스트</Text>
          <Text style={styles.sectionSub}>약통의 LED와 알람 부저가 정상 동작하는지 테스트합니다.</Text>

          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={[styles.testBtn, { backgroundColor: '#E3F2FD' }]}
              onPress={() => handleDeviceTest('led')}
              disabled={testing !== null}
            >
              <Ionicons name="bulb-outline" size={28} color="#1976D2" />
              <Text style={styles.btnText}>LED 점등</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.testBtn, { backgroundColor: '#FFF3E0' }]}
              onPress={() => handleDeviceTest('buzzer')}
              disabled={testing !== null}
            >
              <FontAwesome5 name="bell" size={24} color="#EF6C00" />
              <Text style={styles.btnText}>부저 알람</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 30, paddingTop: 40 },
  titleContainer: { marginBottom: 16 },
  pageTitle: { fontSize: 22, fontWeight: 'bold', color: '#111' },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, marginBottom: 16, elevation: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  deviceName: { fontSize: 17, fontWeight: 'bold', color: '#222' },
  deviceUid: { fontSize: 12, color: '#777', marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  batteryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', padding: 12, borderRadius: 12 },
  batteryText: { flex: 1, marginLeft: 10, fontSize: 14, color: '#555', fontWeight: '500' },
  batteryPercent: { fontSize: 16, fontWeight: 'bold' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#222', marginBottom: 4 },
  sectionSub: { fontSize: 12, color: '#666', marginBottom: 14 },
  slotRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  slotBtn: { flex: 0.31, paddingVertical: 10, borderWidth: 1, borderColor: '#DDD', borderRadius: 10, alignItems: 'center' },
  slotBtnActive: { borderColor: '#1976D2', backgroundColor: '#E3F2FD' },
  slotBtnText: { fontSize: 13, color: '#666', fontWeight: '600' },
  slotBtnTextActive: { color: '#1976D2' },
  measureBtn: { backgroundColor: '#1976D2', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 14, borderRadius: 12 },
  measureBtnText: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  resultLabel: { fontSize: 14, color: '#555' },
  resultValue: { fontSize: 14, fontWeight: 'bold', color: '#111' },
  timestampText: { fontSize: 11, color: '#999', marginTop: 8, textAlign: 'right' },
  buttonGroup: { flexDirection: 'row', justifyContent: 'space-between' },
  testBtn: { flex: 0.48, paddingVertical: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { marginTop: 8, fontSize: 13, fontWeight: '600', color: '#333' },
});