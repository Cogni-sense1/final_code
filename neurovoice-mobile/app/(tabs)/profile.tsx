// Profile screen — matches web Profile.tsx exactly
// Requirements: 10.1, 10.2, 10.3

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { getUserName, getUserRole, clearProfile, clearHistory } from '../../utils/storage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Settings row ─────────────────────────────────────────────────────────────

interface SettingsRowProps {
  iconName: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  onPress?: () => void;
  isLast?: boolean;
}

function SettingsRow({ iconName, iconBg, iconColor, label, onPress, isLast }: SettingsRowProps) {
  return (
    <TouchableOpacity
      style={[s.settingsRow, !isLast && s.settingsRowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[s.settingsIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={20} color={iconColor} />
      </View>
      <Text style={s.settingsLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color="#B8B8B8" />
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function Profile() {
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const name = await getUserName();
    setUserName(name || 'Guest User');
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadProfile(); }, [loadProfile]));

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? This will clear your profile data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await clearProfile();
            await clearHistory();
            router.replace('/');
          },
        },
      ],
    );
  };

  const initials = getInitials(userName);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Header: menu icon, "NeuroVoice", bell icon */}
        <View style={s.header}>
          <TouchableOpacity style={s.headerIconBtn}>
            <Ionicons name="menu" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>NeuroVoice</Text>
          <TouchableOpacity style={s.headerIconBtn}>
            <Ionicons name="notifications-outline" size={24} color="#1A1A1A" />
          </TouchableOpacity>
        </View>

        {/* Avatar: 128x128 circle, gradient bg from #FF8C42 to #FF6B9D, initials */}
        {loading ? (
          <ActivityIndicator color="#FF8C42" style={{ marginBottom: 28 }} />
        ) : (
          <View style={s.profileSection}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials}</Text>
            </View>
            <Text style={s.userName}>{userName}</Text>
            <View style={s.metaRow}>
              <Text style={s.metaAge}>Age: 68</Text>
              <Text style={s.metaMember}>Member since 2023</Text>
            </View>
          </View>
        )}

        {/* Medical Reports card */}
        <View style={s.card}>
          <View style={s.cardHeaderRow}>
            <Text style={s.cardTitle}>Medical Reports</Text>
            <Ionicons name="document-text-outline" size={20} color="#FF8C42" />
          </View>
          <View style={s.reportRow}>
            <View style={s.reportIcon}>
              <Ionicons name="document-text-outline" size={20} color="#FF8C42" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.reportTitle}>Latest Screening Result</Text>
              <Text style={s.reportMeta}>January 15, 2024 • Stable</Text>
            </View>
          </View>
          <View style={s.reportBtns}>
            <TouchableOpacity style={s.reportBtnPrimary}>
              <Ionicons name="document-text-outline" size={16} color="#FFFFFF" />
              <Text style={s.reportBtnPrimaryText}>View All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.reportBtnSecondary}>
              <Ionicons name="document-text-outline" size={16} color="#FF8C42" />
              <Text style={s.reportBtnSecondaryText}>Export PDF</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Assigned Specialist card */}
        <View style={s.card}>
          <View style={s.specialistRow}>
            <View style={s.specialistAvatar}>
              <Text style={s.specialistInitials}>DA</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.specialistLabel}>Assigned Specialist</Text>
              <Text style={s.specialistName}>Dr. Aris</Text>
            </View>
            <View style={s.neurologistBadge}>
              <Text style={s.neurologistText}>Neurologist</Text>
            </View>
          </View>
          <View style={s.specialistBtns}>
            <TouchableOpacity style={s.callBtn}>
              <Ionicons name="call-outline" size={16} color="#FFFFFF" />
              <Text style={s.callBtnText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.messageBtn}>
              <Ionicons name="chatbubble-outline" size={16} color="#7B68EE" />
              <Text style={s.messageBtnText}>Message</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Settings menu */}
        <View style={s.settingsCard}>
          <SettingsRow
            iconName="settings-outline"
            iconBg="#E8F5F1"
            iconColor="#5DBEA3"
            label="Account Settings"
          />
          <SettingsRow
            iconName="shield-outline"
            iconBg="#FFE8D6"
            iconColor="#FF8C42"
            label="Privacy & Security"
          />
          <SettingsRow
            iconName="help-circle-outline"
            iconBg="#E8E4FF"
            iconColor="#7B68EE"
            label="Help & Support"
            isLast
          />
        </View>

        {/* Sign Out: bg #FFE0E0, text #FF6B6B */}
        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color="#FF6B6B" />
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EFEBE6' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  headerIconBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },

  // Profile section
  profileSection: { alignItems: 'center', marginBottom: 24 },
  avatar: {
    width: 128, height: 128, borderRadius: 64,
    backgroundColor: '#FF8C42', // gradient approximated
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#FF8C42',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  avatarText: { fontSize: 48, fontWeight: '700', color: '#FFFFFF' },
  userName: { fontSize: 24, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metaAge: { fontSize: 14, fontWeight: '600', color: '#FF8C42' },
  metaMember: { fontSize: 14, color: '#6B6B6B' },

  // Card
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 24,
    padding: 20, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },

  // Medical reports
  reportRow: {
    backgroundColor: '#FFF4E6', borderRadius: 16,
    padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16,
  },
  reportIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#FFE8D6', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  reportTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 2 },
  reportMeta: { fontSize: 13, color: '#6B6B6B' },
  reportBtns: { flexDirection: 'row', gap: 12 },
  reportBtnPrimary: {
    flex: 1, backgroundColor: '#FF8C42', borderRadius: 9999,
    paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  reportBtnPrimaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  reportBtnSecondary: {
    flex: 1, backgroundColor: '#FFE8D6', borderRadius: 9999,
    paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  reportBtnSecondaryText: { color: '#FF8C42', fontSize: 13, fontWeight: '700' },

  // Specialist
  specialistRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  specialistAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#7B68EE', // gradient approximated
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  specialistInitials: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  specialistLabel: { fontSize: 11, color: '#999999', letterSpacing: 0.5, marginBottom: 2 },
  specialistName: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  neurologistBadge: { backgroundColor: '#E8E4FF', borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 4 },
  neurologistText: { fontSize: 11, fontWeight: '700', color: '#7B68EE', letterSpacing: 0.5 },
  specialistBtns: { flexDirection: 'row', gap: 12 },
  callBtn: {
    flex: 1, backgroundColor: '#7B68EE', borderRadius: 9999,
    paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  callBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  messageBtn: {
    flex: 1, backgroundColor: '#E8E4FF', borderRadius: 9999,
    paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  messageBtnText: { color: '#7B68EE', fontSize: 13, fontWeight: '700' },

  // Settings card
  settingsCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24,
    overflow: 'hidden', marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, gap: 14,
  },
  settingsRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  settingsIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  settingsLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1A1A1A' },

  // Sign out
  signOutBtn: {
    backgroundColor: '#FFE0E0', borderRadius: 24,
    paddingVertical: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  signOutText: { fontSize: 16, fontWeight: '700', color: '#FF6B6B' },
});
