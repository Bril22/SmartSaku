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
  // cut the preview in JS rather than trusting a CSS clamp, so it can never
  // widen the card no matter what the surrounding layout does
  const preview =
    (last.role === "USER" ? "You: " : "") +
    (last.text.length > 90 ? last.text.slice(0, 90).trimEnd() + "…" : last.text);

  return (
    <div className="mt-3 min-w-0 bg-goodbg rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full min-w-0 px-3 py-2.5 flex items-start gap-2 text-left"
      >
        <span className="text-sm leading-5 shrink-0">🌱</span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="font-bold text-sagedeep text-[12px]">Saku-Kun</span>
            <span className="text-[10px] font-bold text-sagedeep/70 bg-card rounded-full px-1.5">
              {messages.length}
            </span>
          </span>
          {!open && (
            // two-line clamp wraps instead of nowrap, so it can never widen the card
            <span className="block text-[11.5px] text-inksoft leading-snug mt-0.5 break-words">
              {preview}
            </span>
          )}
        </span>
        <span
          className={`text-sagedeep text-xs shrink-0 mt-1 transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 min-w-0">
          <div className="space-y-2 max-h-80 overflow-y-auto overscroll-contain -mx-0.5 px-0.5">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "AI" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[85%] min-w-0 rounded-lg px-3 py-2 text-[12px] leading-relaxed break-words ${
                    m.role === "AI"
                      ? "bg-card text-ink rounded-tl-sm"
                      : "bg-sagedeep text-cream2 rounded-tr-sm"
                  }`}
                >
                  {m.text}
                  <div
                    className={`text-[9.5px] mt-1 ${m.role === "AI" ? "text-inksoft" : "text-cream2/70"}`}
                  >
                    {m.at}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <form action={replyToSaku} className="mt-2.5 space-y-2">
            <input type="hidden" name="id" value={goalId} />
            <input
              name="text"
              required
              maxLength={500}
              placeholder="Ask Saku-Kun about this goal…"
              className="w-full min-w-0 rounded-full border border-line bg-card px-3.5 py-2.5 text-[12.5px]"
            />
            <SubmitButton
              className="w-full rounded-full bg-sagedeep text-cream2 text-[11px] font-extrabold py-2.5"
              pendingText="Thinking…"
            >
              Send
            </SubmitButton>
          </form>

          <div className="flex items-center justify-between gap-2 mt-1.5">
            <p className="text-[9.5px] text-inksoft flex-1 min-w-0">
              AI information, not licensed financial advice
            </p>
            <form action={clearGoalChat} className="shrink-0">
              <input type="hidden" name="id" value={goalId} />
              <button className="text-[10.5px] font-extrabold text-inksoft">Clear</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
