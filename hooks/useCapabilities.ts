// hooks/useCapabilities.ts
import { useAuth } from "@/context/AuthContext";
import { ROLE_CAPS, type Capability } from "@hooks/lib/capabilities";

export function useCapabilities() {
  const { isAgent, isOlimpya, isManager, isSuperManager, isAdmin } = useAuth();

  // Выбираем массив прав в зависимости от роли
  const caps = new Set<Capability>(
    isAdmin
      ? ROLE_CAPS.admin
      : isSuperManager
      ? ROLE_CAPS.supermanager
      : isManager
      ? ROLE_CAPS.manager
      : isOlimpya
      ? ROLE_CAPS.olimpya_agent
      : ROLE_CAPS.agent
  );

  const can = (c: Capability) => caps.has(c);

  return { caps, can };
}