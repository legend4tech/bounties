import { NextRequest, NextResponse } from "next/server";
import { SparkCreditsService } from "@/lib/services/spark-credits";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId } = await context.params;
  const { searchParams } = request.nextUrl;
  const limit = searchParams.get("limit")
    ? Number(searchParams.get("limit"))
    : 20;
  const offset = searchParams.get("offset")
    ? Number(searchParams.get("offset"))
    : 0;
  const history = await SparkCreditsService.getCreditHistory(
    userId,
    limit,
    offset,
  );
  return NextResponse.json(history);
}
