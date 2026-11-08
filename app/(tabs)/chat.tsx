import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { ChatModal, useManagedUsers, useVoiceAlert } from '../../src/chatfunction';

import { AiChatScreen } from '../../src/chatfunction/AiChatScreen';
import { SummaryModal } from '../../src/chatfunction/SummaryModal';
import { chatStyles as styles } from '../../styles/chatStyles';

export default function ChatScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [aiChatVisible, setAiChatVisible] = useState(false);   // AI 상담 채팅 화면
  const [summaryVisible, setSummaryVisible] = useState(false); // 상담 기록 팝업
  const [inquiryVisible, setInquiryVisible] = useState(false); // ★ 문의하기 입력 모달
  const [inquiryText, setInquiryText] = useState('');          // ★ 입력 텍스트 저장

  const managedUsers = useManagedUsers();
  const { sendVoiceAlert } = useVoiceAlert();

  const handleSendInquiry = () => {
    if (!inquiryText.trim()) {
      return Alert.alert("알림", "문의 내용을 입력해주세요.");
    }
    setInquiryVisible(false);
    setInquiryText('');
    Alert.alert("전송 완료", "관리자에게 전달이 되었습니다.");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Text style={styles.headerTitle}>채팅</Text></View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 1. AI 건강 상담사 → 채팅 화면 열기 */}
        <TouchableOpacity
          style={[styles.menuButton, styles.mainButton]}
          activeOpacity={0.8}
          onPress={() => setAiChatVisible(true)}
        >
          <View style={styles.iconWrapper}>
            <View style={styles.mainIconCircle}>
              <MaterialCommunityIcons name="robot-happy-outline" size={32} color="#2196F3" />
            </View>
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.buttonText}>AI 건강 상담사</Text>
            <Text style={styles.subText}>건강 상담 및 약 정보 제공</Text>
          </View>
        </TouchableOpacity>

        {/* 2. 상담 기록 보기 → 팝업 열기 */}
        <TouchableOpacity
          style={[styles.menuButton, { backgroundColor: '#FDF7FF', borderColor: '#F3E5F5' }]}
          onPress={() => setSummaryVisible(true)}
        >
          <View style={styles.iconWrapper}>
            <MaterialCommunityIcons name="history" size={26} color="#9C27B0" />
          </View>
          <Text style={[styles.buttonText, { color: '#9C27B0' }]}>상담 기록 보기</Text>
        </TouchableOpacity>

        {/* 3. 문의하기 */}
        <TouchableOpacity
          style={[styles.menuButton, { backgroundColor: '#F1FBF2', borderColor: '#E8F5E9' }]}
          onPress={() => setInquiryVisible(true)}
        >
          <View style={styles.iconWrapper}>
            <MaterialCommunityIcons name="help-circle-outline" size={26} color="#2E7D32" />
          </View>
          <Text style={[styles.buttonText, { color: '#2E7D32' }]}>문의하기</Text>
        </TouchableOpacity>

        {/* 4. 음성 메시지 보내기 */}
        <TouchableOpacity
          style={[styles.menuButton, { backgroundColor: '#EEF6FF' }]}
          onPress={() => {
            console.log("버튼 클릭됨!");
            setModalVisible(true);
          }}
        >
          <View style={styles.iconWrapper}>
            <MaterialCommunityIcons name="volume-high" size={26} color="#0D47A1" />
          </View>
          <Text style={[styles.buttonText, { color: '#0D47A1' }]}>음성 메시지 보내기</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 문의하기 입력 팝업 모달 */}
      <Modal visible={inquiryVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 5 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#333' }}>
              관리자 문의하기
            </Text>
            
            <TextInput
              placeholder="문의 내용을 입력하세요..."
              value={inquiryText}
              onChangeText={setInquiryText}
              multiline
              numberOfLines={4}
              style={{
                height: 100,
                borderWidth: 1,
                borderColor: '#E0E0E0',
                borderRadius: 8,
                padding: 12,
                textAlignVertical: 'top',
                fontSize: 15,
                marginBottom: 16
              }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity 
                onPress={() => { setInquiryVisible(false); setInquiryText(''); }}
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F0F0F0' }}
              >
                <Text style={{ color: '#666', fontWeight: '500' }}>취소</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={handleSendInquiry}
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#2E7D32' }}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>보내기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 음성 메시지 모달 */}
      <ChatModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        users={managedUsers}
        onSend={sendVoiceAlert}
      />

      {/* AI 건강 상담 채팅 화면 */}
      <AiChatScreen
        visible={aiChatVisible}
        onClose={() => setAiChatVisible(false)}
      />

      {/* 상담 기록 보기 팝업 */}
      <SummaryModal
        visible={summaryVisible}
        onClose={() => setSummaryVisible(false)}
      />
    </SafeAreaView>
  );
}