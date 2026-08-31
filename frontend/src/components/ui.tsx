import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';

import { Colors, Radius } from '@/constants/theme';

// "1a 야간 네온" 디자인의 공용 조각. 화면마다 버튼·카드를 새로 그리지 않도록 여기 모음.

type ButtonProps = PressableProps & { title: string; variant?: 'primary' | 'outline' };

export function ThemedButton({ title, variant = 'primary', style, disabled, ...rest }: ButtonProps) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonOutline,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
        typeof style === 'function' ? undefined : style,
      ]}
      {...rest}>
      <Text style={[styles.buttonText, isPrimary ? styles.buttonTextPrimary : styles.buttonTextOutline]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: Colors.accent },
  buttonOutline: { borderWidth: 1, borderColor: Colors.borderStrong },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { opacity: 0.85 },
  buttonText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 14 },
  buttonTextPrimary: { color: Colors.accentText },
  buttonTextOutline: { color: Colors.text },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.card,
    padding: 16,
  },
  label: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 10,
    letterSpacing: 1.5,
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
});
