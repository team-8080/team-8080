// src/chatfunction/AiChatScreen.tsx
// 'AI 건강 상담사' 버튼을 누르면 열리는 채팅 화면
import { MaterialCommunityIcons } from '@expo/vector-icons';
import axios from 'axios';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth } from '../../firebaseConfig';
import { aiChatStyles as styles } from '../../styles/aiChatStyles';

// login.tsx 와 동일한 서버 주소 규칙
const SERVER_URL = process.env.EXPO_PUBLIC_API_URL

interface Message {
  role: 'user' | 'model';
  content: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const AiChatScreen = ({ visible, onClose }: Props) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  const uid = auth.currentUser?.uid;

  // 화면이 열릴 때 오늘의 기존 대화 불러오기
  useEffect(() => {
    if (!visible || !uid) return;
    (async () => {
      try {
        const res = await axios.get(`${SERVER_URL}/api/ai/chat/${uid}`);
        setMessages(res.data.messages || []);
      } catch (e) {
        console.error('대화 기록 불러오기 실패:', e);
      }
    })();
  }, [visible, uid]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading || !uid) return;

    // 사용자 메시지를 화면에 즉시 표시
    const userMsg: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await axios.post(`${SERVER_URL}/api/ai/chat`, {
        userUid: uid,
        message: text,
      });
      const aiMsg: Message = { role: 'model', content: res.data.reply };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      console.error('AI 응답 실패:', e);
      setMessages((prev) => [
        ...prev,
        { role: 'model', content: '죄송합니다. 답변을 가져오지 못했습니다. 잠시 후 다시 시도해주세요.' },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  if (!visible) return null;

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={30} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerIconCircle}>
            <MaterialCommunityIcons name="robot-happy-outline" size={22} color="#2196F3" />
          </View>
          <Text style={styles.headerTitle}>AI 건강 상담사</Text>
        </View>
        <View style={{ width: 30 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* 대화 목록 */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, idx) => idx.toString()}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                건강 상담이나 약 정보가 궁금하시면{'\n'}편하게 물어보세요.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubbleRow,
                item.role === 'user' ? styles.rowRight : styles.rowLeft,
              ]}
            >
              <View
                style={[
                  styles.bubble,
                  item.role === 'user' ? styles.userBubble : styles.aiBubble,
                ]}
              >
                <Text
                  style={[
                    styles.bubbleText,
                    item.role === 'user' ? styles.userText : styles.aiText,
                  ]}
                >
                  {item.content}
                </Text>
              </View>
            </View>
          )}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />

        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#2196F3" />
            <Text style={styles.loadingText}>답변을 작성 중입니다...</Text>
          </View>
        )}

        {/* 입력창 */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="증상이나 약에 대해 물어보세요"
            placeholderTextColor="#999"
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, { opacity: input.trim() && !loading ? 1 : 0.4 }]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
          >
            <MaterialCommunityIcons name="send" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};