export type TenantScopeRequest =
  | { kind: "ORGANIZATION"; organizationId: string }
  | { kind: "COMPANY"; organizationId: string; companyId: string }
  | { kind: "PLANT"; organizationId: string; companyId: string; plantId: string };
