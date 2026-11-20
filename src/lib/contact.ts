export const IAN_NAME = "IAN TECH";
export const IAN_PHONE_DISPLAY = "+254 723 278 526";
export const IAN_PHONE_TEL = "+254723278526";

export function waLink(raw: string, message?: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `254${digits.slice(1)}`;
  if (digits.length === 9) digits = `254${digits}`;
  if (!digits) digits = "254723278526";
  const text = encodeURIComponent(message ?? "Hello IAN TECH, I need help with a CBE scheme.");
  return `https://wa.me/${digits}?text=${text}`;
}
