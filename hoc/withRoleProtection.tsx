// hoc/withRoleProtection.tsx
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/router";
import { useEffect } from "react";

export function withRoleProtection<P>(WrappedComponent: React.ComponentType<P>, allowedRoles: string[]) {
  return function RoleProtectedComponent(props: P) {
    const { userData, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!loading && (!userData || !allowedRoles.includes(userData.role))) {
        router.push("/not-authorized"); // можно заменить на /login или /unauthorized
      }
    }, [loading, userData]);

    if (loading || !userData || !allowedRoles.includes(userData.role)) {
      return null; // или loader
    }

    return <WrappedComponent {...props} />;
  };
}