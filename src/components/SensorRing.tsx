import { useId } from "react";

type Props = {
  tone?: "light" | "dark";
  className?: string;
};

const SENSORS = [
  { deg: -90, name: "Sensor 1" },
  { deg: 30, name: "Sensor 2" },
  { deg: 150, name: "Sensor 3" },
];

function point(deg: number, radius: number) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: 100 + radius * Math.cos(rad),
    y: 100 + radius * Math.sin(rad),
  };
}

export function SensorRing({ tone = "dark", className = "" }: Props) {
  const id = useId().replace(/:/g, "");
  const gold = tone === "dark" ? "#dcbd7c" : "#b8934a";
  const band = tone === "dark" ? "#8a6a2f" : "#17120d";
  const dot = tone === "dark" ? "#faf7f1" : "#17120d";

  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label="Ring diagram with three sensor points spaced around the inside"
    >
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a7045" /><stop offset=".2" stopColor="#f4e9ca" /><stop offset=".42" stopColor="#c5ac76" /><stop offset=".64" stopColor="#f8efd9" /><stop offset=".82" stopColor="#a38952" /><stop offset="1" stopColor="#d7c18e" />
        </linearGradient>
        <linearGradient id={`${id}-inner`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#121212" /><stop offset=".5" stopColor="#3a3a3a" /><stop offset="1" stopColor="#121212" /></linearGradient>
      </defs>
      <circle cx="100" cy="104" r="79" fill="none" stroke="#121212" strokeOpacity=".08" strokeWidth="19" />
      <circle cx="100" cy="100" r="77" fill="none" stroke={band} strokeWidth="17" />
      <circle cx="100" cy="100" r="77" fill="none" stroke={`url(#${id}-metal)`} strokeWidth="15" />
      <circle cx="100" cy="100" r="66" fill="none" stroke={`url(#${id}-inner)`} strokeWidth="8" />
      <circle cx="100" cy="100" r="85" fill="none" stroke="#f8efd9" strokeOpacity=".65" strokeWidth="1" />
      {SENSORS.map((sensor) => {
        const at = point(sensor.deg, 65);
        return (
          <g key={sensor.name}>
            <circle cx={at.x} cy={at.y} r="7" fill="#121212" stroke={gold} strokeWidth="1" />
            <circle cx={at.x} cy={at.y} r="2.5" fill={dot} />
          </g>
        );
      })}
    </svg>
  );
}
