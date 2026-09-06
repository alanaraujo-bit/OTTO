import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
} from 'react-native';

/**
 * The keyboard is a native moving boundary, not a scroll interaction that the owner has to manage.
 * Android receives `windowSoftInputMode=adjustPan` from app.json, so the system keeps the focused
 * control visible for the entire IME session. iOS uses its native padding adjustment here.
 */
export function KeyboardAwareScrollView({ children, contentContainerStyle, ...props }: ScrollViewProps) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView {...props} contentContainerStyle={contentContainerStyle}>
        {children as ReactNode}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
