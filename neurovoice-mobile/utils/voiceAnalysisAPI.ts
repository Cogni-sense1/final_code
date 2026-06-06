// Voice Analysis API Client — React Native fetch-based
// Requirements: 5.6, 7.1–7.7

import * as Network from 'expo-network';

// ─── Environment ─────────────────────────────────────────────────────────────

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:5050';

if (!process.env.EXPO_PUBLIC_BACKEND_URL) {
  console.warn('[NeuroVoice] EXPO_PUBLIC_BACKEND_URL not set, defaulting to localhost:5050');
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface VoiceAnalysisMetadata {
  ac: 0 | 1;     // age 60+
  nth: 0 | 1;    // neurological history
  htn: 0 | 1;    // hypertension
  updrs: number; // 0–108
}

export interface VoiceAnalysisResult {
  risk_score: number;
  risk_level: 'Low' | 'Medium' | 'High';
}

// ─── Network helpers ─────────────────────────────────────────────────────────

/**
 * Returns true if the device has an active internet connection.
 * Requirements: 7.4
 */
export const isOnline = async (): Promise<boolean> => {
  const state = await Network.getNetworkStateAsync();
  return state.isConnected === true && state.isInternetReachable !== false;
};

// ─── analyzeVoice ─────────────────────────────────────────────────────────────

/**
 * Sends an audio file and metadata to the backend /predict endpoint.
 * Uses React Native's { uri, name, type } FormData syntax (not Blob).
 * Wraps fetch with a 30-second AbortController timeout.
 * Requirements: 5.6, 7.1–7.7
 */
export const analyzeVoice = async (
  audioUri: string,
  metadata: VoiceAnalysisMetadata,
): Promise<VoiceAnalysisResult> => {
  // Check network reachability before attempting the request
  const online = await isOnline();
  if (!online) {
    throw new Error('No internet connection. Please check your network and try again.');
  }

  const formData = new FormData();
  // React Native FormData file syntax — do NOT use Blob
  formData.append('audio', { uri: audioUri, name: 'recording.m4a', type: 'audio/m4a' } as any);
  formData.append('ac', metadata.ac.toString());
  formData.append('nth', metadata.nth.toString());
  formData.append('htn', metadata.htn.toString());
  formData.append('updrs', metadata.updrs.toString());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    // Do NOT set Content-Type — let fetch set the multipart boundary automatically
    const response = await fetch(`${BACKEND_URL}/predict`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMessage = `Server error: ${response.status} ${response.statusText}`;
      try {
        const body = await response.json();
        errorMessage = body.error ?? body.details ?? errorMessage;
      } catch {
        // response body is not JSON — keep the status-based message
      }
      throw new Error(errorMessage);
    }

    const result: VoiceAnalysisResult = await response.json();
    return result;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out. The backend took too long to respond.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
};

// ─── checkBackendHealth ───────────────────────────────────────────────────────

/**
 * Hits BACKEND_URL + '/' with a 5-second timeout.
 * Returns true on HTTP 200, false otherwise.
 * Requirements: 7.3
 */
export const checkBackendHealth = async (): Promise<boolean> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(`${BACKEND_URL}/`, {
      method: 'GET',
      signal: controller.signal,
    });
    return response.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};
