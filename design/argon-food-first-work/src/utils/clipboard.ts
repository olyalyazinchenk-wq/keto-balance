export async function copyShoppingText(
  text: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined
): Promise<boolean> {
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
