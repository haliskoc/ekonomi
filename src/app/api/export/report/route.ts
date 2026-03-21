import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rateLimit";
import { createRequestId, getClientIp, jsonError, jsonSuccess, mergeHeaders } from "@/lib/api";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_COUNT = 30;

const schema = z.object({
  format: z.enum(["json", "pdf"]),
  title: z.string().trim().min(1).max(120),
  payload: z.record(z.string(), z.unknown()),
});

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildSimplePdf(lines: string[]): string {
  const text = lines.map((line, index) => `1 0 0 1 50 ${780 - index * 16} Tm (${escapePdfText(line)}) Tj`).join("\n");
  const stream = `BT\n/F1 11 Tf\n${text}\nET`;

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  const clientIp = getClientIp(request);
  const rate = checkRateLimit({
    key: `export-report:${clientIp}`,
    limit: RATE_LIMIT_COUNT,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!rate.allowed) {
    return jsonError("too many requests", 429, {
      requestId,
      code: "RATE_LIMITED",
      headers: {
        "retry-after": String(rate.retryAfterSeconds),
      },
    });
  }

  try {
    const raw = await request.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "invalid body", 400, {
        requestId,
        code: "INVALID_BODY",
      });
    }

    if (parsed.data.format === "json") {
      return jsonSuccess(
        {
          title: parsed.data.title,
          exportedAt: new Date().toISOString(),
          payload: parsed.data.payload,
        },
        { requestId }
      );
    }

    const lines = [
      parsed.data.title,
      `Generated: ${new Date().toISOString()}`,
      "",
      ...JSON.stringify(parsed.data.payload, null, 2)
        .split("\n")
        .slice(0, 40),
    ];

    const bytes = buildSimplePdf(lines);
    const headers = new Headers();
    headers.set("content-type", "application/pdf");
    headers.set("content-disposition", `attachment; filename=report-${Date.now()}.pdf`);
    const securityHeaders = mergeHeaders(undefined, requestId);
    securityHeaders.forEach((value: string, key: string) => {
      headers.set(key, value);
    });

    return new NextResponse(bytes, {
      status: 200,
      headers,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "unexpected error", 500, {
      requestId,
      code: "INTERNAL_ERROR",
    });
  }
}
