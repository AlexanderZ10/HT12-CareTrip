import React, { type ReactNode } from "react";
import { Keyboard, Platform, View, StyleSheet } from "react-native";

/**
 * Wraps children so that tapping empty space dismisses the keyboard.
 * Uses the responder system instead of Pressable so it never steals
 * touch events from nested ScrollViews.
 * On web the keyboard is virtual so this is a no-op wrapper.
 */
export function DismissKeyboard({ children }: { children: ReactNode }) {
  if (Platform.OS === "web") {
    return <>{children}</>;
  }

  return (
    <View
      style={styles.fill}
      accessible={false}
      onStartShouldSetResponder={() => {
        Keyboard.dismiss();
        return false;
      }}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
