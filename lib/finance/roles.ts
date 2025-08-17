/**
 * Унифицированные проверки ролей для финансовых разделов.
 * Политика: доступ к фин.отчётам — только superManager и admin.
 */

export type RolesCtx = { isManager?: boolean; isSuperManager?: boolean; isAdmin?: boolean };

export function canViewFinance(
  { isManager, isSuperManager, isAdmin }: RolesCtx,
  opt?: { includeManager?: boolean }
) {
  const allowManagerFlag =
    opt?.includeManager || process.env.NEXT_PUBLIC_FIN_ALLOW_MANAGER === "true";
  return !!(isAdmin || isSuperManager || (allowManagerFlag && isManager));
}

