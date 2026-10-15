import {
  BedrockRuntimeClient, ConverseCommand, type ContentBlock, type Message, type Tool, type ToolResultBlock, type ToolUseBlock,
} from '@aws-sdk/client-bedrock-runtime';
import {
  type AssessmentType, type ChatMessage, type Checkin, type Memory, type Profile,
  baselineKey, MODALITIES, rbdPattern, STATUS_COPY,
} from '@neurovoice/shared';
import { aiFailed, aiUsable } from '../adapters';
import { env } from '../env';
import { getOne, list, newId, putOne, SK } from '../repo';
import { getStore } from '../store';
import { addDays, daysAgoIso, localDate, nowIso } from '../time';
import { insights, listSleep, medicationDay } from './health';
import { consolidateDay, getDays, listAssessments } from './tracking';

// The Converse API speaks to any Bedrock chat model with one request shape, so the model
// is a setting (BEDROCK_MODEL_ID): Amazon Nova by default, Claude or others by changing it.
let client: BedrockRuntimeClient | undefined;
const bedrock = (): BedrockRuntimeClient => (client ??= new BedrockRuntimeClient({ region: env.bedrockRegion }));

/** How much of the conversation the model sees each turn. Older context lives in memories. */
const HISTORY_TURNS = 40;
const MAX_MEMORIES = 80;
/** After this long without a message, opening the screen starts a fresh greeting. */
const GREET_AFTER_MS = 3 * 3600_000;
const OPENED = '[The person has just opened the check-in screen and has not said anything yet. Greet them and start the conversation yourself.]';

const SYSTEM = `You are the NeuroVoice companion: a warm, attentive daily check-in partner for people living with Parkinson's disease, or watching for its early signs, and sometimes for the family who care for them.

You are having a real conversation, usually spoken aloud. Talk the way a kind, well-informed friend would.

How to talk
- Natural spoken language. Usually one to three sentences. Go longer only when they ask you to explain something.
- Your words are read aloud by a voice, so never use lists, headings, markdown, emoji, or symbols.
- One question at a time. Listen first: pick up on the specific thing they just told you and show real interest in it before asking anything new.
- Never fall back on stock phrases. Do not open two replies the same way.
- Reply in the language the person uses. Many users are older; be patient, plain, and unhurried.
- Use what you remember about them where it fits naturally, the way a friend would. Do not recite it back.

Answering questions
- People will ask you things: what a symptom or a term means, how sleep or exercise relates to Parkinson's, what a check measures, how their week has looked. Answer plainly and accurately, in everyday words. If you are not sure, say so.
- For anything about their own data (checks, trends, medication, sleep) use the lookup tools. Never guess or invent anything about their data.
- The app compares each check with the person's own baseline. Describe results only in plain words: within their usual range, a little off their usual, or clearly different from their usual. Never read out index values, scores, or decimals. One off day is ordinary; several in a row is worth mentioning to their doctor.
- Do not bring up their check results unless they ask, and never guess at what caused a result.
- When they ask and their results are off their usual, say so honestly but calmly, in a sentence or two. Remind them it is a comparison with their own normal, not a diagnosis, and that tiredness, illness, or a noisy room can shift it. Then ask how they have been feeling.

Facts you can rely on
- "On" time is when Parkinson's medication is working well and symptoms are controlled. An "off" period is when the medication, usually levodopa, is not working well and symptoms such as stiffness, slowness, or tremor come back. It often happens as a dose wears off before the next one is due, which is called wearing off.
- Dyskinesia is involuntary, fidgety or writhing extra movement, often when medication levels are at their peak. It is not the same as tremor.
- Dystonia is a sustained, often painful muscle cramp or curling, for example of the toes, common in the early morning or during off periods.
- Bradykinesia means slowness of movement. Rigidity means stiffness. Reduced facial expression is sometimes called a masked face.
- Acting out dreams during sleep is called REM sleep behaviour disorder. It is worth telling a doctor about.
- Hoehn and Yahr is a scale from one to five describing how much Parkinson's affects movement and balance.
- The checks: voice measures how steady pitch and loudness are and how clear the voice is. Face measures blinking and how much the face moves. Finger tapping measures speed, rhythm, and whether taps get smaller. Drawing measures smoothness and tremor. Walking measures step rhythm and arm swing. The big movements game practises large, deliberate movement.
- Regular exercise, good sleep, and taking medication on time as prescribed all matter in Parkinson's. Speech and movement therapy with a trained therapist can help.

Hard limits
- You are not a doctor. Never diagnose. Never say or imply that a result means they have Parkinson's or that it is progressing.
- Never suggest starting, stopping, skipping, or changing a medicine or its dose or timing. Say that is a decision for their doctor, and offer to save the question for their next visit.
- If they describe a fall with injury, chest pain, sudden weakness or confusion, trouble swallowing or breathing, or thoughts of harming themselves, tell them clearly and calmly to contact a doctor or emergency services now, and to reach someone they trust.

Remembering
- A note-taker listens alongside you and saves personal details and how the person's day is going, so you never need to save those yourself. Just respond naturally. It is fine to say you will remember something.
- Your notes about the person are listed below. If they ask what you remember, tell them honestly from those notes. If they ask you to forget something, use the forget tool.
- When they have a question that needs their doctor, offer to save it for their next visit. Once they agree, the note-taker saves it, and you can tell them it is saved.

Today's check-in
- Over the conversation, gently learn how they slept, how their mood is, and how movement feels today, without interrogating them.

Using your tools
- Call the right tool every time it applies, before you answer.
- Tools are silent. Never mention them and never say you are looking something up. After using a tool, simply carry on the conversation.
- Never write your reasoning or any tags in your reply. Reply only with the words to be spoken.`;

const tool = (name: string, description: string, properties: Record<string, Record<string, string>> = {}, required: string[] = []): Tool => ({
  toolSpec: { name, description, inputSchema: { json: { type: 'object', properties, required } } },
});

const TOOLS: Tool[] = [
  tool('get_trend', 'Look up how their checks have compared with their own baseline over the last two weeks.'),
  tool('get_medication', 'Look up the medication schedule for today, what has been logged, and patterns over the last two weeks.'),
  tool('get_sleep', 'Look up the last seven logged nights of sleep.'),
  tool('forget', 'Delete one of your notes when the person asks you to forget it.',
    { id: { type: 'string', description: 'The id shown in square brackets before the note.' } }, ['id']),
];

// ── The note-taker ───────────────────────────────────────────────────────────
// A second, single-purpose pass over each thing the person says. It runs alongside the
// reply, so capturing memories and the day's check-in never depends on the conversational
// model remembering to do it, and adds no waiting.

const NOTE_TAKER = `You keep notes for a companion that talks daily with a person who has, or is watching for, Parkinson's disease. You will be shown the last few lines of the conversation. Take notes only on the person's LATEST message, using the earlier lines for context. Call the save tool exactly once.

Fill in a field only when the latest message clearly states it:
- sleepQuality: how they slept last night, 1 (very badly) to 5 (very well).
- mood: their mood today, 1 (very low) to 5 (very good).
- motorDifficulty: how hard movement is today, 1 (no difficulty) to 5 (severe). Stiffness, tremor, slowness, or freezing today count.
- dayNote: one short sentence about today worth keeping, only if there is something specific.
- doctorQuestion: a question or concern for their doctor, only when the person has just asked for it to be saved or has just agreed to the companion's offer to save it. Write the question itself, in their words, taken from the conversation.
- memories: zero to two short third-person notes of lasting facts about the person: people in their life, routines, things they enjoy, worries, goals, what helps them (for example: "Morning yoga helps her feel settled."), preferences about how to be spoken to. Write each so it makes sense on its own months from now.

Do not put passing states (tired today, slept well) in memories; those belong in the other fields. Do not save questions, small talk, or anything already in the existing notes. If nothing qualifies, call save with an empty memories list.`;

const SAVE_TOOL = tool('save', 'Record what the latest message states.', {
  sleepQuality: { type: 'integer', description: '1 to 5, only if stated' },
  mood: { type: 'integer', description: '1 to 5, only if stated' },
  motorDifficulty: { type: 'integer', description: '1 to 5, only if stated' },
  dayNote: { type: 'string', description: 'One short sentence about today, only if specific' },
  doctorQuestion: { type: 'string', description: 'A question for their doctor, only if they just asked or agreed to save it' },
  memories: { type: 'array', description: 'Zero to two lasting facts, each a short third-person sentence' },
}, ['memories']);

// ── Memory ───────────────────────────────────────────────────────────────────

export const listMemories = (userId: string): Promise<Memory[]> => list<Memory>(userId, { prefix: 'MEM#' });

async function addMemory(userId: string, text: string, kind: Memory['kind']): Promise<Memory> {
  const memory: Memory = { id: newId().slice(0, 6), at: nowIso(), text: text.trim().slice(0, 300), kind };
  await putOne(userId, SK.memory(memory.at, memory.id), memory);
  const about = (await listMemories(userId)).filter((m) => m.kind === 'about');
  // Oldest notes make way once the list is long.
  for (const old of about.slice(0, Math.max(0, about.length - MAX_MEMORIES))) await deleteMemory(userId, old.id);
  return memory;
}

export async function deleteMemory(userId: string, id: string): Promise<boolean> {
  const found = (await listMemories(userId)).find((m) => m.id === id);
  if (!found) return false;
  await getStore().delete(`USER#${userId}`, SK.memory(found.at, found.id));
  return true;
}

// ── Lookups the model can call ───────────────────────────────────────────────

const checkName = (key: string): string => {
  const [type, task] = key.split(':') as [AssessmentType, string | undefined];
  const spec = MODALITIES[type];
  return task ? `${spec?.name ?? type} (${spec?.tasks?.find((t) => t.id === task)?.name ?? task})` : (spec?.name ?? type);
};

async function trendLookup(profile: Profile): Promise<object> {
  const today = localDate(nowIso(), profile.timezone);
  const days = await getDays(profile.userId, addDays(today, -13), today);
  const active = days.filter((d) => Object.keys(d.modalities).length);
  const latest = new Map<string, { status: string; index: number | null; when: string }>();
  for (const a of await listAssessments(profile.userId, { sinceIso: daysAgoIso(14) })) {
    const key = baselineKey(a.type, a.task);
    if (a.quality.usable && !latest.has(key)) latest.set(key, { status: STATUS_COPY[a.deviation.status].label, index: a.deviation.index, when: localDate(a.takenAt, profile.timezone) });
  }
  const scored = active.filter((d) => d.composite !== null);
  return {
    how_to_read: 'index is distance from their own baseline; about 1 is a little off, 2 or more is clearly different, positive means the worse direction',
    today,
    days_with_checks_in_last_14: active.length,
    all_checks_combined: scored.slice(-7).map((d) => ({ date: d.date, index: d.composite, status: STATUS_COPY[d.status].label })),
    by_check: [...latest].map(([key, v]) => ({ check: checkName(key), latest: v.status, index: v.index, last_done: v.when, sessions_in_14_days: active.reduce((n, d) => n + (d.modalities[key]?.sessions ?? 0), 0) })),
    done_today: Object.keys(days.find((d) => d.date === today)?.modalities ?? {}).map(checkName),
    reminder: 'Describe this in plain words. Do not diagnose or suggest a cause.',
  };
}

async function medicationLookup(profile: Profile): Promise<object> {
  const { schedule } = await medicationDay(profile);
  const i = await insights(profile, 14);
  return {
    today: schedule.map((s) => ({ medicine: s.name, dose: `${s.dose} ${s.unit}`, time: s.time, status: s.status })),
    last_14_days: {
      doses_logged_percent: i.adherencePct, off_periods_logged: i.offReports, off_periods_cluster_around: i.peakLabel,
      minutes_from_levodopa_dose_to_feeling_on: i.kickInMinutes, minutes_from_levodopa_dose_to_next_off: i.wearingOffMinutes,
    },
    reminder: 'Describe what was logged. Do not advise on changing medicines, doses, or timing.',
  };
}

async function sleepLookup(profile: Profile): Promise<object> {
  const nights = await listSleep(profile.userId, 14);
  return {
    last_nights: nights.slice(-7).map((n) => ({ night_of: n.date, hours: n.hours, score_out_of_100: n.score, times_woken: n.awakenings, acted_out_dreams: n.actedOutDreams })),
    nights_with_dream_enactment_in_14: rbdPattern(nights).nights,
  };
}

// ── The conversation ─────────────────────────────────────────────────────────

type Extracted = Partial<Pick<Checkin, 'sleepQuality' | 'mood' | 'motorDifficulty' | 'notes'>>;
interface Turn { text: string; checkin: Extracted | null; remembered: Memory[]; mayForget?: boolean }
/** Notes are only ever deleted when the person's own words ask for it. */
const ASKS_TO_FORGET = /forget|delete|remove|erase|don'?t remember|stop remembering|भूल|bhool/i;
const scale = (v: unknown): number | undefined => (typeof v === 'number' && v >= 1 && v <= 5 ? Math.round(v) : undefined);

async function context(profile: Profile, memories: Memory[]): Promise<string> {
  const tz = profile.timezone;
  const today = localDate(nowIso(), tz);
  const [day] = await getDays(profile.userId, today, today);
  const { schedule } = await medicationDay(profile);
  const due = schedule.filter((s) => s.status === 'due' || s.status === 'missed').map((s) => `${s.name} ${s.time}`);
  const about = memories.filter((m) => m.kind === 'about').slice(-50);
  const doctor = memories.filter((m) => m.kind === 'doctor').slice(-10);
  const now = new Date().toLocaleString('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  return [
    `It is ${now} where the person is.`,
    `Their name is ${profile.name}; call them ${profile.name.split(' ')[0]}.`,
    profile.role !== 'patient' ? `They are a ${profile.role}, not the person being monitored.`
      : profile.diagnosed ? `They have a Parkinson's diagnosis${profile.diagnosisYear ? ` (${profile.diagnosisYear})` : ''}.` : 'They have no diagnosis and are tracking early signs.',
    day && Object.keys(day.modalities).length
      ? `Checks done today: ${Object.keys(day.modalities).map(checkName).join(', ')}.${day.composite != null ? ` Overall today: ${STATUS_COPY[day.status].label.toLowerCase()}.` : ''}`
      : 'No checks done yet today.',
    due.length ? `Medication not yet logged today: ${due.join(', ')}.` : '',
    day?.checkin ? `Already recorded for today: ${JSON.stringify(day.checkin)}.` : '',
    about.length ? `Your notes about them:\n${about.map((m) => `[${m.id}] ${m.text}`).join('\n')}` : 'You have no saved notes about them yet.',
    doctor.length ? `Questions already saved for their doctor:\n${doctor.map((m) => `[${m.id}] ${m.text}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

async function runTool(profile: Profile, use: ToolUseBlock, turn: Turn, memories: Memory[]): Promise<string> {
  const input = (use.input ?? {}) as Record<string, unknown>;
  switch (use.name) {
    case 'forget': {
      if (!turn.mayForget) return 'Not done. Only forget a note when the person has just asked you to.';
      const id = String(input.id ?? '').replace(/[[\]]/g, '');
      const known = memories.some((m) => m.id === id) || turn.remembered.some((m) => m.id === id);
      return known && (await deleteMemory(profile.userId, id)) ? 'Forgotten.' : 'No note with that id.';
    }
    case 'get_trend': return JSON.stringify(await trendLookup(profile));
    case 'get_medication': return JSON.stringify(await medicationLookup(profile));
    case 'get_sleep': return JSON.stringify(await sleepLookup(profile));
    default: return 'Unknown tool.';
  }
}

/** Some models narrate their reasoning in tags; none of that is for the person. */
export const spoken = (text: string): string =>
  text.replace(/<thinking>[\s\S]*?(<\/thinking>|$)/gi, ' ').replace(/<\/?[a-z_]+>/gi, ' ').replace(/\s+/g, ' ').trim();

/** Converse requires turns to alternate, so consecutive messages from one side are joined. */
function toTurns(history: ChatMessage[]): Message[] {
  const turns: { role: 'user' | 'assistant'; text: string }[] = [];
  for (const m of history) {
    const last = turns[turns.length - 1];
    if (last?.role === m.role) last.text += `\n${m.text}`;
    else if (turns.length || m.role === 'user') turns.push({ role: m.role, text: m.text });
  }
  return turns.map((t) => ({ role: t.role, content: [{ text: t.text }] }));
}

/** What the note-taker drew from the person's latest message. */
async function takeNotes(history: ChatMessage[], memories: Memory[]): Promise<{ checkin: Extracted; memories: string[]; doctorQuestion?: string }> {
  const latest = history[history.length - 1];
  const empty = { checkin: {}, memories: [] };
  if (!latest || latest.role !== 'user' || latest.hidden) return empty;
  const recent = history.filter((m) => !m.hidden).slice(-7, -1).map((m) => `${m.role === 'user' ? 'Person' : 'Companion'}: ${m.text}`).join('\n') || '(start of conversation)';
  const known = memories.filter((m) => m.kind === 'about').slice(-50).map((m) => `- ${m.text}`).join('\n') || '(none)';
  const response = await bedrock().send(new ConverseCommand({
    modelId: env.bedrockModel,
    system: [{ text: NOTE_TAKER }],
    messages: [{ role: 'user', content: [{ text: `Existing notes:\n${known}\n\nEarlier in the conversation:\n${recent}\n\nPerson's LATEST message: ${latest.text}` }] }],
    toolConfig: { tools: [SAVE_TOOL] },
    inferenceConfig: { maxTokens: 400, temperature: 0 },
  }));
  const input = (response.output?.message?.content ?? []).map((b) => b.toolUse).find((u) => u?.name === 'save')?.input as Record<string, unknown> | undefined;
  if (!input) return empty;
  const have = new Set(memories.map((m) => m.text.toLowerCase()));
  return {
    checkin: {
      sleepQuality: scale(input.sleepQuality), mood: scale(input.mood), motorDifficulty: scale(input.motorDifficulty),
      notes: typeof input.dayNote === 'string' && input.dayNote.trim() ? input.dayNote.trim().slice(0, 300) : undefined,
    },
    memories: (Array.isArray(input.memories) ? input.memories : [])
      .filter((m): m is string => typeof m === 'string' && m.trim().length > 3 && !have.has(m.trim().toLowerCase()))
      .slice(0, 2),
    doctorQuestion: typeof input.doctorQuestion === 'string' && input.doctorQuestion.trim().length > 5 ? input.doctorQuestion.trim() : undefined,
  };
}

async function askBedrock(profile: Profile, history: ChatMessage[], memories: Memory[]): Promise<Turn> {
  const messages = toTurns(history);
  const system = [{ text: SYSTEM }, { text: await context(profile, memories) }];

  const latest = history[history.length - 1];
  const turn: Turn = { text: '', checkin: null, remembered: [], mayForget: !!latest && latest.role === 'user' && !latest.hidden && ASKS_TO_FORGET.test(latest.text) };
  for (let step = 0; step < 5; step++) {
    const response = await bedrock().send(new ConverseCommand({
      modelId: env.bedrockModel, system, messages, toolConfig: { tools: TOOLS }, inferenceConfig: { maxTokens: 800, temperature: 0.6 },
    }));
    if (response.stopReason === 'guardrail_intervened' || response.stopReason === 'content_filtered') {
      turn.text = "I'm not able to help with that one. If it is about your health, your doctor is the right person to ask.";
      return turn;
    }
    const content: ContentBlock[] = response.output?.message?.content ?? [];
    const said = spoken(content.map((b) => b.text ?? '').join(' '));
    const uses = content.map((b) => b.toolUse).filter((u): u is ToolUseBlock => !!u);
    // Words spoken before a tool call and after it are one reply.
    if (said) turn.text = turn.text ? `${turn.text} ${said}` : said;
    if (response.stopReason !== 'tool_use' || !uses.length) return turn;

    messages.push({ role: 'assistant', content });
    const results: ToolResultBlock[] = [];
    for (const use of uses) {
      try {
        results.push({ toolUseId: use.toolUseId, content: [{ text: await runTool(profile, use, turn, memories) }] });
      } catch (err) {
        console.error(`[companion] tool ${use.name} failed`, err);
        results.push({ toolUseId: use.toolUseId, content: [{ text: 'That lookup failed.' }], status: 'error' });
      }
    }
    messages.push({ role: 'user', content: results.map((toolResult) => ({ toolResult })) });
  }
  return turn;
}

/**
 * Used only when Bedrock cannot be reached. It says so plainly and still notes
 * anything clearly stated about the day, rather than pretending to converse.
 */
export function offlineReply(text: string, name: string): Turn {
  const t = text.toLowerCase();
  const has = (...words: string[]): boolean => words.some((w) => t.includes(w));
  const first = name.split(' ')[0];
  if (has('chest pain', "can't breathe", 'fell and', 'suicid', 'harm myself')) {
    return { text: 'That sounds serious. Please contact a doctor or emergency services now, and let someone you trust know.', checkin: null, remembered: [] };
  }
  if (has('dose', 'medicine', 'medication', 'tablet')) {
    return { text: "I'm offline at the moment, and questions about medicines are for your doctor in any case. Please ask them directly.", checkin: null, remembered: [] };
  }
  const checkin: Extracted = {};
  if (has('slept well', 'good sleep', 'slept fine', 'rested')) checkin.sleepQuality = 4;
  else if (has('slept badly', "didn't sleep", 'bad night', 'woke up', 'tired', 'exhausted', 'nightmare')) checkin.sleepQuality = 2;
  if (has('happy', 'good mood', 'feeling good', 'great')) checkin.mood = 4;
  else if (has('sad', 'low', 'anxious', 'worried', 'down', 'frustrated')) checkin.mood = 2;
  if (has('stiff', 'tremor', 'shaky', 'slow', 'freez', 'hard to move')) checkin.motorDifficulty = 4;
  else if (has('moving well', 'steady', 'no tremor')) checkin.motorDifficulty = 1;
  const noted = Object.keys(checkin).length > 0;
  return {
    text: noted
      ? `I can't reach my conversation service right now, ${first}, but I've noted that for today. Please try me again in a little while.`
      : `I'm sorry, ${first}, I can't reach my conversation service right now, so I can't talk properly. Please try again in a little while.`,
    checkin: noted ? checkin : null, remembered: [],
  };
}

async function allMessages(userId: string, limit: number): Promise<ChatMessage[]> {
  return (await list<ChatMessage>(userId, { prefix: 'CHAT#', desc: true, limit })).reverse();
}

/** The conversation as the person sees it. */
export const chatHistory = async (userId: string, limit = 80): Promise<ChatMessage[]> =>
  (await allMessages(userId, limit)).filter((m) => !m.hidden);

export interface CompanionReply { reply: ChatMessage; checkin: Checkin | null; remembered: Memory[] }

async function respond(profile: Profile, lastUserText: string): Promise<CompanionReply> {
  const userId = profile.userId;
  let engine: ChatMessage['engine'] = 'local';
  let turn: Turn | undefined;
  if (aiUsable('bedrock')) {
    const [history, memories] = await Promise.all([allMessages(userId, HISTORY_TURNS), listMemories(userId)]);
    // The reply and the note-taking run side by side, so the person waits for only one of them.
    const [said, notes] = await Promise.allSettled([askBedrock(profile, history, memories), takeNotes(history, memories)]);
    if (said.status === 'fulfilled') {
      turn = said.value;
      engine = 'bedrock';
      if (notes.status === 'fulfilled') {
        const stated = Object.fromEntries(Object.entries(notes.value.checkin).filter(([, v]) => v !== undefined));
        if (Object.keys(stated).length) turn.checkin = { ...turn.checkin, ...stated };
        for (const note of notes.value.memories) turn.remembered.push(await addMemory(userId, note, 'about'));
        const question = notes.value.doctorQuestion;
        if (question && !memories.some((m) => m.kind === 'doctor' && m.text.toLowerCase() === question.toLowerCase())) {
          turn.remembered.push(await addMemory(userId, question, 'doctor'));
        }
      } else {
        console.error('[companion] note-taker failed', notes.reason);
      }
    } else {
      aiFailed('bedrock', said.reason);
    }
  }
  turn ??= offlineReply(lastUserText, profile.name);

  const reply: ChatMessage = { id: newId(), at: nowIso(), role: 'assistant', text: turn.text || "I'm here. Tell me a little more.", engine };
  await putOne(userId, SK.chat(reply.at, reply.id), reply);

  let checkin: Checkin | null = null;
  if (turn.checkin && Object.values(turn.checkin).some((v) => v !== undefined)) {
    const date = localDate(nowIso(), profile.timezone);
    const defined = Object.fromEntries(Object.entries(turn.checkin).filter(([, v]) => v !== undefined));
    checkin = { ...(await getOne<Checkin>(userId, SK.checkin(date))), ...defined, date };
    await putOne(userId, SK.checkin(date), checkin);
    await consolidateDay(profile, date);
  }
  return { reply, checkin, remembered: turn.remembered };
}

export async function sendMessage(profile: Profile, text: string, via: ChatMessage['via'] = 'text'): Promise<CompanionReply> {
  const message: ChatMessage = { id: newId(), at: nowIso(), role: 'user', text, via };
  await putOne(profile.userId, SK.chat(message.at, message.id), message);
  return respond(profile, text);
}

/**
 * Called when the person opens the check-in. After a gap the companion speaks first,
 * with a greeting written for this moment rather than a canned line.
 */
export async function openConversation(profile: Profile): Promise<CompanionReply | null> {
  const [last] = await list<ChatMessage>(profile.userId, { prefix: 'CHAT#', desc: true, limit: 1 });
  if (last && Date.now() - Date.parse(last.at) < GREET_AFTER_MS) return null;
  // Without the model there is nothing genuine to open with.
  if (!aiUsable('bedrock')) return null;
  const marker: ChatMessage = { id: newId(), at: nowIso(), role: 'user', text: OPENED, hidden: true };
  await putOne(profile.userId, SK.chat(marker.at, marker.id), marker);
  return respond(profile, '');
}
