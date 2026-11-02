import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readDatabase, updateUserProfile, StoredProfile } from "@internship-copilot/database";
import { getStoredProfileData } from "@/lib/profile-helper";

function findUser(db:ReturnType < typeof readDatabase>, key?:string | null){
  if(!key) return undefined;
  return(
    db.users[key] || 
    Object.values(db.users) .find((u) => u.email.toLowerCase() === key.toLowerCase())
  );
}

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getAuthenticatedUser(req);
    const key = sessionUser?.id || sessionUser?.email || "user_sanjeev";
    const user = findUser(readDatabase(), key);
    return NextResponse.json({savedAnswers: (user?.profile as any)?.savedAnswers ?? {} });
  } catch {
    return NextResponse.json({error:"Failed to fetch saved Answer"}, {status: 500});
  }
}


export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getAuthenticatedUser(req);
    const key = sessionUser?.id || sessionUser?.email || "user_sanjeev"; 
    const body = await req.json();

    const normalizedLabel = String(body.normalizedLabel || "").trim().toLowerCase();
    const value = String(body.value || "").trim();
    const rawLabel = String(body.rawLabel || normalizedLabel).trim();

    if(!normalizedLabel || normalizedLabel.length > 200 || !value || value.length > 2000){
      return NextResponse.json({error: "Invald label or Value"}, {status: 400});
    }
    if(/password|otp|card|cvv|snn/i.test(normalizedLabel)){
      return NextResponse.json({error: "This field cannot be saved"}, {status: 400});
    }
    
    const existingUser = findUser(readDatabase(), key);
    const current = (existingUser?.profile ?? (await getStoredProfileData(key)) ?? {}) as StoredProfile;
    
    const savedAnswers = {
      ...((current as any).savedAnswers || {}),
      [normalizedLabel]: {
        rawLabel, 
        value,
        type: body.type ? String(body.type) : undefined,
        updatedAt: new Date().toISOString(),
      },
    };

    const updated = updateUserProfile(
  key,
  { ...current, savedAnswers } as StoredProfile
);

const persisted = (updated.profile as any)?.savedAnswers;
    
    if(!persisted){
      return NextResponse.json({error: "savedAnswers was not persisted by updatedUserProfile"}, {status : 500});
    }
    return NextResponse.json({success: true, savedAnswers: persisted});
  }
  catch(err){
    console.error("Save Answer error:", err);
    return NextResponse.json({error:"Failed to save answer"}, {status: 500});
  }
}