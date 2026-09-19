import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        default: "border-border bg-surface-raised text-text",
        success: "border-success bg-surface text-success",
        warning: "border-warning bg-surface text-warning",
        danger: "border-danger bg-surface text-danger",
        info: "border-info bg-surface text-info",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  },
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

function Badge({ className, tone, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
