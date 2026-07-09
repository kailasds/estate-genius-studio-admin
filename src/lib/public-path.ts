import type { LocationRewrite } from "@tanstack/react-router";

const INTERNAL_ROUTE_PREFIXES = [
  "/api",
  "/assets",
  "/dashboard",
  "/favicon.ico",
  "/faq",
  "/images",
  "/logo.svg",
  "/member",
  "/questions",
  "/rules",
  "/share",
  "/templates",
];

function isRouteBoundary(pathname: string, routePrefix: string) {
  return pathname === routePrefix || pathname.startsWith(`${routePrefix}/`);
}

export function splitMountedPath(pathname: string) {
  if (pathname === "/") {
    return { publicPathPrefix: "", internalPathname: "/" };
  }

  if (INTERNAL_ROUTE_PREFIXES.some((routePrefix) => isRouteBoundary(pathname, routePrefix))) {
    return { publicPathPrefix: "", internalPathname: pathname };
  }

  for (const routePrefix of INTERNAL_ROUTE_PREFIXES) {
    let index = pathname.indexOf(routePrefix);
    while (index > 0) {
      const hasRouteBoundary =
        pathname.length === index + routePrefix.length ||
        pathname[index + routePrefix.length] === "/";

      if (hasRouteBoundary) {
        return {
          publicPathPrefix: pathname.slice(0, index),
          internalPathname: pathname.slice(index),
        };
      }

      index = pathname.indexOf(routePrefix, index + 1);
    }
  }

  if (pathname.endsWith("/")) {
    return {
      publicPathPrefix: pathname.slice(0, -1),
      internalPathname: "/",
    };
  }

  return { publicPathPrefix: "", internalPathname: pathname };
}

function joinPublicPath(publicPathPrefix: string, pathname: string) {
  if (!publicPathPrefix) return pathname;
  return pathname === "/" ? `${publicPathPrefix}/` : `${publicPathPrefix}${pathname}`;
}

export function toPublicPath(pathname: string) {
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (typeof window === "undefined") return normalizedPathname;

  const { publicPathPrefix } = splitMountedPath(window.location.pathname);
  return joinPublicPath(publicPathPrefix, normalizedPathname);
}

export function toPublicUrl(pathname: string) {
  const publicPath = toPublicPath(pathname);
  if (typeof window === "undefined") return publicPath;
  return new URL(publicPath, window.location.origin).href;
}

export function createMountedPathRewrite(): LocationRewrite {
  let publicPathPrefix = "";

  return {
    input: ({ url }) => {
      const mountedPath = splitMountedPath(url.pathname);
      publicPathPrefix = mountedPath.publicPathPrefix;
      url.pathname = mountedPath.internalPathname;
      return url;
    },
    output: ({ url }) => {
      url.pathname = joinPublicPath(publicPathPrefix, url.pathname);
      return url;
    },
  };
}
