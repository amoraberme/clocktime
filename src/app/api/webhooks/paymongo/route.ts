import { NextResponse } from "next/server";
import { verifyWebhookSignature, type PaymongoEvent } from "@/server/billing/paymongo";
import { handlePaymongoEvent } from "@/server/services/billing";

export async function POST(req: Request) {
  const raw = await req.text();
  if (
    !verifyWebhookSignature(
      raw,
      req.headers.get("paymongo-signature"),
      process.env.PAYMONGO_WEBHOOK_SECRET ?? "",
    )
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let event: PaymongoEvent;
  try {
    event = (JSON.parse(raw) as { data: PaymongoEvent }).data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const result = await handlePaymongoEvent(event);
    return NextResponse.json(result);
  } catch (err) {
    console.error("paymongo webhook failed", err);
    // 500 makes PayMongo retry later.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
