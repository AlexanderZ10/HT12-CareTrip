import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

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
        <View style={styles.actionMenuCard}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onCreateGroup}
            style={styles.actionMenuItem}
          >
            <View style={styles.actionMenuIconWrap}>
              <MaterialIcons color="#FFFFFF" name="group-add" size={18} />
            </View>
            <View style={styles.actionMenuTextWrap}>
              <Text style={styles.actionMenuTitle}>Create group</Text>
              <Text style={styles.actionMenuSubtitle}>
                Create a new public or private group.
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onUsePrivateKey}
            style={styles.actionMenuItem}
          >
            <View style={[styles.actionMenuIconWrap, styles.actionMenuIconWrapAlt]}>
              <MaterialIcons color="#FFFFFF" name="vpn-key" size={18} />
            </View>
            <View style={styles.actionMenuTextWrap}>
              <Text style={styles.actionMenuTitle}>Use private key</Text>
              <Text style={styles.actionMenuSubtitle}>
                Join a private group with the creator&apos;s key.
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onCreateTripRequest}
            style={styles.actionMenuItem}
          >
            <View style={[styles.actionMenuIconWrap, styles.actionMenuIconWrapRequest]}>
              <MaterialIcons color="#FFFFFF" name="tips-and-updates" size={18} />
            </View>
            <View style={styles.actionMenuTextWrap}>
              <Text style={styles.actionMenuTitle}>Create trip request</Text>
              <Text style={styles.actionMenuSubtitle}>
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
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
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
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.lg,
    height: Spacing["3xl"],
    justifyContent: "center",
    width: Spacing["3xl"],
  },
  actionMenuIconWrapAlt: {
    backgroundColor: "#BA7517",
  },
  actionMenuIconWrapRequest: {
    backgroundColor: "#246A7A",
  },
  actionMenuTextWrap: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  actionMenuTitle: {
    ...TypeScale.titleSm,
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
  },
  actionMenuSubtitle: {
    ...TypeScale.bodySm,
    color: "#6B7280",
    marginTop: 3,
  },
});
