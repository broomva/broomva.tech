const ADMIN_EMAIL = "carlosdavidescobar@gmail.com";

export function isAdmin(email: string | undefined | null): boolean {
  return email === ADMIN_EMAIL;
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
