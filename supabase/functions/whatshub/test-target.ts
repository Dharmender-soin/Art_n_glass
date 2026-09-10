export function parseTestTarget(value: string, groupOnly = false) {
  const target = value.trim();
  if (/^\d+(?:-\d+)?@g\.us$/.test(target)) return { kind: "group" as const, target };
  if (groupOnly || target.includes("@")) throw new Error("Enter a valid Group JID, for example 12345@g.us.");
  if (!/^\+?[\d\s()-]+$/.test(target)) throw new Error("Enter a phone number with country code or a Group JID ending in @g.us.");
  const digits = target.replace(/\D/g, "");
  const phone = digits.length === 10 ? `91${digits}` : digits;
  if (!/^[1-9]\d{10,14}$/.test(phone)) throw new Error("Enter a valid phone number with country code. Indian 10-digit numbers are also supported.");
  return { kind: "phone" as const, target: phone };
}
