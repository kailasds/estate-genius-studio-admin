import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--input-bg)] px-3.5 py-2 text-sm shadow-[0_1px_0_rgba(0,0,0,0.02)_inset] transition-[border-color,box-shadow,background-color] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/70 hover:border-[var(--warm)]/50 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:bg-card disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
