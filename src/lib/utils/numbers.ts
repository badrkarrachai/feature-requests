/**
 * Format numbers like social media platforms (Instagram, Facebook, etc.)
 * Examples:
 * - 1,234 -> 1.2K
 * - 1,000,000 -> 1M
 * - 1,000,000,000 -> 1B
 * - 999 -> 999 (no formatting for numbers under 1000)
 */
export function formatNumber(num: number): string {
  if (num < 1000) {
    return num.toString();
  }

  if (num < 1000000) {
    const formatted = (num / 1000).toFixed(1);
    // Remove .0 if it's a whole number
    return formatted.endsWith(".0") ? formatted.slice(0, -2) + "K" : formatted + "K";
  }

  if (num < 1000000000) {
    const formatted = (num / 1000000).toFixed(1);
    // Remove .0 if it's a whole number
    return formatted.endsWith(".0") ? formatted.slice(0, -2) + "M" : formatted + "M";
  }

  const formatted = (num / 1000000000).toFixed(1);
  // Remove .0 if it's a whole number
  return formatted.endsWith(".0") ? formatted.slice(0, -2) + "B" : formatted + "B";
}

/**
 * Format numbers with proper pluralization for counts
 * Examples:
 * - formatCount(1, 'vote') -> '1 vote'
 * - formatCount(1234, 'vote') -> '1.2K votes'
 * - formatCount(0, 'comment') -> '0 comments'
 */
export function formatCount(num: number, singular: string): string {
  const formattedNum = formatNumber(num);
  const isPlural = num !== 1;
  return `${formattedNum} ${singular}${isPlural ? "s" : ""}`;
}
