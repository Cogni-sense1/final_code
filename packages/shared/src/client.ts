import type { MedicationInsights, ScheduledDose } from './health';
import type {
  Alert, Assessment, AssessmentInput, AssessmentType, Baseline, CareLink, ChatMessage, Checkin, DailyProfile, DeviationStatus,
  Dose, Dystonia, GroupMessage, Medication, MedicationInput, Memory, Profile, ProfileUpdate, Report, Role, SleepEntry, SleepInput, Symptom,
} from './schemas';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Config {
  authMode: 'local' | 'cognito';
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  companionEngine: 'bedrock' | 'local';
  consentVersion: string;
  sentences: string[];
}

export interface Overview {
  profile: Profile;
  today: string;
  days: DailyProfile[];
  latest: Record<string, Assessment>;
  streak: number;
  todayProfile: DailyProfile | null;
  baselines: Baseline[];
  schedule: ScheduledDose[];
  unreadAlerts: number;
}

export interface PatientRow {
  patientId: string;
  name: string;
  diagnosed: boolean;
  hoehnYahr: number;
  since: string;
  status: DeviationStatus;
  composite: number | null;
  lastActive: string | null;
  spark: (number | null)[];
  adherencePct: number | null;
}

export interface MedicationDay { date: string; schedule: ScheduledDose[]; doses: Dose[]; symptoms: Symptom[] }
export type Insights = MedicationInsights & { days: number; peakLabel: string | null };
export interface GroupRow { id: string; name: string; description: string; joined: boolean; suggested: boolean }
export interface CompanionReply { reply: ChatMessage; checkin: Checkin | null; remembered: Memory[] }
/** `reply` is null when nothing was heard. `audio` is base64 MP3, or null when the device should speak. */
export interface VoiceTurn { transcript: string; reply: ChatMessage | null; checkin: Checkin | null; remembered: Memory[]; audio: string | null }
export interface VoiceAnalysis { assessment: Assessment; topFactors: { feature: string; contribution: number }[] }

/** Everything readable about one person: yourself, or a patient who linked you. */
function views(req: <T>(method: string, path: string, body?: unknown) => Promise<T>, base: string) {
  return {
    overview: () => req<Overview>('GET', `${base}/overview`),
    assessments: (type?: AssessmentType, limit = 60) => req<Assessment[]>('GET', `${base}/assessments?limit=${limit}${type ? `&type=${type}` : ''}`),
    medications: () => req<Medication[]>('GET', `${base}/medications`),
    medicationDay: (date?: string) => req<MedicationDay>('GET', `${base}/medications/day${date ? `?date=${date}` : ''}`),
    insights: (days = 14) => req<Insights>('GET', `${base}/medications/insights?days=${days}`),
    sleep: (days = 30) => req<SleepEntry[]>('GET', `${base}/sleep?days=${days}`),
    dystonia: (days = 30) => req<Dystonia[]>('GET', `${base}/dystonia?days=${days}`),
    reports: () => req<Report[]>('GET', `${base}/reports`),
    doctorNotes: () => req<Memory[]>('GET', `${base}/doctor-notes`),
    buildReport: (month?: string) => req<Report>('POST', `${base}/reports${month ? `?month=${month}` : ''}`),
  };
}

export function createClient(baseUrl: string, getToken: () => string | null | Promise<string | null>) {
  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await getToken();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, err.error ?? `Request failed (${res.status})`);
    }
    return (await res.json()) as T;
  }

  return {
    config: () => req<Config>('GET', '/config'),
    signup: (input: { email: string; password: string; name: string; role: Role }) => req<{ token: string; profile: Profile }>('POST', '/auth/signup', input),
    login: (email: string, password: string) => req<{ token: string; profile: Profile }>('POST', '/auth/login', { email, password }),

    me: () => req<Profile>('GET', '/me'),
    updateMe: (patch: ProfileUpdate) => req<Profile>('PUT', '/me', patch),
    consent: (input: { storeAudio: boolean; shareWithCareTeam: boolean }) => req<Profile>('POST', '/me/consent', input),
    exportData: () => req<{ exportedAt: string; items: unknown[] }>('GET', '/me/export'),
    deleteAccount: () => req<{ deleted: number }>('DELETE', '/me'),

    ...views(req, ''),
    patient: (patientId: string) => views(req, `/patients/${patientId}`),
    patients: () => req<PatientRow[]>('GET', '/patients'),

    submitAssessment: (input: AssessmentInput) => req<Assessment>('POST', '/assessments', input),
    /**
     * Upload a recording and score it. The web app sends WAV; phones send AAC (`audio/mp4`),
     * which the voice service converts before measuring.
     */
    async analyzeVoice(audio: Blob, task: 'vowel' | 'reading', sentence?: number, channel: 'web' | 'mobile' = 'web', contentType = 'audio/wav'): Promise<VoiceAnalysis> {
      const up = await req<{ key: string; url: string; direct: boolean }>('POST', '/voice/uploads', { contentType });
      const token = await getToken();
      const put = await fetch(up.url, {
        method: 'PUT', body: audio,
        // A presigned S3 URL carries its own auth; the local endpoint needs ours.
        headers: { 'content-type': contentType, ...(!up.direct && token ? { authorization: `Bearer ${token}` } : {}) },
      });
      if (!put.ok) throw new ApiError(put.status, 'Upload failed. Check your connection and try again.');
      return req<VoiceAnalysis>('POST', '/voice/analyze', { key: up.key, task, sentence, channel });
    },

    saveMedication: (input: MedicationInput, id?: string) => req<Medication>(id ? 'PUT' : 'POST', `/medications${id ? `/${id}` : ''}`, input),
    stopMedication: (id: string) => req<{ ok: true }>('DELETE', `/medications/${id}`),
    logDose: (medicationId: string, scheduledTime?: string) => req<Dose>('POST', '/doses', { medicationId, scheduledTime }),
    logSymptom: (input: Pick<Symptom, 'state' | 'tremor' | 'stiffness' | 'slowness'>) => req<Symptom>('POST', '/symptoms', input),

    saveSleep: (input: SleepInput) => req<SleepEntry>('POST', '/sleep', input),
    importSleep: (nights: SleepInput[]) => req<{ imported: number }>('POST', '/sleep/import', { nights }),
    logDystonia: (input: Pick<Dystonia, 'region' | 'severity' | 'minutes'>) => req<Dystonia>('POST', '/dystonia', input),

    chatHistory: () => req<ChatMessage[]>('GET', '/companion/messages'),
    chat: (text: string) => req<CompanionReply>('POST', '/companion/messages', { text }),
    /** Lets the companion speak first after a gap. Null when the conversation is already under way. */
    openCompanion: () => req<{ opened: CompanionReply | null }>('POST', '/companion/open'),
    clearChat: () => req<{ cleared: number }>('DELETE', '/companion/messages'),
    memories: () => req<Memory[]>('GET', '/companion/memories'),
    forgetMemory: (id: string) => req<{ ok: true }>('DELETE', `/companion/memories/${id}`),
    /** One spoken turn. Returns null when the server has no speech service, so the caller can fall back. */
    async voiceTurn(wav: Blob): Promise<VoiceTurn | null> {
      const token = await getToken();
      const res = await fetch(`${baseUrl}/companion/voice`, {
        method: 'POST', body: wav, headers: { 'content-type': 'audio/wav', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      });
      if (res.status === 501) return null;
      if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Voice turn failed.');
      return (await res.json()) as VoiceTurn;
    },
    /** MP3 from Amazon Polly, or null when the server has no speech engine. */
    async speak(text: string): Promise<Blob | null> {
      const token = await getToken();
      const res = await fetch(`${baseUrl}/companion/speech`, {
        method: 'POST', body: JSON.stringify({ text }),
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      });
      return res.ok ? res.blob() : null;
    },

    careTeam: () => req<CareLink[]>('GET', '/care/team'),
    createInvite: () => req<{ code: string; expiresAt: string }>('POST', '/care/invites'),
    acceptInvite: (code: string) => req<CareLink>('POST', '/care/accept', { code }),
    revokeMember: (memberId: string) => req<{ ok: true }>('DELETE', `/care/team/${memberId}`),

    alerts: () => req<Alert[]>('GET', '/alerts'),
    markAlertsRead: () => req<{ ok: true }>('POST', '/alerts/read'),

    groups: () => req<{ handle: string; groups: GroupRow[] }>('GET', '/community/groups'),
    joinGroup: (id: string) => req<{ ok: true }>('POST', `/community/groups/${id}/join`),
    leaveGroup: (id: string) => req<{ ok: true }>('POST', `/community/groups/${id}/leave`),
    groupMessages: (id: string, after?: string) => req<GroupMessage[]>('GET', `/community/groups/${id}/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`),
    postGroupMessage: (id: string, text: string) => req<GroupMessage>('POST', `/community/groups/${id}/messages`, { text }),
  };
}

export type Client = ReturnType<typeof createClient>;
