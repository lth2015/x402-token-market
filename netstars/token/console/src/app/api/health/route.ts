// Console liveness — used by the K8s probe in infra/k8s/token/deployment.yaml
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", service: "token-console" });
}
