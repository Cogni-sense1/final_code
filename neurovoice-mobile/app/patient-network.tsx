import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type NetTab = 'suggestions' | 'connections' | 'groups' | 'settings';

const SUGGESTIONS = [
  { id: 1, name: 'WillowTree42', stage: 2, diagYear: 2019, interests: ['Yoga', 'Gardening'], score: 0.91, bio: 'Living with PD for 5 years. Love sharing tips on staying active.' },
  { id: 2, name: 'BlueSky_PD', stage: 2, diagYear: 2020, interests: ['Reading', 'Cooking'], score: 0.84, bio: 'Diagnosed in 2020. Looking for others at a similar stage.' },
  { id: 3, name: 'MorningWalker', stage: 2.5, diagYear: 2018, interests: ['Walking', 'Music'], score: 0.76, bio: 'Daily walks keep me going. Happy to connect!' },
];

const CONNECTIONS = [
  { id: 1, name: 'SunriseHiker', stage: 2, lastMessage: 'How did your physio go?', time: '10m ago', unread: 2 },
  { id: 2, name: 'QuietStrength', stage: 1.5, lastMessage: 'Thanks for the tip on Levodopa timing!', time: '2h ago', unread: 0 },
];

const GROUP_MSGS = [
  { author: 'WillowTree42', text: 'Morning everyone! Had a great physio session 💪', time: '9:12 AM', isMe: false },
  { author: 'BlueSky_PD', text: 'Anyone else finding cold weather makes tremors worse?', time: '9:45 AM', isMe: false },
  { author: 'You', text: 'Yes! Warm gloves help me a lot.', time: '10:02 AM', isMe: true },
  { author: 'MorningWalker', text: 'My neurologist suggested light stretching before going out.', time: '10:18 AM', isMe: false },
];

export default function PatientNetwork() {
  const [tab, setTab] = useState<NetTab>('suggestions');
  const [requestSent, setRequestSent] = useState<number[]>([]);
  const [message, setMessage] = useState('');

  const TABS: { key: NetTab; label: string }[] = [
    { key: 'suggestions', label: 'Suggest' },
    { key: 'connections', label: 'Connect' },
    { key: 'groups', label: 'Groups' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={s.title}>Support Network</Text>
          <View style={{ position: 'relative' }}>
            <TouchableOpacity style={s.backBtn}>
              <Ionicons name="notifications-outline" size={20} color="#1A1A1A" />
            </TouchableOpacity>
            <View style={s.badge}><Text style={s.badgeText}>2</Text></View>
          </View>
        </View>

        {/* Stats */}
        <View style={s.summaryRow}>
          {[
            { icon: 'people', color: '#5DBEA3', value: '2', label: 'Connections' },
            { icon: 'chatbubble', color: '#7B68EE', value: '2', label: 'Unread' },
            { icon: 'heart', color: '#FF6B6B', value: 'HY 2', label: 'Your Stage' },
          ].map(item => (
            <View key={item.label} style={s.summaryCard}>
              <Ionicons name={item.icon as any} size={18} color={item.color} />
              <Text style={s.summaryValue}>{item.value}</Text>
              <Text style={s.summaryLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Tabs */}
        <View style={s.tabBar}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)}
              style={[s.tabBtn, tab === t.key && s.tabBtnActive]}>
              <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── SUGGESTIONS ── */}
        {tab === 'suggestions' && (
          <View>
            <Text style={s.sectionNote}>Patients at similar Hoehn & Yahr stages matched to you</Text>
            {SUGGESTIONS.map(p => (
              <View key={p.id} style={s.card}>
                <View style={s.profileRow}>
                  <View style={s.avatar}><Text style={s.avatarText}>{p.name[0]}</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={s.nameRow}>
                      <Text style={s.profileName}>{p.name}</Text>
                      <View style={s.stageBadge}><Text style={s.stageBadgeText}>HY {p.stage}</Text></View>
                    </View>
                    <Text style={s.profileSub}>Diagnosed {p.diagYear} · {p.interests.join(', ')}</Text>
                  </View>
                  <View style={s.scoreRow}>
                    <Ionicons name="star" size={11} color="#FF9F43" />
                    <Text style={s.scoreText}>{Math.round(p.score * 100)}%</Text>
                  </View>
                </View>
                <Text style={s.profileBio}>{p.bio}</Text>
                <TouchableOpacity
                  onPress={() => setRequestSent(prev => [...prev, p.id])}
                  disabled={requestSent.includes(p.id)}
                  style={[s.connectBtn, requestSent.includes(p.id) && s.connectBtnSent]}>
                  <Text style={[s.connectBtnText, requestSent.includes(p.id) && { color: '#B8B8B8' }]}>
                    {requestSent.includes(p.id) ? 'Request Sent ✓' : 'Connect'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ── CONNECTIONS ── */}
        {tab === 'connections' && (
          <View>
            {CONNECTIONS.map(c => (
              <View key={c.id} style={s.card}>
                <View style={s.connRow}>
                  <View style={[s.avatar, { backgroundColor: '#C8E6DD' }]}>
                    <Text style={[s.avatarText, { color: '#5DBEA3' }]}>{c.name[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.nameRow}>
                      <Text style={s.profileName}>{c.name}</Text>
                      <View style={[s.stageBadge, { backgroundColor: '#C8E6DD' }]}>
                        <Text style={[s.stageBadgeText, { color: '#5DBEA3' }]}>HY {c.stage}</Text>
                      </View>
                    </View>
                    <Text style={s.profileSub} numberOfLines={1}>{c.lastMessage}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={s.timeText}>{c.time}</Text>
                    {c.unread > 0 && (
                      <View style={s.unreadBadge}><Text style={s.unreadText}>{c.unread}</Text></View>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── GROUPS ── */}
        {tab === 'groups' && (
          <View>
            <View style={s.card}>
              <View style={s.connRow}>
                <View style={[s.avatar, { backgroundColor: '#DDD8F5' }]}>
                  <Ionicons name="people" size={20} color="#7B68EE" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.profileName}>HY Stage 2 Group</Text>
                  <Text style={s.profileSub}>24 members · 8 active today</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#B8B8B8" />
              </View>
            </View>

            <View style={s.card}>
              <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                {GROUP_MSGS.map((m, i) => (
                  <View key={i} style={[s.msgRow, m.isMe && s.msgRowMe]}>
                    {!m.isMe && (
                      <View style={[s.avatar, { width: 28, height: 28, borderRadius: 14 }]}>
                        <Text style={[s.avatarText, { fontSize: 11 }]}>{m.author[0]}</Text>
                      </View>
                    )}
                    <View style={{ maxWidth: '75%' }}>
                      {!m.isMe && <Text style={s.msgAuthor}>{m.author}</Text>}
                      <View style={[s.msgBubble, m.isMe && s.msgBubbleMe]}>
                        <Text style={[s.msgText, m.isMe && { color: '#fff' }]}>{m.text}</Text>
                      </View>
                      <Text style={[s.msgTime, m.isMe && { textAlign: 'right' }]}>{m.time}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
              <View style={s.inputRow}>
                <TextInput value={message} onChangeText={setMessage}
                  placeholder="Message the group…" placeholderTextColor="#B8B8B8"
                  style={s.msgInput} />
                <TouchableOpacity onPress={() => setMessage('')} style={s.sendBtn}>
                  <Ionicons name="send" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ── SETTINGS ── */}
        {tab === 'settings' && (
          <View>
            <View style={s.card}>
              <Text style={s.cardTitle}>Your Network Profile</Text>
              <View style={s.profileRow}>
                <View style={[s.avatar, { width: 52, height: 52, borderRadius: 26 }]}>
                  <Text style={[s.avatarText, { fontSize: 22 }]}>Y</Text>
                </View>
                <View>
                  <Text style={s.profileName}>YourAlias_PD</Text>
                  <Text style={s.profileSub}>HY Stage 2 · Diagnosed 2019</Text>
                </View>
              </View>
              {[
                { label: 'Network Visibility', sub: 'Visible to others', on: true },
                { label: 'Connection Requests', sub: 'Accepting', on: true },
                { label: 'Group Messages', sub: 'Notifications on', on: true },
              ].map(item => (
                <View key={item.label} style={s.settingRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.settingLabel}>{item.label}</Text>
                    <Text style={s.settingSubLabel}>{item.sub}</Text>
                  </View>
                  <View style={[s.toggle, item.on && s.toggleOn]}>
                    <View style={[s.toggleThumb, item.on && s.toggleThumbOn]} />
                  </View>
                </View>
              ))}
            </View>

            <View style={s.card}>
              <View style={s.connRow}>
                <Ionicons name="shield-checkmark" size={20} color="#5DBEA3" />
                <View style={{ flex: 1 }}>
                  <Text style={s.profileName}>Community Guidelines</Text>
                  <Text style={s.profileSub}>Be respectful, protect your privacy, and never share medical advice. This is a peer support space.</Text>
                </View>
              </View>
            </View>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EFEBE6' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#FF6B6B', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  summaryCard: { flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 14, alignItems: 'center', gap: 4 },
  summaryValue: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  summaryLabel: { fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },

  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 4, marginBottom: 14, gap: 2 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#7B68EE' },
  tabText: { fontSize: 11, fontWeight: '700', color: '#6B6B6B' },
  tabTextActive: { color: '#fff' },

  sectionNote: { fontSize: 12, color: '#6B6B6B', marginBottom: 10 },

  card: { backgroundColor: '#fff', borderRadius: 24, padding: 18, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 14 },

  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#DDD8F5', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#7B68EE' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  profileName: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  stageBadge: { backgroundColor: '#DDD8F5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  stageBadgeText: { fontSize: 10, fontWeight: '700', color: '#7B68EE' },
  profileSub: { fontSize: 11, color: '#999' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  scoreText: { fontSize: 11, fontWeight: '700', color: '#FF9F43' },
  profileBio: { fontSize: 12, color: '#6B6B6B', lineHeight: 18, marginBottom: 12 },
  connectBtn: { backgroundColor: '#7B68EE', borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  connectBtnSent: { backgroundColor: '#F0F0F0' },
  connectBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  connRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeText: { fontSize: 10, color: '#B8B8B8' },
  unreadBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#7B68EE', alignItems: 'center', justifyContent: 'center' },
  unreadText: { fontSize: 9, fontWeight: '700', color: '#fff' },

  msgRow: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'flex-end' },
  msgRowMe: { flexDirection: 'row-reverse' },
  msgAuthor: { fontSize: 9, color: '#999', marginBottom: 2, paddingLeft: 4 },
  msgBubble: { backgroundColor: '#F5F3FF', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  msgBubbleMe: { backgroundColor: '#7B68EE' },
  msgText: { fontSize: 13, color: '#1A1A1A', lineHeight: 18 },
  msgTime: { fontSize: 9, color: '#B8B8B8', marginTop: 2, paddingLeft: 4 },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  msgInput: { flex: 1, backgroundColor: '#F5F3FF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#1A1A1A' },
  sendBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#7B68EE', alignItems: 'center', justifyContent: 'center' },

  settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  settingLabel: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  settingSubLabel: { fontSize: 11, color: '#999', marginTop: 1 },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#E0E0E0', paddingHorizontal: 2, justifyContent: 'center' },
  toggleOn: { backgroundColor: '#7B68EE' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  toggleThumbOn: { alignSelf: 'flex-end' },
});
