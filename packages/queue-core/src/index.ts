export interface BatchPolicy {
  maxItems: number;
  maxDelayMs: number;
}

export interface BatchFlushResult<TItem> {
  items: TItem[];
  reason: "max_items" | "max_delay" | "manual";
}

export class MicroBatcher<TItem> {
  private readonly items: TItem[] = [];
  private timer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly policy: BatchPolicy,
    private readonly flushHandler: (result: BatchFlushResult<TItem>) => Promise<void>,
  ) {}

  public async add(item: TItem): Promise<void> {
    this.items.push(item);

    if (this.items.length >= this.policy.maxItems) {
      await this.flush("max_items");
      return;
    }

    this.timer ??= setTimeout(() => {
      void this.flush("max_delay");
    }, this.policy.maxDelayMs);
  }

  public async flush(reason: BatchFlushResult<TItem>["reason"] = "manual"): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (this.items.length === 0) {
      return;
    }

    const items = this.items.splice(0, this.items.length);
    await this.flushHandler({ items, reason });
  }
}

export function createIdempotencyKey(parts: readonly string[]): string {
  return parts.map((part) => part.replaceAll(":", "_")).join(":");
}
