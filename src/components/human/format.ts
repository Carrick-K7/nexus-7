export type HumanLanguage = "zh" | "en";

const MAX_DECIMAL_LENGTH = 28;

/** Expand only a short decimal, never hundreds of zeroes or an unexplained e-8. */
function decimalPreview(value: number, precision: number): string | null {
  const rounded = Number(value.toPrecision(precision));
  if (!Number.isFinite(rounded)) return null;
  const text = String(rounded);
  if (!text.includes("e")) return text.length <= MAX_DECIMAL_LENGTH ? text : null;
  const negative = text.startsWith("-");
  const [mantissa, power] = (negative ? text.slice(1) : text).split("e");
  const digits = mantissa.replace(".", "");
  const point = (mantissa.includes(".") ? mantissa.indexOf(".") : mantissa.length) + Number(power);
  const length = (negative ? 1 : 0) + (point <= 0 ? 2 - point + digits.length : point >= digits.length ? point : digits.length + 1);
  if (length > MAX_DECIMAL_LENGTH) return null;
  const decimal = point <= 0 ? `0.${"0".repeat(-point)}${digits}`
    : point >= digits.length ? digits + "0".repeat(point - digits.length)
      : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return (negative ? "-" : "") + decimal;
}

function compactValue(value: number, position: 1 | 2, language: HumanLanguage): string {
  if (value === 0) return "0";
  const small = Math.abs(value) < 1;
  return language === "zh"
    ? `${small ? "极小" : "很大"}的${value < 0 ? "负" : "正"}数（结果${position === 1 ? "一" : "二"}）`
    : `${small ? "Very small" : "Very large"} ${value < 0 ? "negative" : "positive"} value (result ${position})`;
}

/** Increase significant digits until unequal measured results stay visibly unequal. */
export function measuredPair(first: number, second: number, language: HumanLanguage = "zh"): [string, string] {
  if (first === second) {
    const same = decimalPreview(first, 8) ?? compactValue(first, 1, language);
    return [same, same];
  }
  for (let precision = 8; precision <= 17; precision++) {
    const a = decimalPreview(first, precision);
    const b = decimalPreview(second, precision);
    if (a !== null && b !== null && (first === second || a !== b)) return [a, b];
    if (a === null || b === null) return [a ?? compactValue(first, 1, language), b ?? compactValue(second, 2, language)];
  }
  // Distinct labels are deliberate: identical rounded strings would imply equality.
  return [compactValue(first, 1, language), compactValue(second, 2, language)];
}

export function humanTime(value: string, language: HumanLanguage): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(new Date(value)) + (language === "zh" ? "（北京时间）" : " (Beijing time)");
}

export function count(value: number, language: HumanLanguage): string {
  return value.toLocaleString(language === "zh" ? "zh-CN" : "en-US");
}
