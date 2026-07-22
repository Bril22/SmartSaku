"use client";

import { useState } from "react";
import { clearGoalChat, replyToSaku } from "@/app/goals/actions";
import SubmitButton from "@/components/SubmitButton";

export type ChatMessage = { id: string; role: "USER" | "AI"; text: string; at: string };

export default function GoalChat({
  goalId,
  messages,
}: {
  goalId: string;
  messages: ChatMessage[];
}) {
  const [open, setOpen] = useState(false);
  if (messages.length === 0) return null;
  const last = messages[messages.length - 1];

  return (
    <div className="mt-3 bg-goodbg rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full px-3 py-2.5 flex items-center gap-2 text-left"
      >
        <span className="text-sm">🌱</span>
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-sagedeep text-[12px]">
            Saku-Kun · {messages.length} message{messages.length === 1 ? "" : "s"}
          </span>
          {!open && (
            <span className="block text-[11.5px] text-inksoft truncate">{last.text}</span>
          )}
        </span>
        <span className={`text-sagedeep text-xs transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-md px-3 py-2 text-[12px] leading-relaxed ${
                m.role === "AI" ? "bg-card text-ink" : "bg-sagedeep text-cream2 ml-6"
              }`}
            >
              {m.role === "AI" && (
                <div className="font-bold text-sagedeep text-[10.5px] mb-0.5">Saku-Kun</div>
              )}
              {m.text}
              <div
                className={`text-[9.5px] mt-1 ${m.role === "AI" ? "text-inksoft" : "text-cream2/70"}`}
              >
                {m.at}
              </div>
            </div>
          ))}

          <form action={replyToSaku} className="flex gap-2 pt-1">
            <input type="hidden" name="id" value={goalId} />
            <input
              name="text"
              required
              maxLength={500}
              placeholder="Ask Saku-Kun about this goal…"
              className="flex-1 min-w-0 rounded-full border border-line bg-card px-3.5 py-2.5 text-[12.5px]"
            />
            <SubmitButton
              className="rounded-full bg-sagedeep text-cream2 text-[11px] font-extrabold px-4 py-2.5 shrink-0"
              pendingText="…"
            >
              Send
            </SubmitButton>
          </form>

          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[9.5px] text-inksoft">
              AI information, not licensed financial advice
            </span>
            <form action={clearGoalChat}>
              <input type="hidden" name="id" value={goalId} />
              <button className="text-[10px] font-extrabold text-inksoft">Clear chat</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
