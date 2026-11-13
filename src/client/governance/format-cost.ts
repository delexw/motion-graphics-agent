/** Keep billed sub-cent calls visible instead of rounding them to zero. */
export function formatGovernanceCost(value: number) {
  if (value > 0 && value < 0.00000001) return "<$0.00000001";
  return `$${value.toFixed(value > 0 && value < 0.01 ? 8 : 4)}`;
}
