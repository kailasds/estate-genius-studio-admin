import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-[var(--border-strong)] bg-[var(--input-bg)] px-3.5 py-2.5 text-sm shadow-[0_1px_0_rgba(0,0,0,0.02)_inset] transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/70 hover:border-[var(--warm)]/50 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:bg-card disabled:cursor-not-allowed disabled:opacity-50 resize-y leading-relaxed",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
