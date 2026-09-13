import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

interface SignOutModalProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function SignOutModal({ visible, onConfirm, onCancel, isLoading = false }: SignOutModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      hardwareAccelerated={false}
    >
      <View style={styles.container}>
        <Pressable style={styles.backdrop} onPress={onCancel} disabled={isLoading} />
        
        <View style={styles.modal}>
          <View style={styles.iconContainer}>
            <Ionicons name="log-out-outline" size={32} color={colors.danger} />
          </View>
          
          <Text style={styles.title}>Sign out or reset identity?</Text>
          <Text style={styles.message}>
            If no recovery method is connected, you may permanently lose access to this identity.
          </Text>
          
          <View style={styles.buttonGroup}>
            <Pressable
              style={[styles.button, styles.cancelButton, isLoading && styles.buttonDisabled]}
              onPress={onCancel}
              disabled={isLoading}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            
            <Pressable
              style={[styles.button, styles.confirmButton, isLoading && styles.buttonDisabled]}
              onPress={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? (
                <Text style={styles.confirmText}>Signing out...</Text>
              ) : (
                <>
                  <Ionicons name="log-out" size={16} color={colors.navy950} style={{ marginRight: 6 }} />
                  <Text style={styles.confirmText}>Sign out</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modal: {
    backgroundColor: colors.navy800,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 1000,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonGroup: {
    gap: 10,
  },
  button: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.navy900,
  },
  confirmButton: {
    backgroundColor: colors.danger,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cancelText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  confirmText: {
    color: colors.navy950,
    fontSize: 14,
    fontWeight: '700',
  },
});
