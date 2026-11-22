// 二枚の桜の花びらで作った「S」。花びらの先端には桜らしい切れ込みがあり、舞う花びらを右上と左下に添える。
// 描画領域は図形の外形（641×646）に合わせた正方形にして、余白を作らない。余白があると、横に並ぶ文字との間隔や中央揃えがずれるため。
const halfPetal = "M578 103 C520 88 470 82 440 83 C260 83 140 170 142 290 C145 380 250 445 348 453 C300 410 300 350 345 310 C400 262 480 245 540 205 C565 188 585 172 598 155 L548 150 Z";
const smallPetal = "M655 157 L658 192 L688 180 C698 215 680 262 568 272 C610 240 635 200 655 157 Z";
const center = "414.5 375";
// 二枚の花びらを上下に離す量。S の通り道（中央の空き）の幅になる。
const gap = 24;
const gradientId = "sakura-mark-gradient";

export default function SakuraMark({ className }: { className?: string }) {
  const fill = `url(#${gradientId})`;
  return (
    <svg aria-hidden="true" viewBox="121 43 650 650" className={className}>
      <defs>
        {/* 根元が濃く先端が淡い、桜の花びらの塗り分け。色はテーマごとのトークンで切り替える。 */}
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="330" y1="470" x2="590" y2="100">
          <stop offset="0" style={{ stopColor: "var(--ui-logo-base)" }} />
          <stop offset="0.55" style={{ stopColor: "var(--ui-logo-mid)" }} />
          <stop offset="1" style={{ stopColor: "var(--ui-logo-tip)" }} />
        </linearGradient>
      </defs>
      {/* 舞う花びらは大きな花びらの後ろに回し、間に差し込まれたように見せる。 */}
      <g transform={`translate(0 ${gap}) rotate(180 ${center})`}>
        <path d={smallPetal} className="logo-petal" transform="translate(535 284) rotate(20) scale(1.25) translate(-585 -262)" />
      </g>
      <g transform={`translate(0 ${-gap})`}>
        <path d={smallPetal} className="logo-petal" transform="translate(577 258) scale(1.8) translate(-585 -262)" />
        <path d={halfPetal} fill={fill} />
      </g>
      <path d={halfPetal} fill={fill} transform={`translate(0 ${gap}) rotate(180 ${center})`} />
      <circle cx="414.5" cy="375" r="28" className="logo-center" />
    </svg>
  );
}
