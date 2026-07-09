import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-tight transition-colors focus:outline-none focus:ring-2 focus:ring-ring [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary-soft text-[var(--cyan-edge)]",
        solid:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-paper-deep text-foreground",
        outline:
          "border-border bg-card text-foreground",
        destructive:
          "border-transparent bg-danger-soft text-[var(--danger-edge)]",
        success:
          "border-transparent bg-success-soft text-[var(--success-edge)]",
        warning:
          "border-transparent bg-warning-soft text-[var(--warning-edge)]",
        info:
          "border-transparent bg-info-soft text-[var(--info-edge)]",
        violet:
          "border-transparent bg-violet-soft text-[var(--violet-edge)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
