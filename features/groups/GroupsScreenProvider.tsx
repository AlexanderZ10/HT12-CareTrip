import React, { createContext, useContext } from "react";

import { useGroupsScreen } from "./useGroupsScreen";

type GroupsScreenContextValue = ReturnType<typeof useGroupsScreen>;

const GroupsScreenContext = createContext<GroupsScreenContextValue | null>(null);

export function GroupsScreenProvider({ children }: { children: React.ReactNode }) {
  const vm = useGroupsScreen({ enablePostComments: true });
  return (
    <GroupsScreenContext.Provider value={vm}>{children}</GroupsScreenContext.Provider>
  );
}

export function useSharedGroupsScreen(): GroupsScreenContextValue {
  const ctx = useContext(GroupsScreenContext);
  if (!ctx) {
    throw new Error("useSharedGroupsScreen must be used within GroupsScreenProvider");
  }
  return ctx;
}
