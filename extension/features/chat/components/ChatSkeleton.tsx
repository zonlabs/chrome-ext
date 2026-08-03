function ShimmerBar({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[#1e1f20] ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#2d2e30] to-transparent animate-shimmer" />
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="flex flex-col h-screen bg-[#131314]">
      <div className="flex flex-col flex-1 h-full min-h-0 w-full max-w-3xl mx-auto">
        <div className="flex justify-between items-center px-4 h-14 w-full border-b border-[#3c4043]">
          <ShimmerBar className="w-30 h-4 rounded-lg" />
          <div className="flex items-center gap-3">
            <ShimmerBar className="w-7 h-7 rounded-full" />
            <ShimmerBar className="w-7 h-7 rounded-full" />
            <ShimmerBar className="w-7 h-7 rounded-full" />
          </div>
        </div>

        <div className="flex-1 px-3 pt-3 pb-1 flex flex-col gap-5 w-full overflow-hidden">
          <ShimmerBar className="flex-1 rounded-2xl w-full" />
        </div>

        <div className="p-2.5 w-full shrink-0">
          <ShimmerBar className="h-22 rounded-xl w-full" />
        </div>
      </div>
    </div>
  );
}
