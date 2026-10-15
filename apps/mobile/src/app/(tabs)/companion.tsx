import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ChatMessage, CompanionReply } from '@neurovoice/shared';
import { api, errorText, useProfile } from '@/lib/api';
import { C } from '@/theme';
import { ErrorNote, H1, Icon, Loading, Screen, Soft } from '@/ui';

const ASK = ['How has my week looked?', 'What does an off period mean?', 'What do you remember about me?'];

/** Messages, plus a small note whenever the companion saved something. */
type Entry = { id: string; message?: ChatMessage; saved?: string };

const saved = (out: CompanionReply): Entry[] =>
  out.remembered.map((m) => ({ id: `mem-${m.id}`, saved: m.kind === 'doctor' ? `Saved for your doctor: ${m.text}` : `I'll remember: ${m.text}` }));

export default function Companion() {
  const profile = useProfile();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [aloud, setAloud] = useState(false);
  const list = useRef<FlatList<Entry>>(null);
  const aloudRef = useRef(aloud);
  aloudRef.current = aloud;

  const add = useCallback((more: Entry[]) => setEntries((cur) => [...(cur ?? []), ...more]), []);
  // The phone reads replies in its own voice. Typing can be dictated with the keyboard's microphone.
  const say = useCallback((reply: string) => {
    if (aloudRef.current) Speech.speak(reply, { language: profile.locale, rate: 0.95 });
  }, [profile.locale]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const history = await api.chatHistory();
        if (!live) return;
        setEntries(history.map((m) => ({ id: m.id, message: m })));
        // After a gap the companion starts the conversation itself.
        const { opened } = await api.openCompanion();
        if (live && opened) add([{ id: opened.reply.id, message: opened.reply }]);
      } catch (err) {
        if (live) { setError(errorText(err)); setEntries((cur) => cur ?? []); }
      }
    })();
    return () => { live = false; void Speech.stop(); };
  }, [add]);

  async function send(value: string) {
    const body = value.trim();
    if (!body || sending) return;
    setText('');
    setError('');
    setSending(true);
    add([{ id: `tmp${Date.now()}`, message: { id: 'tmp', at: new Date().toISOString(), role: 'user', text: body } }]);
    try {
      const out = await api.chat(body);
      add([{ id: out.reply.id, message: out.reply }, ...saved(out)]);
      say(out.reply.text);
    } catch (err) {
      setError(errorText(err));
    }
    setSending(false);
  }

  const count = (entries ?? []).filter((e) => e.message).length;
  return (
    <Screen scroll={false} style={{ paddingBottom: 12 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={70}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}><H1>Your companion</H1><Soft>It remembers what matters to you.</Soft></View>
          <Pressable accessibilityLabel={aloud ? 'Stop reading replies aloud' : 'Read replies aloud'} onPress={() => { if (aloud) void Speech.stop(); setAloud(!aloud); }}
            style={[styles.round, aloud && { backgroundColor: C.brand }]}><Icon name="volume" color={aloud ? C.white : C.ink} /></Pressable>
        </View>

        {!entries ? <Loading /> : (
          <FlatList
            ref={list} data={entries} keyExtractor={(e) => e.id} style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingVertical: 12 }}
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={<Soft style={{ textAlign: 'center', marginTop: 40 }}>Tell me about your day, or ask me anything about Parkinson's or your own results.</Soft>}
            ListFooterComponent={
              <View style={{ gap: 10 }}>
                {sending && <View style={[styles.bubble, styles.theirs]}><Text style={styles.typing}>…</Text></View>}
                {count <= 2 && !sending && <View style={styles.asks}>{ASK.map((q) => <Pressable key={q} onPress={() => void send(q)} style={styles.ask}><Text style={styles.askText}>{q}</Text></Pressable>)}</View>}
                {error ? <ErrorNote>{error}</ErrorNote> : null}
              </View>
            }
            renderItem={({ item }) => item.message ? (
              <View style={[styles.bubble, item.message.role === 'user' ? styles.mine : styles.theirs]}>
                <Text style={[styles.words, item.message.role === 'user' && { color: C.white }]}>{item.message.text}</Text>
              </View>
            ) : <Text style={styles.saved}>{item.saved}</Text>}
          />
        )}

        <View style={styles.bar}>
          <TextInput style={styles.input} value={text} onChangeText={setText} placeholder="Type or dictate a message" placeholderTextColor={C.inkFaint} multiline maxLength={1200} />
          <Pressable accessibilityLabel="Send" onPress={() => void send(text)} disabled={!text.trim() || sending} style={[styles.round, styles.send, (!text.trim() || sending) && { opacity: 0.4 }]}>
            <Icon name="send" color={C.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '86%', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12 },
  mine: { alignSelf: 'flex-end', backgroundColor: C.navy, borderBottomRightRadius: 8 },
  theirs: { alignSelf: 'flex-start', backgroundColor: C.white, borderBottomLeftRadius: 8 },
  words: { fontSize: 17, lineHeight: 25, color: C.ink },
  typing: { fontSize: 24, lineHeight: 24, color: C.inkFaint, fontWeight: '800' },
  saved: { alignSelf: 'center', backgroundColor: C.goodSoft, color: C.good, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, fontWeight: '700', textAlign: 'center', overflow: 'hidden', maxWidth: '92%' },
  asks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 6 },
  ask: { backgroundColor: C.brandSoft, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 9 },
  askText: { color: C.brandDeep, fontWeight: '700', fontSize: 14 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 8 },
  input: { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 26, paddingHorizontal: 18, paddingVertical: 14, fontSize: 17, color: C.ink, maxHeight: 130 },
  send: { backgroundColor: C.brand, width: 52, height: 52, borderRadius: 26 },
});
