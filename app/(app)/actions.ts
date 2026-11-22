"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { deleteExpense, patch, updateExpense, type Patch } from "@/lib/expenses";

type Result = { error?: string };
const id = z.uuid();

export async function editExpense(expenseId: string, changes: Patch): Promise<Result> {
  const userId = await requireUserId();
  const p = patch.safeParse(changes);
  if (!id.safeParse(expenseId).success || !p.success) return { error: "입력값을 확인해 주세요." };
  const row = await withUser(userId, (q) => updateExpense(q, expenseId, p.data));
  if (!row) return { error: "지출을 찾을 수 없어요." };
  revalidatePath("/");
  return {};
}

export async function removeExpense(expenseId: string): Promise<Result> {
  const userId = await requireUserId();
  if (!id.safeParse(expenseId).success) return { error: "입력값을 확인해 주세요." };
  const row = await withUser(userId, (q) => deleteExpense(q, expenseId));
  if (!row) return { error: "지출을 찾을 수 없어요." };
  revalidatePath("/");
  return {};
}
