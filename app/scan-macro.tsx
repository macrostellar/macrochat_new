import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';

const MACRO_ID_REGEX = /^MC-[A-Z]+-\d{4}$/i;

function extractMacroId(raw: string) {
  const value = raw.trim();
  if (!value) return null;

  const direct = value.match(/MC-[A-Z]+-\d{4}/i)?.[0];
  if (direct) return direct.toUpperCase();

  try {
    const parsed = new URL(value);
    const fromQuery = parsed.searchParams.get('macroId') || parsed.searchParams.get('macro_id') || parsed.searchParams.get('id');
    if (fromQuery && MACRO_ID_REGEX.test(fromQuery)) return fromQuery.toUpperCase();

    const fromPath = decodeURIComponent(parsed.pathname || '').match(/MC-[A-Z]+-\d{4}/i)?.[0];
    if (fromPath) return fromPath.toUpperCase();
  } catch {
    // Ignore URL parse errors and fall back to plain text matching.
  }

  return null;
}

export default function ScanMacroScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const granted = useMemo(() => permission?.granted === true, [permission?.granted]);

  const onScanned = (payload: { data?: string }) => {
    if (scanned) return;
    const macroId = extractMacroId(payload.data || '');
    if (!macroId) {
      setScanned(true);
      Alert.alert('Invalid QR code', 'This QR does not contain a valid Macro ID.', [
        { text: 'Try Again', onPress: () => setScanned(false) },
        { text: 'Close', style: 'cancel', onPress: () => router.back() },
      ]);
      return;
    }

    setScanned(true);
    router.replace({ pathname: '/new-chat', params: { macroId, autoStart: '1' } });
  };

  if (!permission) {
    return <View style={styles.page} />;
  }

  if (!granted) {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.permissionCard}>
          <Ionicons name="qr-code-outline" size={34} color={colors.neon} />
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionBody}>Allow camera permission to scan a Macro ID QR code.</Text>
          <Pressable style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.primaryButtonText}>Allow Camera</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
        enableTorch={torchOn}
      >
        <View style={styles.overlay}>
          <View style={styles.topBar}>
            <Pressable style={styles.iconBtn} onPress={() => router.back()}>
              <Ionicons name="close" size={24} color={colors.white} />
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={() => setTorchOn((value) => !value)}>
              <Ionicons name={torchOn ? 'flash' : 'flash-off'} size={20} color={colors.white} />
            </Pressable>
          </View>

          <View style={styles.scanFrameWrap}>
            <View style={styles.scanFrame} />
            <Text style={styles.hint}>Scan a contact Macro ID QR code</Text>
          </View>

          <View style={styles.bottomBar}>
            <Pressable style={styles.manualBtn} onPress={() => router.replace('/new-chat')}>
              <Ionicons name="create-outline" size={18} color={colors.white} />
              <Text style={styles.manualBtnText}>Type instead</Text>
            </Pressable>
          </View>
        </View>
      </CameraView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.black },
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.20)' },
  topBar: { marginTop: 16, marginHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between' },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.40)', alignItems: 'center', justifyContent: 'center' },
  scanFrameWrap: { alignItems: 'center' },
  scanFrame: { width: 250, height: 250, borderRadius: 26, borderWidth: 3, borderColor: colors.neon, backgroundColor: 'transparent' },
  hint: { marginTop: 14, color: colors.white, fontWeight: '800', fontSize: 14 },
  bottomBar: { alignItems: 'center', marginBottom: 26 },
  manualBtn: { height: 46, borderRadius: 23, paddingHorizontal: 18, backgroundColor: 'rgba(6,14,26,0.78)', borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 7 },
  manualBtnText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  permissionCard: { margin: 22, marginTop: 90, borderRadius: 18, backgroundColor: colors.navy900, borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: 'center' },
  permissionTitle: { marginTop: 12, color: colors.white, fontSize: 20, fontWeight: '900' },
  permissionBody: { marginTop: 8, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  primaryButton: { marginTop: 18, height: 48, borderRadius: 14, backgroundColor: colors.blue, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: colors.navy950, fontSize: 14, fontWeight: '900' },
  secondaryButton: { marginTop: 10, height: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: colors.white, fontSize: 13, fontWeight: '800' },
});