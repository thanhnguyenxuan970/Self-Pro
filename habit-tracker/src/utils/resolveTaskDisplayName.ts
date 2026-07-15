import { TEMPLATE_NAME_TO_KEY, Strings } from '../config/i18n';

export function resolveTaskDisplayName(name: string, t: Strings, isTemplate = false): string {
  if (!isTemplate) return name;
  const key = TEMPLATE_NAME_TO_KEY.get(name);
  return key ? ((t[key as keyof Strings] as string) ?? name) : name;
}
