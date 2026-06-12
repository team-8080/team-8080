// styles/medicineAiStyles.ts
// AI 약 등록 / AI 약 검색 화면 공용 스타일
// register 화면(초록/파랑 테마)과 톤을 맞춤
import { StyleSheet } from 'react-native';

export const medicineAiStyles = StyleSheet.create({
  // 모달 오버레이 (register.tsx 의 modalOverlay 와 동일 톤)
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '88%',
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 6,
    textAlign: 'center',
    color: '#1A1A1A',
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    marginBottom: 20,
  },

  // 사진 추가 영역 (앞면/뒷면)
  photoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  photoBox: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#D5EAD8',
    borderStyle: 'dashed',
    backgroundColor: '#F1FBF2',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoBoxFilled: {
    borderStyle: 'solid',
    borderColor: '#2E7D32',
    backgroundColor: '#fff',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
    marginTop: 8,
  },
  photoHint: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },

  // 수동 입력 필드 (검색)
  input: {
    borderBottomWidth: 1,
    borderColor: '#DDD',
    marginBottom: 16,
    padding: 10,
    fontSize: 16,
  },
  fieldLabel: {
    fontSize: 13,
    color: '#555',
    marginBottom: 4,
    fontWeight: '600',
  },

  // 분석 버튼
  primaryBtn: {
    backgroundColor: '#2E7D32',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnSearch: {
    backgroundColor: '#1565C0',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  primaryBtnDisabled: {
    opacity: 0.4,
  },
  cancelText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 14,
    fontSize: 15,
  },

  // 로딩
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },

  // 후보 결과 카드
  resultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  featureText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 14,
  },
  candidateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  candidateIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  candidateName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#222',
  },
  candidateEfficacy: {
    fontSize: 13,
    color: '#1565C0',
    marginTop: 2,
  },
  candidateReason: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyResult: {
    textAlign: 'center',
    color: '#999',
    paddingVertical: 24,
    fontSize: 14,
  },

  // 등록하기/수동 선택 액션 시트
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 18,
    textAlign: 'center',
  },
  sheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 14,
    marginBottom: 12,
  },
  sheetBtnAi: {
    backgroundColor: '#F1FBF2',
    borderWidth: 1.5,
    borderColor: '#D5EAD8',
  },
  sheetBtnManual: {
    backgroundColor: '#F0F7FF',
    borderWidth: 1.5,
    borderColor: '#D1E4FF',
  },
  sheetBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 14,
  },
  sheetBtnSub: {
    fontSize: 12,
    color: '#999',
    marginLeft: 'auto',
  },
  sheetCancel: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetCancelText: {
    fontSize: 15,
    color: '#888',
  },
});
