import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { exploreStyles as styles } from '../../styles/exploreStyles';

const screenWidth = Dimensions.get('window').width;

interface StatsData {
  labels: string[];
  takenCount: number[];
  notTakenCount?: number[];
  totalTaken: number;
  totalNotTaken: number;
}

function TabBtn({ label, isActive, onPress }: { label: string; isActive: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity 
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 20,
        borderRadius: 20,
        backgroundColor: isActive ? '#E8F0FE' : 'transparent',
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: isActive ? '#1976D2' : '#666' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function SummaryCard({ icon, value, unit, color }: { icon: string; value: string; unit: string; color: string }) {
  return (
    <View style={styles.summaryCard}>
      <MaterialCommunityIcons name={icon as any} size={28} color={color} />
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardUnit}>{unit}</Text>
    </View>
  );
}

export default function ExploreScreen() {
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly'>('weekly');
  const [loading, setLoading] = useState<boolean>(true);
  const [weeklyStats, setWeeklyStats] = useState<StatsData | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<StatsData | null>(null);

  const today = new Date();
  const dateString = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일 (오늘)`;

  // 데이터 로드 (주간 & 월간 동시 호출)
  useEffect(() => {
    const fetchAllStats = async () => {
      try {
        setLoading(true);
        const userPk = await AsyncStorage.getItem('userPk') || '4';
        const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000';
        
        const [weeklyRes, monthlyRes] = await Promise.all([
          axios.get<StatsData>(`${baseUrl}/api/stats/weekly/${userPk}`),
          axios.get<StatsData>(`${baseUrl}/api/stats/monthly/${userPk}`)
        ]);

        setWeeklyStats(weeklyRes.data);
        setMonthlyStats(monthlyRes.data);
      } catch (error) {
        console.error('❌ 통계 데이터 호출 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllStats();
  }, []);

  const currentStats = activeTab === 'weekly' ? weeklyStats : monthlyStats;

  const chartConfig = {
    backgroundGradientFrom: "#ffffff",
    backgroundGradientTo: "#ffffff",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(25, 118, 210, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(102, 102, 102, ${opacity})`,
    style: { borderRadius: 16 },
    propsForBackgroundLines: { strokeDasharray: "" }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* 1. 상단 요약 카드 */}
        <View style={styles.summaryRow}>
          <SummaryCard 
            icon="calendar-check" 
            value={weeklyStats ? `${weeklyStats.totalTaken}` : "0"} 
            unit="이번 주 복용" 
            color="#2196F3" 
          />
          <SummaryCard 
            icon="trending-up" 
            value={weeklyStats ? `${Math.round((weeklyStats.totalTaken / ((weeklyStats.totalTaken + weeklyStats.totalNotTaken) || 1)) * 100)}%` : "0%"} 
            unit="이번 주 준수율" 
            color="#4CAF50" 
          />
          <SummaryCard 
            icon="trophy-outline" 
            value={monthlyStats ? `${monthlyStats.totalTaken}` : "0"} 
            unit="누적 달성" 
            color="#FFC107" 
          />
        </View>

        {/* 2. 복약 기록 차트 (주간 / 월간 스위칭) */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>복약 기록</Text>
            <View style={{ flexDirection: 'row', backgroundColor: '#F1F3F4', borderRadius: 20, padding: 2 }}>
              <TabBtn label="주간" isActive={activeTab === 'weekly'} onPress={() => setActiveTab('weekly')} />
              <TabBtn label="월간" isActive={activeTab === 'monthly'} onPress={() => setActiveTab('monthly')} />
            </View>
          </View>
          
          <Text style={{ fontSize: 12, color: '#888', marginBottom: 15 }}>{dateString}</Text>
          
          {loading ? (
            <View style={[styles.chartPlaceholder, { height: 220 }]}>
              <ActivityIndicator size="small" color="#1976D2" />
              <Text style={{ marginTop: 8, fontSize: 13, color: '#999' }}>통계 로딩 중...</Text>
            </View>
          ) : currentStats ? (
            <View style={{ alignItems: 'center' }}>
              <BarChart
                data={{
                  labels: currentStats.labels,
                  datasets: [{ data: currentStats.takenCount }]
                }}
                width={screenWidth - 80}
                height={200}
                yAxisLabel=""
                yAxisSuffix="회"
                chartConfig={chartConfig}
                verticalLabelRotation={0}
                style={{ borderRadius: 16, marginVertical: 8, alignSelf: 'center' }}
              />
            </View>
          ) : null}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}