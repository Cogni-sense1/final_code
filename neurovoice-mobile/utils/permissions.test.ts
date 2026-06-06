/**
 * Property-based tests for utils/permissions.ts
 *
 * Feature: react-native-expo-migration
 * Property 10: Permission state machine correctness
 * **Validates: Requirements 11.18, 11.19, 11.20**
 */

import * as fc from 'fast-check';
import { handlePermissionResult, PermissionStatus } from './permissions';

// Mock expo-av, expo-camera, expo-media-library so imports resolve in Jest
jest.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: jest.fn(),
    getPermissionsAsync: jest.fn(),
  },
}));

jest.mock('expo-camera', () => ({
  Camera: {
    requestCameraPermissionsAsync: jest.fn(),
    getCameraPermissionsAsync: jest.fn(),
  },
}));

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Linking: {
    openSettings: jest.fn().mockResolvedValue(undefined),
  },
}));

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const statusArb = fc.constantFrom<PermissionStatus>(
  'undetermined',
  'granted',
  'denied',
  'blocked',
);

// ─── Property 10: Permission state machine correctness ────────────────────────
// **Validates: Requirements 11.18, 11.19, 11.20**

describe('Property 10: Permission state machine correctness', () => {
  it('calls onGranted iff status === "granted"', () => {
    fc.assert(
      fc.property(statusArb, fc.boolean(), (status, canAskAgain) => {
        const onGranted = jest.fn();
        const onDenied = jest.fn();

        handlePermissionResult(status, canAskAgain, onGranted, onDenied);

        if (status === 'granted') {
          expect(onGranted).toHaveBeenCalledTimes(1);
          expect(onDenied).not.toHaveBeenCalled();
        } else {
          expect(onGranted).not.toHaveBeenCalled();
          expect(onDenied).toHaveBeenCalledTimes(1);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('calls onDenied with a settings-opener function for any non-granted status', () => {
    const nonGrantedStatuses: PermissionStatus[] = ['undetermined', 'denied', 'blocked'];

    fc.assert(
      fc.property(
        fc.constantFrom(...nonGrantedStatuses),
        fc.boolean(),
        (status, canAskAgain) => {
          const onGranted = jest.fn();
          const onDenied = jest.fn();

          handlePermissionResult(status, canAskAgain, onGranted, onDenied);

          expect(onDenied).toHaveBeenCalledTimes(1);
          // The openSettings argument must be a callable function
          const openSettingsArg = onDenied.mock.calls[0][0];
          expect(typeof openSettingsArg).toBe('function');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('never calls the native permission API again when blocked or canAskAgain=false', () => {
    // We verify this by checking that handlePermissionResult itself does not
    // invoke any Expo permission APIs — it is a pure state machine that only
    // calls the provided callbacks.
    const { Audio } = require('expo-av');
    const { Camera } = require('expo-camera');
    const MediaLibrary = require('expo-media-library');

    const blockedOrNoAskStatuses: Array<[PermissionStatus, boolean]> = [
      ['blocked', true],
      ['blocked', false],
      ['denied', false],
    ];

    blockedOrNoAskStatuses.forEach(([status, canAskAgain]) => {
      jest.clearAllMocks();

      const onGranted = jest.fn();
      const onDenied = jest.fn();

      handlePermissionResult(status, canAskAgain, onGranted, onDenied);

      // No Expo permission API should have been called
      expect(Audio.requestPermissionsAsync).not.toHaveBeenCalled();
      expect(Audio.getPermissionsAsync).not.toHaveBeenCalled();
      expect(Camera.requestCameraPermissionsAsync).not.toHaveBeenCalled();
      expect(Camera.getCameraPermissionsAsync).not.toHaveBeenCalled();
      expect(MediaLibrary.requestPermissionsAsync).not.toHaveBeenCalled();
      expect(MediaLibrary.getPermissionsAsync).not.toHaveBeenCalled();
    });
  });
});
