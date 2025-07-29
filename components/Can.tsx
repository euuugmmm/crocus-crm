// components/Can.tsx
import { PropsWithChildren } from "react";
import { useCapabilities } from "@/hooks/useCapabilities";
import type { Capability } from "@/hooks/lib/capabilities";

export function Can({ do: cap, children }: PropsWithChildren<{ do: Capability }>) {
  const { can } = useCapabilities();
  if (!can(cap)) return null;
  return <>{children}</>;
}