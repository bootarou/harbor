import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { FollowListPage } from "@/components/follow-list-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { displayName: true },
  });
  return { title: user ? `${user.displayName} のフォロワー` : "フォロワー" };
}

export default async function FollowersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FollowListPage userId={id} mode="followers" />;
}
