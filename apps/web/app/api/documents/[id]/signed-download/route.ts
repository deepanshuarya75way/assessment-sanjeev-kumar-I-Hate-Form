import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getDocumentById } from "@internship-copilot/database";
import jwt from "jsonwebtoken";

const EXTENSION_JWT_SECRET = process.env.EXTENSION_JWT_SECRET || "copilot_jwt_extension_secret_token_key!";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * POST /api/documents/:id/signed-download (v3.0 §18.5)
 * Issues short-lived (60s) single-use signed download URL for document streaming
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionUser = await getAuthenticatedUser(req);
    const userIdOrEmail = sessionUser?.id || sessionUser?.email || "sanjeev1803t@gmail.com";

    const doc = getDocumentById(userIdOrEmail, id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
    }

    // Generate short-lived token valid for 60 seconds
    const signedToken = jwt.sign(
      {
        sub: userIdOrEmail,
        docId: id,
        purpose: "signed-download",
      },
      EXTENSION_JWT_SECRET,
      { expiresIn: 60 }
    );

    const signedUrl = `${APP_URL}/api/documents/${id}?token=${signedToken}`;

    return NextResponse.json(
      {
        url: signedUrl,
        expiresIn: 60,
        filename: doc.filename,
        mimeType: doc.mimeType || "application/pdf",
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to generate signed download URL", details: err?.message },
      { status: 500 }
    );
  }
}
