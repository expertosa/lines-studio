/**
 * MoneyPrinterTurbo runs on the owner's Mac and pulls jobs.
 * This process never opens a connection to it.
 */
export const moneyprinterEngine = Object.freeze({
  id: 'moneyprinter',
  mode: 'pull',
  configured: true,
  paidCalls: false,
  macRequired: true,
});
