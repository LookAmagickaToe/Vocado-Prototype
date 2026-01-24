export default function Loading() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4">
        <img
          src="card/card-back.png"
          alt="Loading"
          className="h-20 w-20 object-contain opacity-90"
        />
        <div className="text-sm text-neutral-300">Loading vocado…</div>
      </div>
    </div>
  )
}
