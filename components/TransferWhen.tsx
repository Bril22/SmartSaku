"use client";

import DateField from "@/components/DateField";

export default function TransferWhen() {
  return <DateField name="date" mode="datetime" defaultNow title="Date & time" />;
}
