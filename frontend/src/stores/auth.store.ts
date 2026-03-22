import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserDto } from "@surveysim/shared";

type AuthState = {
  token: string | null;
  user: UserDto | null;
  setSession: (token: string, user: UserDto) => void;
  clearSession: () => void;
};

export const authStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      clearSession: () => set({ token: null, user: null }),
    }),
    { name: "surveysim-auth" },
  ),
);
