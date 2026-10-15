import { z } from 'zod';

export const CONSENT_VERSION = '2026-10';

export const Role = z.enum(['patient', 'caregiver', 'clinician']);
export type Role = z.infer<typeof Role>;

export const Channel = z.enum(['web', 'mobile', 'whatsapp']);
export type Channel = z.infer<typeof Channel>;

export const ASSESSMENT_TYPES = ['voice', 'face', 'tap', 'spiral', 'wave', 'clock', 'gait', 'lsvt'] as const;
export const AssessmentType = z.enum(ASSESSMENT_TYPES);
export type AssessmentType = z.infer<typeof AssessmentType>;

/** Hoehn & Yahr stage; 0 means no diagnosis. */
export const HoehnYahr = z.union([
  z.literal(0), z.literal(1), z.literal(1.5), z.literal(2), z.literal(2.5), z.literal(3), z.literal(4), z.literal(5),
]);

export const Consent = z.object({
  version: z.string(),
  acceptedAt: z.string(),
  storeAudio: z.boolean(),
  shareWithCareTeam: z.boolean(),
});
export type Consent = z.infer<typeof Consent>;

export const Profile = z.object({
  userId: z.string(),
  role: Role,
  name: z.string().min(1).max(80),
  handle: z.string().min(3).max(24).optional(),
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),
  birthYear: z.number().int().min(1900).max(2026).optional(),
  diagnosed: z.boolean().default(false),
  diagnosisYear: z.number().int().min(1950).max(2026).optional(),
  hoehnYahr: HoehnYahr.default(0),
  dominantHand: z.enum(['left', 'right']).optional(),
  locale: z.string().default('en-IN'),
  timezone: z.string().default('Asia/Kolkata'),
  consent: Consent.optional(),
  synthetic: z.boolean().optional(),
  createdAt: z.string(),
});
export type Profile = z.infer<typeof Profile>;

export const ProfileUpdate = Profile.pick({
  name: true, handle: true, phone: true, birthYear: true, diagnosed: true, diagnosisYear: true,
  hoehnYahr: true, dominantHand: true, locale: true, timezone: true,
}).partial();
export type ProfileUpdate = z.infer<typeof ProfileUpdate>;

export const ConsentInput = z.object({ storeAudio: z.boolean(), shareWithCareTeam: z.boolean() });

// ── Assessments ──────────────────────────────────────────────────────────────

export const Features = z.record(z.string(), z.number().finite());
export type Features = z.infer<typeof Features>;

export const Quality = z.object({
  usable: z.boolean(),
  problems: z.array(z.string()).default([]),
  score: z.number().min(0).max(100).optional(),
});
export type Quality = z.infer<typeof Quality>;

export const Stroke = z.array(z.tuple([z.number(), z.number(), z.number()])).max(4000);

/** Submitted by clients for everything scored on-device (all types except voice). */
export const AssessmentInput = z.object({
  type: AssessmentType.exclude(['voice']),
  task: z.string().max(40).optional(),
  features: Features,
  quality: Quality,
  durationS: z.number().min(0).max(600),
  channel: Channel.default('web'),
  /** Drawing strokes, kept so a clinician can review the picture. */
  strokes: z.array(Stroke).max(60).optional(),
  takenAt: z.string().datetime().optional(),
});
export type AssessmentInput = z.infer<typeof AssessmentInput>;

export const Level = z.enum(['low', 'moderate', 'elevated']);
export type Level = z.infer<typeof Level>;

export const DeviationStatus = z.enum(['building', 'steady', 'watch', 'changed']);
export type DeviationStatus = z.infer<typeof DeviationStatus>;

export const Deviation = z.object({
  status: DeviationStatus,
  /** Signed, in robust standard deviations; positive means worse than baseline. */
  index: z.number().nullable(),
  sessionsInBaseline: z.number().int(),
  sessionsNeeded: z.number().int(),
  drivers: z.array(z.object({ key: z.string(), label: z.string(), z: z.number() })),
});
export type Deviation = z.infer<typeof Deviation>;

export const Assessment = z.object({
  id: z.string(),
  userId: z.string(),
  type: AssessmentType,
  task: z.string().optional(),
  takenAt: z.string(),
  channel: Channel,
  features: Features,
  quality: Quality,
  durationS: z.number(),
  /** Reference score from published thresholds, 0-100. Not personalised. */
  reference: z.object({ score: z.number(), level: Level, findings: z.array(z.string()) }),
  deviation: Deviation,
  /** Population voice model, averaged over the person's recent recordings. */
  model: z.object({
    version: z.string(), score: z.number(), recordings: z.number().int(),
    factors: z.array(z.object({ feature: z.string(), contribution: z.number() })),
  }).optional(),
  transcript: z.string().optional(),
  audioKey: z.string().optional(),
  strokes: z.array(Stroke).optional(),
});
export type Assessment = z.infer<typeof Assessment>;

export const Baseline = z.object({
  key: z.string(),
  sessions: z.number().int(),
  frozen: z.boolean(),
  stats: z.record(z.string(), z.object({ median: z.number(), mad: z.number() })),
  updatedAt: z.string(),
});
export type Baseline = z.infer<typeof Baseline>;

export const DailyProfile = z.object({
  date: z.string(),
  modalities: z.record(z.string(), z.object({ index: z.number().nullable(), sessions: z.number().int() })),
  composite: z.number().nullable(),
  status: DeviationStatus,
  checkin: z
    .object({ sleepQuality: z.number().optional(), mood: z.number().optional(), motorDifficulty: z.number().optional() })
    .optional(),
  offReports: z.number().int().default(0),
  dosesTaken: z.number().int().default(0),
  dosesScheduled: z.number().int().default(0),
  sleepScore: z.number().optional(),
});
export type DailyProfile = z.infer<typeof DailyProfile>;

// ── Medication ───────────────────────────────────────────────────────────────

export const MedicationInput = z.object({
  name: z.string().min(1).max(60),
  dose: z.number().positive().max(5000),
  unit: z.enum(['mg', 'mcg', 'ml', 'tablet']).default('mg'),
  /** Local times, HH:MM. */
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(12),
  levodopa: z.boolean().default(false),
  notes: z.string().max(200).optional(),
});
export type MedicationInput = z.infer<typeof MedicationInput>;
export const Medication = MedicationInput.extend({ id: z.string(), active: z.boolean(), createdAt: z.string() });
export type Medication = z.infer<typeof Medication>;

export const MotorState = z.enum(['on', 'off', 'dyskinesia']);
export type MotorState = z.infer<typeof MotorState>;

export const DoseInput = z.object({
  medicationId: z.string(),
  takenAt: z.string().datetime().optional(),
  scheduledTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
});
export const Dose = z.object({
  id: z.string(), medicationId: z.string(), medicationName: z.string(), levodopa: z.boolean(),
  takenAt: z.string(), scheduledTime: z.string().optional(),
});
export type Dose = z.infer<typeof Dose>;

export const SymptomInput = z.object({
  at: z.string().datetime().optional(),
  state: MotorState,
  tremor: z.number().int().min(0).max(4),
  stiffness: z.number().int().min(0).max(4),
  slowness: z.number().int().min(0).max(4),
});
export const Symptom = SymptomInput.extend({ id: z.string(), at: z.string() });
export type Symptom = z.infer<typeof Symptom>;

// ── Sleep & physiology ───────────────────────────────────────────────────────

export const SleepInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bedtime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  wakeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  awakenings: z.number().int().min(0).max(30),
  /** Dream enactment reported by the user or a bed partner (RBD indicator). */
  actedOutDreams: z.boolean().default(false),
  vocalised: z.boolean().default(false),
  restingHr: z.number().min(30).max(140).optional(),
  remPct: z.number().min(0).max(60).optional(),
  deepPct: z.number().min(0).max(60).optional(),
  source: z.enum(['manual', 'import']).default('manual'),
});
export type SleepInput = z.infer<typeof SleepInput>;
export const SleepEntry = SleepInput.extend({ hours: z.number(), score: z.number(), rbdFlag: z.boolean() });
export type SleepEntry = z.infer<typeof SleepEntry>;

export const DystoniaInput = z.object({
  at: z.string().datetime().optional(),
  region: z.enum(['hand', 'foot', 'leg', 'arm', 'neck', 'trunk', 'face']),
  severity: z.number().int().min(1).max(5),
  minutes: z.number().min(1).max(600),
});
export const Dystonia = DystoniaInput.extend({ id: z.string(), at: z.string() });
export type Dystonia = z.infer<typeof Dystonia>;

// ── Companion ────────────────────────────────────────────────────────────────

export const ChatInput = z.object({ text: z.string().min(1).max(1200) });
export const ChatMessage = z.object({
  id: z.string(), at: z.string(), role: z.enum(['user', 'assistant']), text: z.string(),
  engine: z.enum(['bedrock', 'local']).optional(),
  via: z.enum(['text', 'voice']).optional(),
  /** Internal turn markers that shape the conversation but are never shown. */
  hidden: z.boolean().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

/** Something the companion keeps beyond today. The person can see and delete every one. */
export const Memory = z.object({
  id: z.string(), at: z.string(), text: z.string(),
  kind: z.enum(['about', 'doctor']),
});
export type Memory = z.infer<typeof Memory>;

export const Checkin = z.object({
  date: z.string(),
  sleepQuality: z.number().min(1).max(5).optional(),
  mood: z.number().min(1).max(5).optional(),
  motorDifficulty: z.number().min(1).max(5).optional(),
  notes: z.string().max(300).optional(),
});
export type Checkin = z.infer<typeof Checkin>;

// ── Care team, alerts, reports ───────────────────────────────────────────────

export const CareLink = z.object({
  patientId: z.string(), patientName: z.string(),
  memberId: z.string(), memberName: z.string(), memberRole: Role,
  status: z.enum(['active', 'revoked']),
  since: z.string(),
  notify: z.boolean().default(true),
});
export type CareLink = z.infer<typeof CareLink>;

export const AlertKind = z.enum(['sustained_change', 'missed_dose', 'frequent_off', 'rbd_pattern', 'report_ready']);
export const Alert = z.object({
  id: z.string(), at: z.string(), patientId: z.string(), patientName: z.string(),
  kind: AlertKind, severity: z.enum(['info', 'attention']), title: z.string(), detail: z.string(),
  read: z.boolean().default(false),
});
export type Alert = z.infer<typeof Alert>;

export const Report = z.object({
  month: z.string(), generatedAt: z.string(), engine: z.enum(['bedrock', 'local']),
  summary: z.string(),
  stats: z.object({
    assessments: z.number(), activeDays: z.number(), adherencePct: z.number().nullable(),
    offReports: z.number(), avgSleepScore: z.number().nullable(),
    modalities: z.record(z.string(), z.object({ sessions: z.number(), meanIndex: z.number().nullable() })),
  }),
});
export type Report = z.infer<typeof Report>;

// ── Community ────────────────────────────────────────────────────────────────

export const GROUPS = [
  { id: 'early', name: 'Early stage', description: 'Hoehn & Yahr 1 to 1.5', stages: [1, 1.5] },
  { id: 'mid', name: 'Finding a rhythm', description: 'Hoehn & Yahr 2 to 2.5', stages: [2, 2.5] },
  { id: 'balance', name: 'Staying steady', description: 'Hoehn & Yahr 3', stages: [3] },
  { id: 'advanced', name: 'Advanced care', description: 'Hoehn & Yahr 4 to 5', stages: [4, 5] },
  { id: 'watchful', name: 'Watchful and well', description: 'No diagnosis, tracking early signs', stages: [0] },
  { id: 'carers', name: 'Carers corner', description: 'For family and caregivers', stages: [] },
] as const;
export type GroupId = (typeof GROUPS)[number]['id'];

export const GroupMessageInput = z.object({ text: z.string().min(1).max(600) });
export const GroupMessage = z.object({
  id: z.string(), at: z.string(), groupId: z.string(), authorId: z.string(), handle: z.string(), text: z.string(),
});
export type GroupMessage = z.infer<typeof GroupMessage>;

// ── Auth (local development only) ────────────────────────────────────────────

export const SignupInput = z.object({
  email: z.string().email(), password: z.string().min(8).max(100), name: z.string().min(1).max(80), role: Role,
});
export const LoginInput = z.object({ email: z.string().email(), password: z.string() });
