import React, { type ReactNode } from "react";
import { Keyboard, Platform, Pressable, StyleSheet } from "react-native";

/**
 * Wraps children so that tapping outside a TextInput dismisses the keyboard.
 * On web the keyboard is virtual so this is a no-op wrapper.
 * Uses Pressable instead of TouchableWithoutFeedback so it does not steal
 * the touch responder from nested ScrollViews.
 */
export function DismissKeyboard({ children }: { children: ReactNode }) {
  if (Platform.OS === "web") {
    return <>{children}</>;
  }

  return (
    <Pressable style={styles.fill} onPress={Keyboard.dismiss} accessible={false}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
