import { ConversationalAdvisor } from "@/components/advisor/ConversationalAdvisor";

export const dynamic = "force-dynamic";

// SKU browse grid intentionally omitted from the consumer surface — catalog
// access will live in the upcoming HABA MCP service, not in the homepage.
export default function HabaHomePage() {
  return (
    <main>
      <ConversationalAdvisor />
    </main>
  );
}
