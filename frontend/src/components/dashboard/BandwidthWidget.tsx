import { BandwidthStats } from "../../types";
import { formatBytes } from "../../utils";

interface BandwidthWidgetProps {
  bandwidth: BandwidthStats | null;
}

const DAILY_QUOTA = 250 * 1024 * 1024 * 1024; // 250 GB per day

export function BandwidthWidget({ bandwidth }: BandwidthWidgetProps) {
  if (!bandwidth) return null;

  const consumed = bandwidth.up_bytes + bandwidth.down_bytes;
  const usedPercent = Math.min((consumed / DAILY_QUOTA) * 100, 100);

  return (
    <div className="mt-3 text-xs text-telegram-subtext">
      <div className="mb-1 flex items-baseline justify-between">
        <span>
          Used today:{" "}
          <strong className="text-telegram-primary">{formatBytes(consumed)}</strong>
        </span>
        <span className="text-[10px] opacity-70">of 250 GB</span>
      </div>
      <progress
        className="h-1.5 w-full overflow-hidden rounded-full bg-telegram-border [&::-webkit-progress-bar]:bg-telegram-border [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-telegram-primary"
        value={usedPercent}
        max={100}
      />
    </div>
  );
}
