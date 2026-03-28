import React, { type ReactNode } from "react";
import { Keyboard, Platform, StyleSheet, TouchableWithoutFeedback, View } from "react-native";

/**
 * Wraps children so that tapping outside a TextInput dismisses the keyboard.
 * On web the keyboard is virtual so this is a no-op wrapper.
 * Uses TouchableWithoutFeedback so it does not intercept ScrollView gestures.
 */
export function DismissKeyboard({ children }: { children: ReactNode }) {
  if (Platform.OS === "web") {
    return <>{children}</>;
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.fill}>
        {children}
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
