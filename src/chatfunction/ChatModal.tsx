import React, { useState } from 'react';
import { FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
// styles 경로는 프로젝트 구조에 맞춰 수정하세요 (예: ../../styles/chatStyles)
import { chatStyles as styles } from '../../styles/chatStyles';

interface Props {
  visible: boolean;
  onClose: () => void;
  users: any[];
  onSend: (user: any, msg: string) => void;
}

export const ChatModal = ({ visible, onClose, users, onSend }: Props) => {
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [customText, setCustomText] = useState(''); // ★ 직접 입력 텍스트 상태

  const phrases = ["약 드실 시간이에요", "물을 많이 드세요", "식사 거르지 마세요"];

  const handleClose = () => {
    setSelectedUser(null);
    setCustomText('');
    onClose();
  };

  const handleSendCustomText = () => {
    if (!customText.trim()) return;
    onSend(selectedUser, customText.trim());
    handleClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          
          {/* 헤더 영역 */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {selectedUser ? "문구 선택" : "대상 선택"}
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={{ color: 'red', fontSize: 20, fontWeight: 'bold' }}>X</Text>
            </TouchableOpacity>
          </View>

          {/* 본문 영역: 대상 선택 or 문구 선택 */}
          {!selectedUser ? (
            <FlatList
              data={users}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.userItem} 
                  onPress={() => setSelectedUser(item)}
                >
                  <Text style={styles.userItemText}>{item.name} 님</Text>
                </TouchableOpacity>
              )}
            />
          ) : (
            <View style={styles.phraseContainer}>
              {/* 기존 문구 선택 버튼 */}
              {phrases.map((msg) => (
                <TouchableOpacity 
                  key={msg} 
                  style={styles.phraseBtn} 
                  onPress={() => { 
                    onSend(selectedUser, msg); 
                    handleClose(); 
                  }}
                >
                  <Text style={styles.phraseText}>{msg}</Text>
                </TouchableOpacity>
              ))}

              {/* ★ [추가] 직접 입력 영역 */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: 10,
                gap: 8
              }}>
                <TextInput
                  placeholder="메시지 직접 입력..."
                  value={customText}
                  onChangeText={setCustomText}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#333333',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 15,
                    backgroundColor: '#fff'
                  }}
                />
                <TouchableOpacity
                  onPress={handleSendCustomText}
                  style={{
                    backgroundColor: '#2196F3',
                    paddingHorizontal: 16,
                    paddingVertical: 13,
                    borderRadius: 12,
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>전송</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};