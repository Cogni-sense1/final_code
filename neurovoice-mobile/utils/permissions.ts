// Centralised permission handling for NeuroVoice Mobile
// Requirements: 11.18–11.21

import { Audio } from 'expo-av';
import { Camera } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { Linking } from 'expo-linking';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PermissionType = 'microphone' | 'camera' | 'mediaLibrary';
export type PermissionStatus = 'undetermined' | 'granted' | 'denied' | 'blocked';

export interface PermissionResult {
  status: PermissionStatus;
  canAskAgain: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Maps an Expo permission status string to our PermissionStatus type.
 * 'granted' → 'granted'
 * 'denied'  → 'denied'
 * 'undetermined' → 'undetermined'
 * anything else  → 'blocked'
 */
const mapStatus = (expoStatus: string): PermissionStatus => {
  switch (expoStatus) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'undetermined':
      return 'undetermined';
    default:
      return 'blocked';
  }
};

// ─── requestPermission ───────────────────────────────────────────────────────

/**
 * Requests the specified permission using the appropriate Expo API.
 * Returns a PermissionResult with the mapped status and canAskAgain flag.
 */
export const requestPermission = async (type: PermissionType): Promise<PermissionResult> => {
  switch (type) {
    case 'microphone': {
      const { status, canAskAgain } = await Audio.requestPermissionsAsync();
      return { status: mapStatus(status), canAskAgain };
    }
    case 'camera': {
      const { status, canAskAgain } = await Camera.requestCameraPermissionsAsync();
      return { status: mapStatus(status), canAskAgain };
    }
    case 'mediaLibrary': {
      const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync();
      return { status: mapStatus(status), canAskAgain };
    }
  }
};

// ─── checkPermission ─────────────────────────────────────────────────────────

/**
 * Checks the current permission status without requesting it.
 * Uses the getPermissionsAsync variants (no system dialog shown).
 */
export const checkPermission = async (type: PermissionType): Promise<PermissionResult> => {
  switch (type) {
    case 'microphone': {
      const { status, canAskAgain } = await Audio.getPermissionsAsync();
      return { status: mapStatus(status), canAskAgain };
    }
    case 'camera': {
      const { status, canAskAgain } = await Camera.getCameraPermissionsAsync();
      return { status: mapStatus(status), canAskAgain };
    }
    case 'mediaLibrary': {
      const { status, canAskAgain } = await MediaLibrary.getPermissionsAsync();
      return { status: mapStatus(status), canAskAgain };
    }
  }
};

// ─── handlePermissionResult ──────────────────────────────────────────────────

/**
 * Permission state machine:
 *   'granted'                          → call onGranted()
 *   'denied' with canAskAgain=true     → call onDenied with Linking.openSettings
 *   'blocked' OR 'denied' canAskAgain=false → call onDenied with Linking.openSettings, do NOT re-request
 *   'undetermined'                     → call onDenied (graceful fallback)
 *
 * Requirements: 11.18, 11.19, 11.20
 */
export const handlePermissionResult = (
  status: PermissionStatus,
  canAskAgain: boolean,
  onGranted: () => void,
  onDenied: (openSettings: () => void) => void,
): void => {
  const openSettings = () => Linking.openSettings();

  if (status === 'granted') {
    onGranted();
    return;
  }

  // For 'blocked' or 'denied' with canAskAgain=false: show Settings link, do NOT re-request
  // For 'denied' with canAskAgain=true: show rationale/Settings link
  // For 'undetermined': handle gracefully (should not occur after requestPermission)
  onDenied(openSettings);
};
