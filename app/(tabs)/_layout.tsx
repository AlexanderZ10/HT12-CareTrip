import { MaterialIcons } from "@expo/vector-icons";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import { StyleSheet, TouchableOpacity, View } from "react-native";

function CenterActionButton({
  accessibilityState,
  onPress,
}: BottomTabBarButtonProps) {
  const focused = Boolean(accessibilityState?.selected);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.92}
      onPress={onPress}
      style={styles.centerButtonWrapper}
    >
      <View style={[styles.centerButton, focused && styles.centerButtonActive]}>
        <MaterialIcons name="add" size={34} color="#FAFCF5" />
      </View>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: "#EEF4E5",
        },
        tabBarActiveTintColor: "#5C8C1F",
        tabBarInactiveTintColor: "#748066",
        tabBarStyle: {
          height: 88,
          paddingTop: 12,
          paddingBottom: 14,
          backgroundColor: "#FAFCF5",
          borderTopWidth: 0,
          shadowColor: "#18240F",
          shadowOpacity: 0.08,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: -6 },
          elevation: 10,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
        },
        tabBarItemStyle: {
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="saved"
        options={{
          title: "Trips",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="format-list-bulleted" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: "Groups",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarAccessibilityLabel: "Open home planner",
          tabBarButton: (props) => <CenterActionButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Discover",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="travel-explore" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centerButtonWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: -24,
  },
  centerButton: {
    alignItems: "center",
    backgroundColor: "#5C8C1F",
    borderColor: "#EEF4E5",
    borderRadius: 34,
    borderWidth: 6,
    height: 68,
    justifyContent: "center",
    shadowColor: "#18240F",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    width: 68,
  },
  centerButtonActive: {
    backgroundColor: "#4E7A19",
  },
});
