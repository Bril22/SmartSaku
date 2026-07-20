export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-7 w-36 rounded-md bg-line/60" />
      <div className="h-40 rounded-lg bg-line/60" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 rounded-md bg-line/50" />
        <div className="h-20 rounded-md bg-line/50" />
      </div>
      <div className="space-y-2">
        <div className="h-16 rounded-md bg-line/50" />
        <div className="h-16 rounded-md bg-line/50" />
        <div className="h-16 rounded-md bg-line/50" />
      </div>
    </div>
  );
}
