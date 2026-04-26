"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

type PanelNavLinkProps = {
  href: Route;
  name: string;
  status: string;
};

export function PanelNavLink({ href, name, status }: PanelNavLinkProps) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} className={`aegis-rail-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
      <span>{name}</span>
      <span className="aegis-badge">{status}</span>
    </Link>
  );
}