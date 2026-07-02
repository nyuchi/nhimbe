import { NextResponse } from "next/server";
import { getCollection, DB } from "@/lib/mongo/databases";

/**
 * GET /api/categories — interest categories from MongoDB
 * (engagement.interestCategories), replacing the worker's Supabase-backed
 * categories endpoint. Shape matches what src/lib/api.ts getCategories expects.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface InterestCategoryDoc {
  slug: string;
  name: string;
  groupName?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export async function GET() {
  try {
    const col = await getCollection<InterestCategoryDoc>(DB.engagement, "interestCategories");
    const docs = await col.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).toArray();
    const categories = docs.map((d) => ({
      id: d.slug,
      name: d.name,
      group: d.groupName ?? "Categories",
    }));
    return NextResponse.json({ categories });
  } catch (err) {
    console.error("[mukoko] GET /api/categories failed", err);
    return NextResponse.json({ categories: [] }, { status: 200 });
  }
}
