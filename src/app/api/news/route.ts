import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const category = searchParams.get("category");
  const chefSlug = searchParams.get("chef");
  const source = searchParams.get("source");
  const search = searchParams.get("search");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const sortBy = searchParams.get("sortBy") || "date";
  const impactLevel = searchParams.get("impactLevel");
  const tasteOnly = searchParams.get("tasteOnly");

  const where: Record<string, unknown> = {};

  // Taste toggle: when tasteOnly is set, only show taste-relevant items
  if (tasteOnly === "true") {
    where.isTasteRelevant = true;
  }

  if (category) {
    const categories = category.split(",").filter(Boolean);
    if (categories.length === 1) {
      where.category = categories[0];
    } else if (categories.length > 1) {
      where.category = { in: categories };
    }
  }

  if (source) {
    where.source = { contains: source };
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { summary: { contains: search } },
    ];
  }

  if (dateFrom || dateTo) {
    where.publishedAt = {};
    if (dateFrom) (where.publishedAt as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.publishedAt as Record<string, unknown>).lte = new Date(dateTo);
  }

  if (chefSlug) {
    where.chefs = {
      some: {
        chef: { slug: chefSlug },
      },
    };
  }

  // Impact level filter
  if (impactLevel === "high") {
    where.relevanceScore = { gte: 70 };
  } else if (impactLevel === "medium") {
    where.relevanceScore = { gte: 40, lt: 70 };
  } else if (impactLevel === "notable") {
    where.relevanceScore = { gte: 1, lt: 40 };
  }

  // Dynamic orderBy
  let orderBy: Record<string, string>[] | Record<string, string>;
  if (sortBy === "relevance") {
    orderBy = [{ relevanceScore: "desc" }, { publishedAt: "desc" }];
  } else {
    orderBy = { publishedAt: "desc" };
  }

  const chefInclude = {
    include: {
      chef: {
        select: { name: true, slug: true, totalScore: true },
      },
    },
  };

  const [items, total, totalTasteRelevant] = await Promise.all([
    prisma.newsItem.findMany({
      where,
      include: {
        chefs: chefInclude,
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.newsItem.count({ where }),
    prisma.newsItem.count({ where: { ...where, isTasteRelevant: true } }),
  ]);

  // For chefScore sort, sort in application code
  let sortedItems = items;
  if (sortBy === "chefScore") {
    sortedItems = [...items].sort((a, b) => {
      const aMax = Math.max(0, ...a.chefs.map((c) => c.chef.totalScore));
      const bMax = Math.max(0, ...b.chefs.map((c) => c.chef.totalScore));
      return bMax - aMax;
    });
  }

  // Get last fetched timestamp
  const lastFetched = await prisma.newsItem.findFirst({
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true },
  });

  return NextResponse.json({
    items: sortedItems,
    total,
    totalTasteRelevant,
    page,
    limit,
    lastFetched: lastFetched?.fetchedAt || null,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const { title, url, source, imageUrl, summary, category, publishedAt, chefSlugs, relevanceScore, isTasteRelevant } = body;

  if (!title || !url || !source || !category || !publishedAt) {
    return NextResponse.json(
      { error: "title, url, source, category, and publishedAt are required" },
      { status: 400 }
    );
  }

  // Check for duplicate URL
  const existing = await prisma.newsItem.findUnique({ where: { url } });
  if (existing) {
    return NextResponse.json({ error: "Article with this URL already exists" }, { status: 409 });
  }

  const newsItem = await prisma.newsItem.create({
    data: {
      title,
      url,
      source,
      imageUrl: imageUrl || null,
      summary: summary || null,
      category,
      publishedAt: new Date(publishedAt),
      relevanceScore: relevanceScore ?? 50,
      isTasteRelevant: isTasteRelevant ?? true,
    },
  });

  // Link to chefs if provided
  if (chefSlugs && Array.isArray(chefSlugs)) {
    for (const slug of chefSlugs) {
      const chef = await prisma.chef.findUnique({ where: { slug } });
      if (chef) {
        await prisma.newsItemChef.create({
          data: { newsItemId: newsItem.id, chefId: chef.id },
        });
      }
    }
  }

  const result = await prisma.newsItem.findUnique({
    where: { id: newsItem.id },
    include: {
      chefs: {
        include: { chef: { select: { name: true, slug: true } } },
      },
    },
  });

  return NextResponse.json(result, { status: 201 });
}
