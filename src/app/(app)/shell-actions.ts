"use server";

import { act } from "@/server/action";
import { searchAll } from "@/server/domain/search";

export async function searchAction(q: string) {
  return act(({ ctx }) => searchAll(ctx, q));
}
