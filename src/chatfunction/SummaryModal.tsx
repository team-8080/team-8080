// src/chatfunction/SummaryModal.tsx
// '상담 기록 보기' 버튼을 누르면 뜨는 팝업 (페이지 이동 X, Modal)
// 요약된 상담 기록을 최신순으로 보여줌
import { MaterialCommunityIcons } from '@expo/vector-icons';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { auth } from '../../firebaseConfig';
import { summaryStyles as styles } from '../../styles/summaryStyles';

const SERVER_URL = process.env.EXPO_PUBLIC_API_URL

interface Summary {
  summaryDate: string;
  summaryText: string;
  createdAt: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const SummaryModal = ({ visible, onClose }: Props) => {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(false);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!visible || !uid) return;
    (async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${SERVER_URL}/api/ai/summaries/${uid}`);
        setSummaries(res.data.summaries || []);
      } catch (e) {
        console.error('요약 기록 불러오기 실패:', e);
        setSummaries([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, uid]);

  // YYYY-MM-DD → 'YYYY년 M월 D일' 표시
  const formatDate = (d: string) => {
    const date = new Date(d);
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* 헤더 */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="history" size={24} color="#9C27B0" />
              <Text style={styles.title}>상담 기록</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={26} color="#888" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color="#9C27B0" />
            </View>
          ) : summaries.length === 0 ? (
            <View style={styles.centerBox}>
              <Text style={styles.emptyText}>
                아직 저장된 상담 요약이 없습니다.{'\n'}
                상담 후 자정이 지나면 요약이 생성됩니다.
              </Text>
            </View>
          ) : (
            <FlatList
              data={summaries}
              keyExtractor={(item) => item.summaryDate}
              contentContainerStyle={{ paddingBottom: 10 }}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <Text style={styles.cardDate}>{formatDate(item.summaryDate)}</Text>
                  <Text style={styles.cardText}>{item.summaryText}</Text>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};