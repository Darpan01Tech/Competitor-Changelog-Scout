const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function reviewConfigurationIssues(env: Record<string, string | undefined> = process.env) {
  const missing = [
    ...(!env["DEMO_REVIEWER_EMAIL"]?.trim() ? ["DEMO_REVIEWER_EMAIL"] : []),
    ...(!env["DEMO_REVIEWER_PASSWORD"] ? ["DEMO_REVIEWER_PASSWORD"] : []),
    ...(!env["DEMO_REVIEWER_USER_ID"]?.trim() ? ["DEMO_REVIEWER_USER_ID"] : []),
    ...(!env["SUPABASE_URL"] ? ["SUPABASE_URL"] : []),
    ...(!env["SUPABASE_SERVICE_ROLE_KEY"] ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];
  if (env["DEMO_REVIEWER_USER_ID"]?.trim() && !isUuid(env["DEMO_REVIEWER_USER_ID"].trim())) {
    missing.push("DEMO_REVIEWER_USER_ID (must be a UUID)");
  }
  return missing;
}

export function reviewConfiguration(env: Record<string, string | undefined> = process.env) {
  const email = env["DEMO_REVIEWER_EMAIL"]?.trim();
  const password = env["DEMO_REVIEWER_PASSWORD"];
  const userId = env["DEMO_REVIEWER_USER_ID"]?.trim();
  const supabaseUrl = env["SUPABASE_URL"];
  const serviceKey = env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!email || !password || !userId || !supabaseUrl || !serviceKey || !isUuid(userId)) return null;
  return { email, password, userId };
}
