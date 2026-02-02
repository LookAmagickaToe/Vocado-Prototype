export default function Loading() {
  return (
    <div className="min-h-screen bg-[#F2F0E9] text-[#3A3A3A] flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4">
        <img
          src="/card/card-back.png"
          alt="Loading"
          className="h-20 w-20 object-contain"
        />
        <div className="text-sm text-[#3A3A3A]/70">Loading Vocado…</div>
      </div>
    </div>
  )
}
