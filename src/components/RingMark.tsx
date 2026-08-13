type Props = {
  size?: number;
};

const MARK_SRC = "/velia-mark.png";

export function RingMark({ size = 26 }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={MARK_SRC}
      alt=""
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
      aria-hidden
      draggable={false}
    />
  );
}
