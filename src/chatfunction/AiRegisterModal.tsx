// src/chatfunction/AiRegisterModal.tsx
// 'AI 등록' 선택 시 열리는 모달
// 흐름: 앞/뒷면 사진 추가 → AI 분석 → 유사 약 3가지 → 선택 → 약 이름 채워 등록 폼
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { medicineAiStyles as styles } from '../../styles/medicineAiStyles';
import { MedicineFormModal } from './MedicineFormModal';
import { Candidate, useMedicineIdentify } from './useMedicineIdentify';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void; // 등록 성공 시 목록 갱신
}

export const AiRegisterModal = ({ visible, onClose, onSaved }: Props) => {
  const {
    front,
    back,
    loading,
    features,
    candidates,
    takePhoto,
    pickFromLibrary,
    identifyByPhoto,
    reset,
  } = useMedicineIdentify('register');

  // 사진 찍기/보관함 선택 시트
  const [sheetSide, setSheetSide] = useState<'front' | 'back' | null>(null);
  // 약 이름이 채워진 등록 폼
  const [formVisible, setFormVisible] = useState(false);
  const [selectedName, setSelectedName] = useState('');

  const close = () => {
    reset();
    setSheetSide(null);
    onClose();
  };

  const onSelectCandidate = (c: Candidate) => {
    setSelectedName(c.medicineName);
    setFormVisible(true);
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
            <MaterialCommunityIcons name="camera-plus-outline" size={30} color="#2E7D32" />
            <Text style={styles.photoLabel}>{side === 'front' ? '앞면' : '뒷면'}</Text>
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
            <Text style={styles.title}>📷 AI 약 등록</Text>
            <Text style={styles.subtitle}>
              약의 앞면과 뒷면을 촬영하면{'\n'}AI가 유사한 약을 찾아드려요.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* 사진 영역 */}
              <View style={styles.photoRow}>
                {renderPhotoBox('front')}
                {renderPhotoBox('back')}
              </View>

              {/* 로딩 */}
              {loading && (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color="#2E7D32" size="large" />
                  <Text style={styles.loadingText}>AI가 약을 분석하고 있어요...</Text>
                </View>
              )}

              {/* 결과 */}
              {!loading && candidates && (
                <View>
                  <Text style={styles.resultTitle}>이런 약과 비슷해요</Text>
                  {features && (
                    <Text style={styles.featureText}>
                      추출 특징 · 모양 {features.shape || '미상'} / 색상{' '}
                      {features.color || '미상'} / 표시 {features.imprint || '미상'} / 분할선{' '}
                      {features.scoreLine || '미상'}
                    </Text>
                  )}
                  {candidates.length === 0 ? (
                    <Text style={styles.emptyResult}>
                      비슷한 약을 찾지 못했어요.{'\n'}다른 사진으로 다시 시도해보세요.
                    </Text>
                  ) : (
                    candidates.map((c, idx) => (
                      <TouchableOpacity
                        key={`${c.masterId}-${idx}`}
                        style={styles.candidateCard}
                        onPress={() => onSelectCandidate(c)}
                      >
                        <View style={styles.candidateIcon}>
                          <MaterialCommunityIcons name="pill" size={22} color="#2E7D32" />
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
                        <View style={styles.rankBadge}>
                          <Text style={styles.rankBadgeText}>{idx + 1}</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              {/* 분석 버튼 (결과 전 또는 재분석) */}
              {!loading && (
                <TouchableOpacity
                  style={[styles.primaryBtn, !front && styles.primaryBtnDisabled]}
                  onPress={identifyByPhoto}
                  disabled={!front}
                >
                  <Text style={styles.primaryBtnText}>
                    {candidates ? '다시 분석하기' : 'AI로 약 찾기'}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={close}>
                <Text style={styles.cancelText}>닫기</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>

        {/* 사진 찍기 / 보관함 선택 시트 */}
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
                style={[styles.sheetBtn, styles.sheetBtnAi]}
                onPress={() => {
                  const side = sheetSide!;
                  setSheetSide(null);
                  takePhoto(side);
                }}
              >
                <MaterialCommunityIcons name="camera" size={24} color="#2E7D32" />
                <Text style={[styles.sheetBtnText, { color: '#2E7D32' }]}>사진 찍기</Text>
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

      {/* 약 선택 후 등록 폼 (약 이름 자동 채움) */}
      <MedicineFormModal
        visible={formVisible}
        initialName={selectedName}
        onClose={() => setFormVisible(false)}
        onSaved={() => {
          setFormVisible(false);
          close();
          onSaved();
        }}
      />
    </>
  );
};
