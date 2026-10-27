/**
 * USB/Bluetooth RFID readers act as keyboards: they "type" the card number very fast, then Enter.
 * This tells such a burst apart from a person typing, so a card tap works anywhere on the kiosk.
 */
export function createWedgeDetector(opts: {
  onCard: (card: string) => void;
  maxGapMs?: number;
  minLength?: number;
}) {
  const maxGap = opts.maxGapMs ?? 60;
  const minLength = opts.minLength ?? 4;
  let buffer = "";
  let last = 0;
  return (key: string, timeStamp: number) => {
    if (timeStamp - last > maxGap) buffer = "";
    last = timeStamp;
    if (key === "Enter") {
      const card = buffer;
      buffer = "";
      if (card.length >= minLength) {
        opts.onCard(card);
        return true;
      }
      return false;
    }
    if (key.length === 1 && /[0-9A-Za-z]/.test(key)) buffer += key;
    return false;
  };
}
