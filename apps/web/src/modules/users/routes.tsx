import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { appRoute, requireAdmin } from "@/routes/app";
import { UsersPage } from "./users-page";

const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/users",
  beforeLoad: requireAdmin,
  component: UsersPage,
});

export const routes: AnyRoute[] = [usersRoute];
