import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useAppTheme } from "../../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
  shadow,
} from "../../../constants/design-system";

type ActionMenuProps = {
  visible: boolean;
  onClose: () => void;
  onCreateGroup: () => void;
  onUsePrivateKey: () => void;
  onCreateTripRequest: () => void;
};

export function ActionMenu({
  visible,
  onClose,
  onCreateGroup,
  onUsePrivateKey,
  onCreateTripRequest,
}: ActionMenuProps) {
  const { colors } = useAppTheme();

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.actionMenuBackdrop}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={styles.actionMenuDismissArea}
        />
        <View style={[styles.actionMenuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onCreateGroup}
            style={styles.actionMenuItem}
          >
            <View style={[styles.actionMenuIconWrap, { backgroundColor: colors.accent }]}>
              <MaterialIcons color={colors.buttonTextOnAction} name="group-add" size={18} />
            </View>
            <View style={styles.actionMenuTextWrap}>
              <Text style={[styles.actionMenuTitle, { color: colors.textPrimary }]}>Create group</Text>
              <Text style={[styles.actionMenuSubtitle, { color: colors.textSecondary }]}>
                Create a new public or private group.
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onUsePrivateKey}
            style={styles.actionMenuItem}
          >
            <View style={[styles.actionMenuIconWrap, { backgroundColor: colors.warningText }]}>
              <MaterialIcons color="#FFFFFF" name="vpn-key" size={18} />
            </View>
            <View style={styles.actionMenuTextWrap}>
              <Text style={[styles.actionMenuTitle, { color: colors.textPrimary }]}>Use private key</Text>
              <Text style={[styles.actionMenuSubtitle, { color: colors.textSecondary }]}>
                Join a private group with the creator&apos;s key.
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onCreateTripRequest}
            style={styles.actionMenuItem}
          >
            <View style={[styles.actionMenuIconWrap, { backgroundColor: "#246A7A" }]}>
              <MaterialIcons color="#FFFFFF" name="tips-and-updates" size={18} />
            </View>
            <View style={styles.actionMenuTextWrap}>
              <Text style={[styles.actionMenuTitle, { color: colors.textPrimary }]}>Create trip request</Text>
              <Text style={[styles.actionMenuSubtitle, { color: colors.textSecondary }]}>
                Post a travel idea and collect interested people first.
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actionMenuBackdrop: {
    backgroundColor: "rgba(0,0,0,0.15)",
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: Spacing.xl,
    paddingTop: 80,
  },
  actionMenuDismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  actionMenuCard: {
    alignSelf: "flex-end",
    borderRadius: Radius.xl,
    borderWidth: 1,
    minWidth: 300,
    padding: Spacing.md,
    ...shadow("lg"),
  },
  actionMenuItem: {
    alignItems: "center",
    borderRadius: Radius.lg,
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  actionMenuIconWrap: {
    alignItems: "center",
    borderRadius: Radius.lg,
    height: Spacing["3xl"],
    justifyContent: "center",
    width: Spacing["3xl"],
  },
  actionMenuTextWrap: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  actionMenuTitle: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
  actionMenuSubtitle: {
    ...TypeScale.bodySm,
    marginTop: 3,
  },
});
