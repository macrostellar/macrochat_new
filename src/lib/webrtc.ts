import { Platform } from 'react-native';

export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] },
  ];

  const turnUrl = process.env.EXPO_PUBLIC_TURN_URL;
  const turnUsername = process.env.EXPO_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.EXPO_PUBLIC_TURN_CREDENTIAL;

  if (turnUrl) {
    servers.push({
      urls: turnUrl.split(',').map((value) => value.trim()),
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return servers;
}

type WebRTCApi = {
  RTCPeerConnection: typeof RTCPeerConnection;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
};

let cachedApi: WebRTCApi | null = null;

// Web uses the browser's native WebRTC support. Native (iOS/Android) needs the
// react-native-webrtc module plus a custom dev client rebuild - it is not available in Expo Go.
export function getWebRTC(): WebRTCApi {
  if (cachedApi) return cachedApi;

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !window.RTCPeerConnection || !navigator.mediaDevices) {
      throw new Error('This browser does not support WebRTC calls.');
    }
    cachedApi = {
      RTCPeerConnection: window.RTCPeerConnection,
      getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    };
    return cachedApi;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nativeWebRTC = require('react-native-webrtc');
    cachedApi = {
      RTCPeerConnection: nativeWebRTC.RTCPeerConnection,
      getUserMedia: (constraints) => nativeWebRTC.mediaDevices.getUserMedia(constraints),
    };
    return cachedApi;
  } catch {
    throw new Error('Voice/video calls need the react-native-webrtc native module. Install it and rebuild a custom dev client, then try again.');
  }
}
