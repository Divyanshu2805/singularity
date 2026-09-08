/**
 * The "payments are in test mode" note shown beside anything that starts or changes a payment.
 *
 * Handles: telling a visitor to the live demo that no real money moves and which card completes a checkout, or
 * rendering nothing at all when the deployment is not in test mode.
 *
 * `enabled` defaults to the build-time flag (lib/payments-mode.ts) and is a prop only so the two states can be rendered
 * in a test without rebuilding the bundle.
 */
import { FlaskConical } from "lucide-react";
import { PAYMENTS_TEST_MODE, TEST_CARD_NUMBER } from "@/lib/payments-mode";
import { cn } from "@/lib/utils";

interface PaymentsTestModeNoticeProps {
  enabled?: boolean;
  className?: string;
}

export function PaymentsTestModeNotice({ enabled = PAYMENTS_TEST_MODE, className }: PaymentsTestModeNoticeProps) {
  if (!enabled) return null;

  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left",
        className,
      )}
    >
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Payments are in Stripe test mode.</span> No real money moves. At
        checkout use card <span className="font-mono text-foreground">{TEST_CARD_NUMBER}</span> with any future expiry
        and any CVC.
      </p>
    </div>
  );
}
