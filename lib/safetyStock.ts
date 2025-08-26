export const SAFETY: Record<string, number> = {
  "Hải Phòng|40HC": 20,
  "Cái Mép|40HC": 10,
  "TP.HCM|20GP": 30,
  "Đà Nẵng|40HC": 10
};
export const getSafety = (port: string, type: string) => SAFETY[`${port}|${type}`] ?? 0;
