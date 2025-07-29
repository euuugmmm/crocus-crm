// capabilities.ts
export type Capability =
  | "booking.view"
  | "booking.create"
  | "booking.edit"
  | "booking.delete"
  | "comment.create"
  | "comment.moderate"
  | "payout.view"
  | "payout.edit";

type Role = "agent" | "olimpya_agent" | "manager" | "supermanager" | "admin";

export const ROLE_CAPS: Record<Role, Capability[]> = {
  agent: [
    "booking.view",
    "booking.create",
    "comment.create",
  ],
  olimpya_agent: [
    "booking.view",
    "booking.create",
    "comment.create",
  ],
  manager: [
    "booking.view",
    "booking.edit",
    "comment.create",
    "comment.moderate",
    "payout.view",
  ],
  supermanager: [
    "booking.view",
    "booking.edit",
    "booking.delete",
    "comment.create",
    "comment.moderate",
    "payout.view",
    "payout.edit",
  ],
  admin: [
    "booking.view",
    "booking.edit",
    "booking.delete",
    "comment.create",
    "comment.moderate",
    "payout.view",
    "payout.edit",
  ],
};