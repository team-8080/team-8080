// src/chatfunction/AiSearchModal.tsx
// '검색하기 → AI 검색 / 수동 검색' 선택 후 열리는 모달
// - AI 검색: 앞/뒷면 사진으로 특징 추출 → 유사 약 3가지
// - 수동 검색: 모양/색상/식별표시/분할면 직접 입력 → 유사 약 3가지
// 검색은 정보 확인용이라 약을 저장하지 않습니다.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { medicineAiStyles as styles } from '../../styles/medicineAiStyles';
import { useMedicineIdentify } from './useMedicineIdentify';

interface Props {
  visible: boolean;
  onClose: () => void;
  initialTab: 'ai' | 'manual';
}

export const AiSearchModal = ({ visible, onClose, initialTab }: Props) => {
  const {
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
  } = useMedicineIdentify('search');

  const [tab, setTab] = useState<'ai' | 'manual'>(initialTab);
  const [sheetSide, setSheetSide] = useState<'front' | 'back' | null>(null);

  // 수동 검색 입력값
  const [shape, setShape] = useState('');
  const [color, setColor] = useState('');
  const [imprint, setImprint] = useState('');
  const [scoreLine, setScoreLine] = useState('');

  // initialTab 변경 반영
  React.useEffect(() => {
    if (visible) setTab(initialTab);
  }, [visible, initialTab]);

  const close = () => {
    reset();
    setShape('');
    setColor('');
    setImprint('');
    setScoreLine('');
    setSheetSide(null);
    onClose();
  };

  const renderPhotoBox = (side: 'front' | 'back') => {
    const photo = side === 'front' ? front : back;
    return (
      <TouchableOpacity
        style={[styles.photoBox, photo && styles.photoBoxFilled]}
        onPress={() => setSheetSide(side)}
      >
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.photoImage} resizeMode="cover" />
        ) : (
          <>
            <MaterialCommunityIcons name="camera-plus-outline" size={30} color="#1565C0" />
            <Text style={[styles.photoLabel, { color: '#1565C0' }]}>
              {side === 'front' ? '앞면' : '뒷면'}
            </Text>
            <Text style={styles.photoHint}>탭하여 추가</Text>
          </>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.content}>
            <Text style={styles.title}>🔍 약 검색</Text>

            {/* 탭 전환 */}
            <View style={{ flexDirection: 'row', marginBottom: 18, gap: 8 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: 'center',
                  backgroundColor: tab === 'ai' ? '#1565C0' : '#F0F7FF',
                }}
                onPress={() => setTab('ai')}
              >
                <Text style={{ color: tab === 'ai' ? '#fff' : '#1565C0', fontWeight: 'bold' }}>
                  AI 검색
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: 'center',
                  backgroundColor: tab === 'manual' ? '#1565C0' : '#F0F7FF',
                }}
                onPress={() => setTab('manual')}
              >
                <Text style={{ color: tab === 'manual' ? '#fff' : '#1565C0', fontWeight: 'bold' }}>
                  수동 검색
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* AI 검색 탭 */}
              {tab === 'ai' && (
                <>
                  <Text style={styles.subtitle}>약 앞/뒷면 사진으로 검색해요.</Text>
                  <View style={styles.photoRow}>
                    {renderPhotoBox('front')}
                    {renderPhotoBox('back')}
                  </View>
                </>
              )}

              {/* 수동 검색 탭 */}
              {tab === 'manual' && (
                <>
                  <Text style={styles.subtitle}>약의 특징을 입력해 검색해요.</Text>
                  <Text style={styles.fieldLabel}>모양</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="원형 / 타원형 / 장방형 / 캡슐"
                    placeholderTextColor="#AAA"
                    value={shape}
                    onChangeText={setShape}
                  />
                  <Text style={styles.fieldLabel}>색상</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="예: 흰색, 노란색, 분홍색"
                    placeholderTextColor="#AAA"
                    value={color}
                    onChangeText={setColor}
                  />
                  <Text style={styles.fieldLabel}>식별표시 (각인)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="예: TYLENOL, T, 155"
                    placeholderTextColor="#AAA"
                    value={imprint}
                    onChangeText={setImprint}
                  />
                  <Text style={styles.fieldLabel}>분할면</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="없음 / 1자 / 십자"
                    placeholderTextColor="#AAA"
                    value={scoreLine}
                    onChangeText={setScoreLine}
                  />
                </>
              )}

              {/* 로딩 */}
              {loading && (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color="#1565C0" size="large" />
                  <Text style={styles.loadingText}>AI가 약을 검색하고 있어요...</Text>
                </View>
              )}

              {/* 결과 */}
              {!loading && candidates && (
                <View>
                  <Text style={styles.resultTitle}>검색 결과</Text>
                  {features && (
                    <Text style={styles.featureText}>
                      특징 · 모양 {features.shape || '미상'} / 색상 {features.color || '미상'} /
                      표시 {features.imprint || '미상'} / 분할선 {features.scoreLine || '미상'}
                    </Text>
                  )}
                  {candidates.length === 0 ? (
                    <Text style={styles.emptyResult}>
                      일치하는 약을 찾지 못했어요.{'\n'}특징을 다시 확인해주세요.
                    </Text>
                  ) : (
                    candidates.map((c, idx) => (
                      <View key={`${c.masterId}-${idx}`} style={styles.candidateCard}>
                        <View style={[styles.candidateIcon, { backgroundColor: '#E3F2FD' }]}>
                          <MaterialCommunityIcons name="pill" size={22} color="#1565C0" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.candidateName}>{c.medicineName}</Text>
                          {!!c.efficacy && (
                            <Text style={styles.candidateEfficacy}>{c.efficacy}</Text>
                          )}
                          {!!c.reason && (
                            <Text style={styles.candidateReason}>{c.reason}</Text>
                          )}
                        </View>
                        <View style={[styles.rankBadge, { backgroundColor: '#1565C0' }]}>
                          <Text style={styles.rankBadgeText}>{idx + 1}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* 검색 버튼 */}
              {!loading && (
                <TouchableOpacity
                  style={[styles.primaryBtn, styles.primaryBtnSearch]}
                  onPress={() =>
                    tab === 'ai'
                      ? identifyByPhoto()
                      : identifyByManual({ shape, color, imprint, scoreLine })
                  }
                >
                  <Text style={styles.primaryBtnText}>
                    {candidates ? '다시 검색하기' : '검색하기'}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={close}>
                <Text style={styles.cancelText}>닫기</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>

        {/* 사진 찍기 / 보관함 시트 (AI 검색 탭) */}
        <Modal visible={sheetSide !== null} animationType="fade" transparent>
          <TouchableOpacity
            style={styles.sheetOverlay}
            activeOpacity={1}
            onPress={() => setSheetSide(null)}
          >
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>
                {sheetSide === 'front' ? '앞면' : '뒷면'} 사진 추가
              </Text>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.sheetBtnManual]}
                onPress={() => {
                  const side = sheetSide!;
                  setSheetSide(null);
                  takePhoto(side);
                }}
              >
                <MaterialCommunityIcons name="camera" size={24} color="#1565C0" />
                <Text style={[styles.sheetBtnText, { color: '#1565C0' }]}>사진 찍기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.sheetBtnManual]}
                onPress={() => {
                  const side = sheetSide!;
                  setSheetSide(null);
                  pickFromLibrary(side);
                }}
              >
                <MaterialCommunityIcons name="image-multiple" size={24} color="#1565C0" />
                <Text style={[styles.sheetBtnText, { color: '#1565C0' }]}>사진 보관함</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetCancel} onPress={() => setSheetSide(null)}>
                <Text style={styles.sheetCancelText}>취소</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      </Modal>
    </>
  );
};
