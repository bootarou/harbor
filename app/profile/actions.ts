"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { profileSchema } from "@/lib/validations";

export type ProfileFormState = {
  error?: string;
  success?: boolean;
};

// プロフィール更新（要ログイン、本人のみ）。
// 画像本体はクライアントが先に /api/upload へ送り、ここには avatarUrl 文字列のみ渡る。
export async function updateProfile(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "認証が必要です。再度ログインしてください。" };
  }

  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    bio: formData.get("bio"),
    xAccount: formData.get("xAccount"),
    avatarUrl: formData.get("avatarUrl"),
    tokushoho: formData.get("tokushoho"),
    salesTerms: formData.get("salesTerms"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }

  const { displayName, bio, xAccount, avatarUrl, tokushoho, salesTerms } =
    parsed.data;

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        displayName,
        bio: bio ? bio : null,
        xAccount: xAccount ? xAccount : null,
        avatarUrl: avatarUrl ? avatarUrl : null,
        tokushoho: tokushoho ? tokushoho : null,
        salesTerms: salesTerms ? salesTerms : null,
      },
    });
  } catch (error) {
    console.error("updateProfile error", error);
    return { error: "プロフィールの更新に失敗しました" };
  }

  revalidatePath("/profile");
  revalidatePath("/");
  return { success: true };
}
