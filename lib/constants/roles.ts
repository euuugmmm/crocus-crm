// lib/constants/roles.ts
export type AppRole =
  | "agent"
  | "olimpya_agent"
  | "manager"
  | "supermanager"
  | "admin";

export const isAgent = (r?: AppRole) => r === "agent";
export const isOlimpya = (r?: AppRole) => r === "olimpya_agent";
export const isManager = (r?: AppRole) => r === "manager";
export const isSuperManager = (r?: AppRole) => r === "supermanager";
export const isAdmin = (r?: AppRole) => r === "admin";