import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useBilling } from "@/hooks/use-billing";
import { api } from "@/lib/api";
import { describePlanChange, subscriptionStatusLabel } from "@/lib/billing";
import type { Plan, Subscription } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Confirms a change to a live subscription, then makes it.
 *
 * <p>Used for every paid-subscriber move - upgrade, downgrade, cancel and resume - by both the pricing page and
 * billing settings, so the same change reads the same way wherever it's started from. The confirm button is a
 * plain `Button` rather than `AlertDialogAction`, because Radix closes the dialog the moment an action is
 * clicked; this one has to stay open while the request runs and show an error in place if Stripe refuses
 * (a declined card on an upgrade, most likely).
 */
export function PlanChangeDialog({ current, target, onClose }: {
  current: Subscription | undefined;
  target: Plan | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { refresh } = useBilling();
  const [isWorking, setWorking] = useState(false);

  if (!current || !target || target.id == null) return null;
  const copy = describePlanChange(current, target);
  const planId = target.id;

  const confirm = async () => {
    setWorking(true);
    try {
      const updated = await api.changePlan(planId);
      await refresh();
      toast({ title: "Plan updated", description: `${updated.plan.name} - ${subscriptionStatusLabel(updated)}.` });
      onClose();
    } catch (error) {
      // Kept open: whatever went wrong (usually a declined card) the plan hasn't changed, and the person should
      // be able to read why and decide what to do without starting over.
      toast({
        title: "Your plan hasn't changed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && !isWorking && onClose()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {copy.body.map((line) => <p key={line}>{line}</p>)}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isWorking}>
            {copy.destructive ? `Keep ${current.plan.name}` : "Not now"}
          </AlertDialogCancel>
          <Button
            onClick={() => void confirm()}
            disabled={isWorking}
            className={cn(copy.destructive && buttonVariants({ variant: "destructive" }))}
          >
            {isWorking && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {copy.confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
