import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const role = window.localStorage.getItem("dep:active-role");
      if (role === "member" || role === "spouse") {
        throw redirect({ to: "/member" });
      }
    }
    throw redirect({ to: "/dashboard" });
  },
});
