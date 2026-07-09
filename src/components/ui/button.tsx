import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-[background-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--cyan)] text-white shadow-[0_1px_0_0_rgba(255,255,255,0.15)_inset,0_1px_2px_rgba(15,60,100,0.25)] hover:bg-[var(--cyan-edge)]",
        destructive:
          "bg-danger text-white shadow-sm hover:bg-[var(--danger-edge)]",
        outline:
          "border border-[var(--border-strong)] bg-card text-foreground shadow-[0_1px_0_rgba(0,0,0,0.02)] hover:bg-paper-deep hover:border-[var(--warm)]/40",
        secondary:
          "bg-paper-deep text-foreground border border-border hover:bg-muted",
        ghost:
          "text-foreground hover:bg-paper-deep",
        subtle:
          "bg-primary-soft text-[var(--cyan-edge)] hover:bg-primary-soft/70",
        success:
          "bg-success text-white hover:bg-[var(--success-edge)]",
        warning:
          "bg-warning text-white hover:bg-[var(--warning-edge)]",
        link:
          "text-primary underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 rounded-md px-3 text-xs gap-1.5",
        lg: "h-11 rounded-lg px-6 text-[15px]",
        xl: "h-12 rounded-lg px-7 text-[15px] font-semibold",
        icon: "h-9 w-9",
        "icon-sm": "h-7 w-7 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
