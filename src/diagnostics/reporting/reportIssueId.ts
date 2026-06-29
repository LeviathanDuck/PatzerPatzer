function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0');
}

function randomIssueCode(): string {
  try {
    const values = new Uint8Array(4);
    globalThis.crypto?.getRandomValues(values);
    const number = values.reduce((acc, value) => (acc * 256) + value, 0);
    return number.toString(36).toUpperCase().padStart(7, '0').slice(-7);
  } catch {
    return Math.floor(Math.random() * 78_364_164_096)
      .toString(36)
      .toUpperCase()
      .padStart(7, '0')
      .slice(-7);
  }
}

export function createReportIssueId(timestamp = Date.now(), uniqueCode = randomIssueCode()): string {
  const date = new Date(timestamp);
  const datePart = [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join('');
  const timePart = [
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
  const code = uniqueCode.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 10) || randomIssueCode();
  return `ISS-${datePart}-${timePart}-${code}`;
}
