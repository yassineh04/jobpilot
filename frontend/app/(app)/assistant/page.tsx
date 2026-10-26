"use client";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader, Skeleton } from "@/components/ui/Primitives";
import { AiNotConfigured, useAiStatus } from "@/components/ai/AiKit";
import { AgentConversation } from "@/components/agent/AgentChat";
import { useAgent } from "@/components/agent/AgentProvider";

export default function AgentPage() {
  const status = useAiStatus();
  const { messages, reset } = useAgent();

  if (!status) return <Skeleton className="h-96" />;

  if (!status.enabled) {
    return (
      <>
        <PageHeader title="JobPilot agent" description="Looks things up in your records and prepares changes for you" />
        <div className="max-w-2xl"><AiNotConfigured /></div>
      </>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col lg:h-[calc(100dvh-4rem)]">
      <PageHeader title="JobPilot agent"
                  description={`Ask about your search or tell it what happened. Every change waits for your confirmation. Runs on ${status.provider}${status.local ? " on this computer" : ", nothing to install"}.`}
                  actions={messages.length > 0 && <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />}
                                                          onClick={reset}>New conversation</Button>} />
      <AgentConversation variant="page" />
    </div>
  );
}
