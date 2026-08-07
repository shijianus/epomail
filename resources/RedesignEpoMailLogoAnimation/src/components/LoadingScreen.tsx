import EpoMailMark from './EpoMailMark'

export default function LoadingScreen() {
  return (
    <div className="epo-stage grid min-h-screen w-full place-items-center overflow-hidden bg-[#0B0F19]">
      <div className="epo-rise w-[min(46vmin,300px)]">
        <EpoMailMark />
      </div>
    </div>
  )
}
