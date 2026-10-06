/**
 * The title a "título #projeto" text leaves, by the backend's rule (a last
 * word "#..." with at least one letter). Used to refuse a text that is only
 * a tag before sending it.
 */
export function titleWithoutProject(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^(.*?)(?:^|\s)#([\p{L}\p{N}_-]+)$/u);
  if (!match || !/\p{L}/u.test(match[2])) return trimmed;
  return match[1].trim();
}
