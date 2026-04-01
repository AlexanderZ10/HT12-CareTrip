import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppLanguage } from "../../../components/app-language-provider";
import { FontWeight, Layout, Radius, Spacing, TypeScale, shadow } from "../../../constants/design-system";
import type { HomePlannerChatThread } from "../../../utils/home-chat-storage";
import { formatUpdatedDate } from "../../../utils/formatting";
import { sortHomePlannerChats } from "../../../utils/home-chat-storage";

type ChatDrawerProps = {
  chatMenuVisible: boolean;
  chatSearch: string;
  chats: HomePlannerChatThread[];
  colors: {
    border: string;
    card: string;
    cardAlt: string;
    modalOverlay: string;
    textPrimary: string;
    textSecondary: string;
  };
  currentChatId: string | null;
  filteredChats: HomePlannerChatThread[];
  insetBottom: number;
  insetTop: number;
  isPhoneChatDrawerMounted: boolean;
  isPhoneLayout: boolean;
  onChatSearchChange: (value: string) => void;
  onCloseChatMenu: () => void;
  onClosePhoneDrawer: () => void;
  onCreateChat: () => void;
  onDeleteChat: (chat: HomePlannerChatThread) => void;
  onRenameChat: (chatId: string, currentTitle: string) => void;
  onSaveRename: () => void;
  onSelectChat: (chatId: string) => void;
  onTogglePin: (chatId: string) => void;
  phoneDrawerTranslateX: Animated.Value;
  phoneDrawerWidth: number;
  renameValue: string;
  renamingChatId: string | null;
  setRenameValue: (value: string) => void;
  setRenamingChatId: (id: string | null) => void;
};

function ChatListItem({
  chat,
  isActive,
  isRenaming,
  renamePlaceholder,
  onDelete,
  onRename,
  onSaveRename,
  onSelect,
  onTogglePin,
  renameValue,
  setRenameValue,
  setRenamingChatId,
}: {
  chat: HomePlannerChatThread;
  isActive: boolean;
  isRenaming: boolean;
  renamePlaceholder: string;
  onDelete: () => void;
  onRename: () => void;
  onSaveRename: () => void;
  onSelect: () => void;
  onTogglePin: () => void;
  renameValue: string;
  setRenameValue: (value: string) => void;
  setRenamingChatId: (id: string | null) => void;
}) {
  if (isRenaming) {
    return (
      <View style={[styles.chatListItem, isActive && styles.chatListItemActive]}>
        <View style={styles.renameWrap}>
          <TextInput
            style={styles.renameInput}
            value={renameValue}
            onChangeText={setRenameValue}
            placeholder={renamePlaceholder}
            placeholderTextColor="#9CA3AF"
          />
          <View style={styles.renameActions}>
            <TouchableOpacity style={styles.iconButton} onPress={onSaveRename} activeOpacity={0.9}>
              <MaterialIcons name="check" size={18} color="#2D6A4F" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => {
                setRenamingChatId(null);
                setRenameValue("");
              }}
              activeOpacity={0.9}
            >
              <MaterialIcons name="close" size={18} color="#DC3545" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.chatListItem, isActive && styles.chatListItemActive]}>
      <TouchableOpacity onPress={onSelect} activeOpacity={0.9}>
        <View style={styles.chatTitleRow}>
          <Text style={styles.chatItemTitle} numberOfLines={2}>
            {chat.title}
          </Text>
          {chat.pinned ? <MaterialIcons name="push-pin" size={16} color="#92400E" /> : null}
        </View>
        <Text style={styles.chatItemMeta}>{formatUpdatedDate(chat.updatedAtMs)}</Text>
      </TouchableOpacity>
      <View style={styles.chatItemActions}>
        <TouchableOpacity style={styles.iconButton} onPress={onRename} activeOpacity={0.9}>
          <MaterialIcons name="edit" size={16} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={onTogglePin} activeOpacity={0.9}>
          <MaterialIcons
            name={chat.pinned ? "push-pin" : "outlined-flag"}
            size={16}
            color="#6B7280"
          />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={onDelete} activeOpacity={0.9}>
          <MaterialIcons name="delete-outline" size={16} color="#DC3545" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ChatDrawer({
  chatMenuVisible,
  chatSearch,
  chats,
  colors,
  currentChatId,
  filteredChats,
  insetBottom,
  insetTop,
  isPhoneChatDrawerMounted,
  isPhoneLayout,
  onChatSearchChange,
  onCloseChatMenu,
  onClosePhoneDrawer,
  onCreateChat,
  onDeleteChat,
  onRenameChat,
  onSaveRename,
  onSelectChat,
  onTogglePin,
  phoneDrawerTranslateX,
  phoneDrawerWidth,
  renameValue,
  renamingChatId,
  setRenameValue,
  setRenamingChatId,
}: ChatDrawerProps) {
  const { language, t } = useAppLanguage();
  const savedChatsLabel =
    language === "bg"
      ? `${chats.length} запазени chat-а`
      : language === "de"
        ? `${chats.length} gespeicherte Chats`
        : language === "es"
          ? `${chats.length} chats guardados`
          : language === "fr"
            ? `${chats.length} chats enregistrés`
            : `${chats.length} saved chats`;

  const renderChatList = (chatList: HomePlannerChatThread[]) => {
    if (chatList.length === 0) {
      return (
        <View style={styles.emptyChatSearchState}>
          <Text style={styles.emptyChatSearchText}>{t("home.noChatsFound")}</Text>
        </View>
      );
    }

    return chatList.map((chat) => (
      <ChatListItem
        key={chat.id}
        chat={chat}
        isActive={currentChatId === chat.id}
        isRenaming={renamingChatId === chat.id}
        renamePlaceholder={t("home.chatName")}
        onDelete={() => onDeleteChat(chat)}
        onRename={() => onRenameChat(chat.id, chat.title)}
        onSaveRename={onSaveRename}
        onSelect={() => onSelectChat(chat.id)}
        onTogglePin={() => onTogglePin(chat.id)}
        renameValue={renameValue}
        setRenameValue={setRenameValue}
        setRenamingChatId={setRenamingChatId}
      />
    ));
  };

  return (
    <>
      {isPhoneLayout && isPhoneChatDrawerMounted ? (
        <View style={styles.phoneDrawerOverlay}>
          <Pressable style={styles.phoneDrawerBackdrop} onPress={onClosePhoneDrawer} />
          <Animated.View
            style={[
              styles.phoneDrawerPanel,
              {
                paddingBottom: insetBottom + 16,
                paddingTop: insetTop + 14,
                transform: [{ translateX: phoneDrawerTranslateX }],
                width: phoneDrawerWidth,
              },
            ]}
          >
            <View style={styles.phoneDrawerTopRow}>
              <Text style={styles.phoneDrawerBrand}>CareTrip</Text>
              <TouchableOpacity
                style={styles.phoneDrawerCloseButton}
                onPress={onClosePhoneDrawer}
                activeOpacity={0.9}
              >
                <MaterialIcons name="close" size={20} color="#1A1A1A" />
              </TouchableOpacity>
            </View>
            <View style={styles.phoneDrawerSearchWrap}>
              <MaterialIcons name="search" size={18} color="#9CA3AF" />
              <TextInput
                style={styles.phoneDrawerSearchInput}
                value={chatSearch}
                onChangeText={onChatSearchChange}
                placeholder={t("home.searchChats")}
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <ScrollView
              style={styles.phoneDrawerList}
              contentContainerStyle={styles.phoneDrawerListContent}
              showsVerticalScrollIndicator={false}
            >
              {renderChatList(filteredChats)}
            </ScrollView>
          </Animated.View>
        </View>
      ) : null}

      <Modal visible={chatMenuVisible} transparent animationType="fade" onRequestClose={onCloseChatMenu}>
        <SafeAreaView
          style={[styles.historyMenuBackdrop, { backgroundColor: colors.modalOverlay }]}
          edges={["top", "bottom", "left"]}
        >
          <View
            style={[
              styles.historyMenuCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.historyMenuHeader}>
              <View>
                <Text style={[styles.historyMenuTitle, { color: colors.textPrimary }]}>
                  {t("home.aiChats")}
                </Text>
                <Text style={[styles.historyMenuSubtitle, { color: colors.textSecondary }]}>
                  {savedChatsLabel}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.historyMenuClose, { backgroundColor: colors.cardAlt }]}
                onPress={onCloseChatMenu}
                activeOpacity={0.9}
              >
                <MaterialIcons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.newChatButton, styles.historyMenuNewChatButton]}
              onPress={onCreateChat}
              activeOpacity={0.9}
            >
              <MaterialIcons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.newChatButtonText}>{t("home.newPlan")}</Text>
            </TouchableOpacity>

            <ScrollView
              style={styles.sidebarList}
              contentContainerStyle={styles.sidebarListContent}
              showsVerticalScrollIndicator={false}
            >
              {renderChatList(sortHomePlannerChats(chats))}
            </ScrollView>
          </View>
          <TouchableOpacity activeOpacity={1} onPress={onCloseChatMenu} style={styles.historyMenuDismissArea} />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chatListItem: {
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    marginBottom: Spacing.sm,
  },
  chatListItemActive: {
    backgroundColor: "#E5E7EB",
    borderColor: "#D1D5DB",
  },
  chatTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.xs,
  },
  chatItemTitle: {
    color: "#1A1A1A",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
    flex: 1,
    paddingRight: Spacing.sm,
  },
  chatItemMeta: {
    color: "#9CA3AF",
    ...TypeScale.labelMd,
    marginBottom: Spacing.sm,
  },
  chatItemActions: {
    flexDirection: "row",
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    marginRight: Spacing.sm,
  },
  renameWrap: {
    width: "100%",
  },
  renameInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#E8E8E8",
    marginBottom: Spacing.sm,
  },
  renameActions: {
    flexDirection: "row",
  },
  emptyChatSearchState: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  emptyChatSearchText: {
    color: "#9CA3AF",
    ...TypeScale.bodyMd,
    textAlign: "center",
  },
  phoneDrawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 20,
  },
  phoneDrawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  phoneDrawerPanel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#FFFFFF",
    borderTopRightRadius: Radius["2xl"],
    borderBottomRightRadius: Radius["2xl"],
    borderRightWidth: 1,
    borderColor: "#E8E8E8",
    paddingHorizontal: Spacing.md,
    ...shadow("xl"),
  },
  phoneDrawerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  phoneDrawerBrand: {
    color: "#1A1A1A",
    ...TypeScale.headingMd,
    fontWeight: FontWeight.black,
  },
  phoneDrawerCloseButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  phoneDrawerSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  phoneDrawerSearchInput: {
    flex: 1,
    minHeight: Layout.touchTarget,
    marginLeft: Spacing.sm,
    color: "#1A1A1A",
  },
  phoneDrawerList: {
    flex: 1,
  },
  phoneDrawerListContent: {
    paddingBottom: Spacing.sm,
  },
  historyMenuBackdrop: {
    flex: 1,
    flexDirection: "row",
    paddingBottom: Spacing.lg,
    paddingRight: Spacing.lg,
  },
  historyMenuDismissArea: {
    flex: 1,
  },
  historyMenuCard: {
    borderBottomRightRadius: Radius["3xl"],
    borderTopRightRadius: Radius["3xl"],
    borderWidth: 1,
    height: "100%",
    maxWidth: 380,
    padding: Spacing.lg,
    ...shadow("xl"),
    width: "82%",
  },
  historyMenuHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  historyMenuTitle: {
    ...TypeScale.headingMd,
    fontWeight: FontWeight.extrabold,
  },
  historyMenuSubtitle: {
    ...TypeScale.bodySm,
    marginTop: Spacing.xs,
  },
  historyMenuClose: {
    alignItems: "center",
    borderRadius: Radius.full,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  historyMenuNewChatButton: {
    marginBottom: Spacing.md,
  },
  newChatButton: {
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  newChatButtonText: {
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.xs,
  },
  sidebarList: {
    flex: 1,
  },
  sidebarListContent: {
    paddingBottom: Spacing.md,
  },
  scrollToBottomButton: {
    position: "absolute",
    right: Spacing.lg,
    bottom: Spacing.lg,
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: "#2D6A4F",
    alignItems: "center",
    justifyContent: "center",
    ...shadow("md"),
  },
});
