/**
 * A figure that counts up to its value - a tab's project count, a usage total.
 *
 * Handles: counting from zero when it first appears and from the old value when it changes (hooks/use-count-up),
 * and formatting each number on the way with the caller's formatter, so a total reads "185,467" at every step.
 */
import { useCountUp } from "@/hooks/use-count-up";

export function CountUp({ value, format = String }: { value: number; format?: (value: number) => string }) {
  return <>{format(useCountUp(value, 0))}</>;
}
