// 桜の花（五弁）。花びらの先端に切れ込みがあり、小さくても桜と分かる。
// 描画領域は図形（中心から半径17ほど）に合わせて余白を作らない。余白があると、横に並ぶ文字との間隔や中央揃えがずれるため。
const petal = "M0 0 C-7 -4 -9 -13 -4 -17 L0 -14 L4 -17 C9 -13 7 -4 0 0Z";
const petalAngles = [0, 72, 144, 216, 288];

export default function SakuraMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="-18 -18 36 36" className={className}>
      {petalAngles.map((angle) => <path key={angle} d={petal} transform={`rotate(${angle})`} className="sakura-petal" />)}
      <circle r="2.6" className="sakura-center" />
    </svg>
  );
}
