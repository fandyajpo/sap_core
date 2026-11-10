export function organizationApiPath(organizationId: string): string {
  return `/api/organizations/${encodeURIComponent(organizationId)}`;
}

export function withQuery(path: string, values: Record<string, string>): string {
  const query = new URLSearchParams(values);
  return `${path}?${query.toString()}`;
}
