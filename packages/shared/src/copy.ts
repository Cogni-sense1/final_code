export const DISCLAIMER =
  'NeuroVoice is a screening and monitoring aid. It does not diagnose any condition. Talk to a doctor about any concern.';

export const STATUS_COPY = {
  building: { label: 'Building your baseline', tone: 'neutral' },
  steady: { label: 'Within your usual range', tone: 'good' },
  watch: { label: 'A little off your usual', tone: 'warn' },
  changed: { label: 'Different from your usual', tone: 'alert' },
} as const;

export const PROBLEM_COPY: Record<string, string> = {
  too_short: 'The recording was too short.',
  not_enough_voice: 'We could not hear enough voice. Try again somewhere quieter.',
  too_quiet: 'The recording was very quiet. Hold the phone a little closer.',
  clipping: 'The recording was too loud and distorted. Hold the phone a little further away.',
  face_out_of_view: 'Your face left the frame for part of the test.',
  hand_out_of_view: 'Your hand left the frame for part of the test.',
  body_out_of_view: 'We could not see your whole body. Step back so head to feet are in view.',
  too_few_taps: 'We counted very few taps. Make sure your hand is well lit and facing the camera.',
  too_few_steps: 'We counted very few steps. Lift your knees a little higher.',
  too_few_points: 'There was not enough drawing to analyse.',
  incomplete_trace: 'The trace stopped before the end of the guide.',
  incomplete_drawing: 'The drawing looks unfinished.',
};
