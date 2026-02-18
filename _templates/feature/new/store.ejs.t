---
to: apps/web/src/stores/<%= name %>-store.ts
unless_exists: true
skip_if: <%= !withStore %>
---
import { create } from "zustand";

interface <%= h.PascalCase(name) %>State {
  // TODO: define state
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

export const use<%= h.PascalCase(name) %>Store = create<<%= h.PascalCase(name) %>State>((set) => ({
  isLoading: false,
  setLoading: (loading) => set({ isLoading: loading }),
}));
