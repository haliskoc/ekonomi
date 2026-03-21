export default function Loading() {
  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-[1500px] animate-pulse space-y-4">
        <div className="h-14 w-full rounded-lg border border-white/20 bg-white/5" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-64 rounded-lg border border-white/20 bg-white/5" />
          <div className="h-64 rounded-lg border border-white/20 bg-white/5 lg:col-span-2" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-80 rounded-lg border border-white/20 bg-white/5" />
          <div className="h-80 rounded-lg border border-white/20 bg-white/5" />
        </div>
      </div>
    </div>
  );
}
