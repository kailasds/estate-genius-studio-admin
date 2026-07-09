import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/member")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const role = window.localStorage.getItem("dep:active-role");
      if (role !== "member" && role !== "spouse") {
        throw redirect({ to: "/templates" });
      }
    }
  },
  component: () => <Outlet />,
});
